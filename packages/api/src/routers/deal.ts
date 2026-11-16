import { prisma } from "@repo/database";
import { router, protectedProcedure } from "../trpc.js";
import {
  DealRemove,
  DealSet,
  DealWatchRemove,
  DealWatchSet,
} from "../schemas.js";

// Offers run to the end of their last day where the shops are, not in UTC.
const DEAL_TIME_ZONE = "Europe/Oslo";
const GLOBAL_EXTRA_WEEK_START = new Date("1970-01-05T00:00:00.000Z");

/** Today's calendar date in the shops' time zone, as UTC midnight. */
export function dealToday(now: Date = new Date()): Date {
  // en-CA formats as YYYY-MM-DD.
  const dateOnly = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parseDateOnly(dateOnly);
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

const toDateOnly = (value: Date) => value.toISOString().slice(0, 10);

type StoredDeal = {
  store: string;
  price: string;
  regularPrice: string | null;
  product: string | null;
  validFrom: Date | null;
  validTo: Date;
  addedByDeal: boolean;
};

export function toDealDTO(deal: StoredDeal) {
  return {
    store: deal.store,
    price: deal.price,
    regularPrice: deal.regularPrice,
    product: deal.product,
    validFrom: deal.validFrom ? toDateOnly(deal.validFrom) : null,
    validTo: toDateOnly(deal.validTo),
    addedByDeal: deal.addedByDeal,
  };
}

/**
 * Drop offers whose last day has passed. An item that is only on the list
 * because of the offer goes with it, unless it was bought (checked items
 * linger as history like any other).
 */
export async function purgeExpiredDeals(householdId: string) {
  const expired = { householdId, validTo: { lt: dealToday() } };
  // Nearly always nothing: keep the common read free of writes.
  if (!(await prisma.shoppingDeal.count({ where: expired }))) return;

  // Both deletes decide for themselves what has expired, rather than work
  // from a list read earlier: an offer replaced in the meantime, and the
  // item it put on the list, must survive.
  await prisma.$transaction([
    prisma.extraShoppingItem.deleteMany({
      where: {
        householdId,
        checked: false,
        catalogItem: { deal: { is: { ...expired, addedByDeal: true } } },
      },
    }),
    prisma.shoppingDeal.deleteMany({ where: expired }),
  ]);
}

const sameText = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

export const dealRouter = router({
  /** Offers currently on the shopping list. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const householdId = ctx.householdId;
    await purgeExpiredDeals(householdId);
    const deals = await prisma.shoppingDeal.findMany({
      where: { householdId },
      include: { catalogItem: { include: { extras: true } } },
      orderBy: { validTo: "asc" },
    });
    return deals.map((deal) => ({
      name: deal.catalogItem.name,
      // Bought on this offer already.
      checked:
        deal.catalogItem.extras.length > 0 &&
        deal.catalogItem.extras.every((row) => row.checked),
      ...toDealDTO(deal),
    }));
  }),

  /**
   * Put offers on the shopping list. The item is added if it is not there;
   * if it is, the offer is attached to it. One offer per item: a new one
   * replaces the old.
   */
  set: protectedProcedure.input(DealSet).mutation(async ({ input, ctx }) => {
    const householdId = ctx.householdId;
    await purgeExpiredDeals(householdId);
    const today = dealToday();

    const saved: {
      name: string;
      status: "added" | "attached" | "updated" | "alreadyBought";
    }[] = [];
    const skipped: { name: string; reason: "expired" }[] = [];

    for (const deal of input.deals) {
      const name = deal.name.trim();
      const validTo = parseDateOnly(deal.validTo);
      if (validTo < today) {
        skipped.push({ name, reason: "expired" });
        continue;
      }

      // A new item takes the watchlist's spelling ("Kaffe"), not whatever
      // casing the offer was reported with.
      const watched = await prisma.dealWatchItem.findUnique({
        where: { name_householdId: { name, householdId } },
        select: { name: true },
      });
      const catalog = await prisma.extraItemCatalog.upsert({
        where: { name_householdId: { name, householdId } },
        update: {},
        create: { name: watched?.name ?? name, householdId },
      });
      const [existing, rows] = await Promise.all([
        prisma.shoppingDeal.findUnique({
          where: { catalogItemId: catalog.id },
        }),
        prisma.extraShoppingItem.findMany({
          where: { catalogItemId: catalog.id, householdId },
        }),
      ]);

      const onList = rows.some((row) => !row.checked);
      const sameOffer =
        existing != null &&
        sameText(existing.store, deal.store) &&
        sameText(existing.price, deal.price) &&
        existing.validTo.getTime() === validTo.getTime();

      let status: (typeof saved)[number]["status"];
      let addedByDeal: boolean;
      if (onList) {
        status = existing ? "updated" : "attached";
        addedByDeal = existing?.addedByDeal ?? false;
      } else if (sameOffer) {
        // Checked off since the offer was reported: bought. A repeated run
        // of the same job must not put it back.
        status = "alreadyBought";
        addedByDeal = existing.addedByDeal;
      } else {
        status = "added";
        addedByDeal = true;
      }

      const fields = {
        store: deal.store.trim(),
        price: deal.price.trim(),
        regularPrice: deal.regularPrice?.trim() || null,
        product: deal.product?.trim() || null,
        validFrom: deal.validFrom ? parseDateOnly(deal.validFrom) : null,
        validTo,
        addedByDeal,
      };

      await prisma.$transaction(async (tx) => {
        if (status === "added") {
          await tx.extraShoppingItem.upsert({
            where: {
              weekStart_catalogItemId_householdId: {
                weekStart: GLOBAL_EXTRA_WEEK_START,
                catalogItemId: catalog.id,
                householdId,
              },
            },
            create: {
              weekStart: GLOBAL_EXTRA_WEEK_START,
              catalogItemId: catalog.id,
              checked: false,
              householdId,
            },
            update: { checked: false },
          });
          await tx.extraShoppingItem.updateMany({
            where: { catalogItemId: catalog.id, householdId },
            data: { checked: false },
          });
        }
        await tx.shoppingDeal.upsert({
          where: { catalogItemId: catalog.id },
          create: { catalogItemId: catalog.id, householdId, ...fields },
          update: fields,
        });
      });

      saved.push({ name: catalog.name, status });
    }

    return { saved, skipped };
  }),

  /**
   * Take offers off the list. An item the offer put there is removed with
   * it; an item that was on the list anyway just loses the offer.
   */
  remove: protectedProcedure
    .input(DealRemove)
    .mutation(async ({ input, ctx }) => {
      const householdId = ctx.householdId;
      const removed: { name: string; itemRemoved: boolean }[] = [];
      const notFound: string[] = [];

      for (const rawName of input.names) {
        const deal = await prisma.shoppingDeal.findFirst({
          where: { householdId, catalogItem: { name: rawName.trim() } },
          include: { catalogItem: true },
        });
        if (!deal) {
          notFound.push(rawName);
          continue;
        }
        await prisma.shoppingDeal.delete({ where: { id: deal.id } });
        const items = deal.addedByDeal
          ? await prisma.extraShoppingItem.deleteMany({
              where: {
                householdId,
                catalogItemId: deal.catalogItemId,
                checked: false,
              },
            })
          : { count: 0 };
        removed.push({
          name: deal.catalogItem.name,
          itemRemoved: items.count > 0,
        });
      }

      return { removed, notFound };
    }),

  /** Products the household wants to hear about when they are on offer. */
  watchList: protectedProcedure.query(async ({ ctx }) => {
    const items = await prisma.dealWatchItem.findMany({
      where: { householdId: ctx.householdId },
      orderBy: { name: "asc" },
    });
    return items.map((item) => ({ name: item.name, note: item.note }));
  }),

  watchSet: protectedProcedure
    .input(DealWatchSet)
    .mutation(async ({ input, ctx }) => {
      const householdId = ctx.householdId;
      const saved: { name: string; note: string | null }[] = [];
      for (const item of input.items) {
        const name = item.name.trim();
        // An omitted note keeps the stored one; null or "" clears it.
        const note =
          item.note === undefined ? undefined : item.note?.trim() || null;
        const row = await prisma.dealWatchItem.upsert({
          where: { name_householdId: { name, householdId } },
          create: { name, householdId, note: note ?? null },
          update: note === undefined ? {} : { note },
        });
        saved.push({ name: row.name, note: row.note });
      }
      return { saved };
    }),

  watchRemove: protectedProcedure
    .input(DealWatchRemove)
    .mutation(async ({ input, ctx }) => {
      const householdId = ctx.householdId;
      const removed: string[] = [];
      const notFound: string[] = [];
      for (const rawName of input.names) {
        const { count } = await prisma.dealWatchItem.deleteMany({
          where: { householdId, name: rawName.trim() },
        });
        (count > 0 ? removed : notFound).push(rawName.trim());
      }
      return { removed, notFound };
    }),
});
