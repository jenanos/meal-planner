import { describe, expect, it } from "vitest";
import { RECIPES, connect, fakeApi, trpcError, weekPlan } from "./helpers/mcp";

const byId = Object.fromEntries(
  Object.values(RECIPES).map((recipe) => [recipe.id, recipe]),
);

describe("tool catalogue", () => {
  it("offers the admin tools only to administrators", async () => {
    const { api } = fakeApi({});
    const asUser = await connect({ api });
    const asAdmin = await connect({ api, isAdmin: true });

    const userTools = (await asUser.client.listTools()).tools.map(
      (t) => t.name,
    );
    const adminTools = (await asAdmin.client.listTools()).tools.map(
      (t) => t.name,
    );

    expect(userTools.filter((name) => name.startsWith("admin-"))).toEqual([]);
    expect(
      adminTools.filter((name) => name.startsWith("admin-")).sort(),
    ).toEqual([
      "admin-add-allowed-email",
      "admin-create-household",
      "admin-delete-household",
      "admin-list-allowed-emails",
      "admin-list-households",
      "admin-list-users",
      "admin-remove-allowed-email",
      "admin-remove-household-member",
      "admin-rename-household",
      "admin-set-household-member",
      "admin-set-user-role",
    ]);
    expect(adminTools.length - userTools.length).toBe(11);
  });

  it("describes and annotates every tool", async () => {
    const { api } = fakeApi({});
    const { client } = await connect({ api, isAdmin: true });
    const { tools } = await client.listTools();

    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
    for (const tool of tools) {
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.description?.length ?? 0, tool.name).toBeGreaterThan(20);
      expect(tool.inputSchema.type, tool.name).toBe("object");
      expect(typeof tool.annotations?.readOnlyHint, tool.name).toBe("boolean");
      expect(tool.annotations?.openWorldHint, tool.name).toBe(false);
      // Anything that is not read-only has to say whether it destroys data.
      if (!tool.annotations?.readOnlyHint) {
        expect(typeof tool.annotations?.destructiveHint, tool.name).toBe(
          "boolean",
        );
      }
    }
  });

  it("marks every tool that can delete or replace data as destructive", async () => {
    const { api } = fakeApi({});
    const { client } = await connect({ api, isAdmin: true });
    const { tools } = await client.listTools();
    const destructive = tools
      .filter((tool) => tool.annotations?.destructiveHint)
      .map((tool) => tool.name)
      .sort();

    expect(destructive).toEqual([
      "adjust-freezer-portions",
      "admin-delete-household",
      "admin-remove-allowed-email",
      "admin-remove-household-member",
      "delete-recipe",
      "delete-shopping-package",
      "generate-week-plan",
      "merge-extra-catalog-items",
      "merge-ingredients",
      "remove-extra-shopping-items",
      "set-freezer-item",
      "set-week-plan-days",
      "update-recipe",
      "update-shopping-package",
    ]);

    // Repeating these gives a different result each time, so a client must
    // not retry them blindly.
    const idempotent = (name: string) =>
      tools.find((tool) => tool.name === name)?.annotations?.idempotentHint;
    expect(idempotent("generate-week-plan")).toBe(false);
    expect(idempotent("adjust-freezer-portions")).toBe(false);
    expect(idempotent("delete-recipe")).toBe(true);
  });

  it("sends instructions and prompts along with the tools", async () => {
    const { api } = fakeApi({});
    const { client } = await connect({ api });

    expect(client.getInstructions()).toContain("dayIndex 0 = mandag");
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual([
      "handleliste",
      "planlegg-uka",
      "rydd-i-varer",
    ]);
    const prompt = await client.getPrompt({
      name: "planlegg-uka",
      arguments: { onsker: "fisk to ganger" },
    });
    expect(JSON.stringify(prompt.messages)).toContain("fisk to ganger");
  });
});

describe("errors", () => {
  it("flags failures as errors and explains API permission codes", async () => {
    const { api } = fakeApi({
      "freezer.list": () => {
        throw trpcError("UNAUTHORIZED", "Du må være logget inn.");
      },
    });
    const { call } = await connect({ api });

    const result = await call("list-freezer");

    expect(result.isError).toBe(true);
    expect(result.data.ok).toBe(false);
    expect(result.data.error).toContain("Kunne ikke hente fryserbeholdning");
    expect(result.data.error).toContain("medlem av en husholdning");
  });

  it("rejects input that does not match the schema", async () => {
    const { api, calls } = fakeApi({});
    const { client } = await connect({ api });

    const result = await client.callTool({
      name: "set-week-plan-days",
      arguments: { changes: [{ dayIndex: 9, type: "EMPTY" }] },
    });

    expect(result.isError).toBe(true);
    expect(calls).toEqual([]);
  });
});

describe("get-context", () => {
  it("reports the date and week in the user's time zone, not UTC", async () => {
    const { api } = fakeApi({
      "admin.whoAmI": () => ({
        user: {
          id: "u1",
          name: "Kari",
          email: "kari@example.com",
          role: "ADMIN",
        },
        household: { id: "h1", name: "Hjemme" },
      }),
    });
    // Sunday 23:30 UTC is already Monday 00:30 in Oslo.
    const { call } = await connect({
      api,
      now: new Date("2026-11-08T23:30:00.000Z"),
    });

    const { data } = await call("get-context");

    expect(data).toMatchObject({
      today: "2026-11-09",
      weekday: "mandag",
      currentWeekStart: "2026-11-09",
      nextWeekStart: "2026-11-16",
      isAdmin: true,
      household: { name: "Hjemme" },
    });
  });
});

describe("week plan", () => {
  it("resolves week aliases and any date in the week to its Monday", async () => {
    const { api, callsTo } = fakeApi({
      "planner.getWeekPlan": ({ weekStart }) =>
        weekPlan(weekStart.slice(0, 10)),
    });
    const { call } = await connect({ api });

    await call("get-week-plan");
    await call("get-week-plan", { week: "next" });
    await call("get-week-plan", { week: "2026-11-01" }); // a Sunday

    expect(callsTo("planner.getWeekPlan")).toEqual([
      { weekStart: "2026-11-09T00:00:00.000Z" },
      { weekStart: "2026-11-16T00:00:00.000Z" },
      { weekStart: "2026-10-26T00:00:00.000Z" },
    ]);
  });

  it("returns a compact week with weekday and date per day", async () => {
    const { api } = fakeApi({
      "planner.getWeekPlan": () =>
        weekPlan("2026-11-09", {
          0: { type: "RECIPE", recipe: RECIPES.laks },
          4: { type: "TAKEAWAY" },
        }),
    });
    const { call } = await connect({ api });

    const { data } = await call("get-week-plan");

    expect(data.weekEnd).toBe("2026-11-15");
    expect(data.days[0]).toEqual({
      dayIndex: 0,
      weekday: "mandag",
      date: "2026-11-09",
      type: "RECIPE",
      recipe: { id: RECIPES.laks.id, name: "Ovnsbakt laks", category: "FISK" },
    });
    expect(data.days[4]).toEqual({
      dayIndex: 4,
      weekday: "fredag",
      date: "2026-11-13",
      type: "TAKEAWAY",
    });
    expect(data.suggestions).toBeUndefined();
  });

  it("says so when the API answers with a different week than requested", async () => {
    const { api } = fakeApi({
      // Weeks beyond the planning horizon come back as the last allowed one.
      "planner.getWeekPlan": () => weekPlan("2026-12-07"),
    });
    const { call } = await connect({ api });

    const { data, isError } = await call("get-week-plan", {
      week: "2027-03-03",
    });

    expect(isError).toBe(false);
    expect(data.weekStart).toBe("2026-12-07");
    expect(data.note).toContain("2027-03-01");
  });

  /** What the API answers to setWeekPlanDays: the changed days, rest empty. */
  const savedWith =
    (freezerChanges: { recipeId: string; portions: number }[] = []) =>
    (input: { weekStart: string; changes: any[] }) => ({
      ...weekPlan(
        input.weekStart.slice(0, 10),
        Object.fromEntries(
          input.changes.map((change) => [
            change.dayIndex,
            "recipeId" in change
              ? { type: change.type, recipe: byId[change.recipeId] }
              : { type: change.type },
          ]),
        ),
      ),
      freezerChanges,
    });

  it("sends only the changed days, with recipe names resolved to IDs", async () => {
    const { api, calls, callsTo } = fakeApi({
      "recipe.list": () => ({
        total: 2,
        page: 1,
        pageSize: 200,
        // "taco" also partially matches a longer name; the exact one wins.
        items: [{ ...RECIPES.lasagne, name: "Tacosuppe" }, RECIPES.taco],
      }),
      "planner.setWeekPlanDays": savedWith(),
    });
    const { call } = await connect({ api });

    const { data, isError } = await call("set-week-plan-days", {
      changes: [
        { dayIndex: 4, type: "RECIPE", recipeName: "taco" },
        { dayIndex: 2, type: "EMPTY" },
      ],
    });

    expect(isError).toBe(false);
    expect(callsTo("planner.setWeekPlanDays")).toEqual([
      {
        weekStart: "2026-11-09T00:00:00.000Z",
        changes: [
          { dayIndex: 4, type: "RECIPE", recipeId: RECIPES.taco.id },
          { dayIndex: 2, type: "EMPTY" },
        ],
        syncFreezer: true,
      },
    ]);
    // The week is never read and written back from here: merging the change
    // into the stored week is the API's job, inside one transaction.
    expect(calls.map((c) => c.path)).toEqual([
      "recipe.list",
      "planner.setWeekPlanDays",
    ]);
    expect(data.days[4].recipe.name).toBe("Taco");
    expect(data.freezerChanges).toEqual([]);
  });

  it("reports the candidates when a recipe name is ambiguous", async () => {
    const { api, callsTo } = fakeApi({
      "recipe.list": () => ({
        total: 2,
        page: 1,
        pageSize: 200,
        items: [
          { ...RECIPES.taco, name: "Taco med kylling" },
          { ...RECIPES.lasagne, name: "Fisketaco" },
        ],
      }),
    });
    const { call } = await connect({ api });

    const { data, isError } = await call("set-week-plan-days", {
      changes: [{ dayIndex: 0, type: "RECIPE", recipeName: "taco" }],
    });

    expect(isError).toBe(true);
    expect(data.candidates.map((c: any) => c.name)).toEqual([
      "Taco med kylling",
      "Fisketaco",
    ]);
    expect(callsTo("planner.setWeekPlanDays")).toEqual([]);
  });

  it("finds an exact recipe name behind a full page of newer partial matches", async () => {
    const newer = Array.from({ length: 200 }, (_, i) => ({
      ...RECIPES.lasagne,
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      name: `Taco variant ${i}`,
    }));
    const { api, callsTo } = fakeApi({
      "recipe.list": ({ page }) => ({
        total: 201,
        page,
        pageSize: 200,
        items: page === 1 ? newer : [RECIPES.taco],
      }),
      "planner.setWeekPlanDays": savedWith(),
    });
    const { call } = await connect({ api });

    const { data, isError } = await call("set-week-plan-days", {
      changes: [{ dayIndex: 0, type: "RECIPE", recipeName: "Taco" }],
    });

    expect(isError).toBe(false);
    expect(data.days[0].recipe.id).toBe(RECIPES.taco.id);
    expect(callsTo("recipe.list").map((c: any) => c.page)).toEqual([1, 2]);
  });

  it("reports the freezer portions the API moved along with the plan", async () => {
    const moved = [
      { recipeId: RECIPES.lasagne.id, portions: 1 },
      { recipeId: RECIPES.taco.id, portions: -1 },
    ];
    const { api, calls } = fakeApi({
      "planner.setWeekPlanDays": savedWith(moved),
    });
    const { call } = await connect({ api });

    const synced = await call("set-week-plan-days", {
      changes: [{ dayIndex: 3, type: "FREEZER", recipeId: RECIPES.taco.id }],
    });
    await call("set-week-plan-days", {
      changes: [{ dayIndex: 3, type: "FREEZER", recipeId: RECIPES.taco.id }],
      syncFreezer: false,
    });

    expect(synced.data.freezerChanges).toEqual(moved);
    // The freezer is never adjusted from here, only through the plan call.
    expect(calls.map((c) => c.path)).toEqual([
      "planner.setWeekPlanDays",
      "planner.setWeekPlanDays",
    ]);
    expect(calls.map((c: any) => c.input.syncFreezer)).toEqual([true, false]);
  });

  it("passes on the API's refusal when the freezer is empty or the week too far ahead", async () => {
    const { api } = fakeApi({
      "planner.setWeekPlanDays": ({ weekStart }) => {
        throw trpcError(
          "BAD_REQUEST",
          weekStart.startsWith("2027")
            ? "Uken ligger lenger frem i tid enn tillatt planleggingshorisont"
            : "Ikke nok porsjoner av «Taco» i fryseren: trenger 1, har 0.",
        );
      },
    });
    const { call } = await connect({ api });

    const empty = await call("set-week-plan-days", {
      changes: [{ dayIndex: 0, type: "FREEZER", recipeId: RECIPES.taco.id }],
    });
    const farAhead = await call("set-week-plan-days", {
      week: "2027-03-01",
      changes: [{ dayIndex: 0, type: "TAKEAWAY" }],
    });

    expect(empty.isError).toBe(true);
    expect(empty.data.error).toContain("Ikke nok porsjoner av «Taco»");
    expect(farAhead.isError).toBe(true);
    expect(farAhead.data.error).toContain("planleggingshorisont");
  });

  it("asks the API to return replaced freezer meals when a week is regenerated", async () => {
    const { api, calls } = fakeApi({
      "planner.generateWeekPlan": () => ({
        ...weekPlan("2026-11-09", {
          0: { type: "RECIPE", recipe: RECIPES.laks },
        }),
        freezerChanges: [{ recipeId: RECIPES.lasagne.id, portions: 1 }],
      }),
    });
    const { call } = await connect({ api });

    const { data } = await call("generate-week-plan", { fish: 3 });

    expect(calls).toEqual([
      {
        path: "planner.generateWeekPlan",
        input: {
          weekStart: "2026-11-09T00:00:00.000Z",
          seed: undefined,
          syncFreezer: true,
          constraints: {
            fish: 3,
            vegetarian: 1,
            chicken: 1,
            beef: 1,
            preferRecentGapDays: 21,
          },
        },
      },
    ]);
    expect(data.freezerChanges).toEqual([
      { recipeId: RECIPES.lasagne.id, portions: 1 },
    ]);
  });
});

describe("recipes and ingredients", () => {
  it("reuses the existing spelling of ingredients when creating a recipe", async () => {
    const { api, callsTo } = fakeApi({
      "ingredient.list": () => [{ id: "i1", name: "Løk" }],
      "recipe.create": (input) => ({
        ...RECIPES.taco,
        ...input,
        id: RECIPES.taco.id,
      }),
    });
    const { call } = await connect({ api });

    const { data } = await call("create-recipe", {
      name: "Taco",
      category: "STORFE",
      everydayScore: 4,
      healthScore: 2,
      ingredients: [{ name: "løk", quantity: 1 }, { name: " Tacokrydder " }],
    });

    expect(
      (callsTo("recipe.create")[0] as any).ingredients.map((i: any) => i.name),
    ).toEqual(["Løk", "Tacokrydder"]);
    expect(data.newIngredients).toEqual(["Tacokrydder"]);
  });

  it("omits ingredients from recipe lists unless asked for", async () => {
    const { api } = fakeApi({
      "recipe.list": () => ({
        total: 120,
        page: 1,
        pageSize: 50,
        items: [
          {
            ...RECIPES.taco,
            description: "Stek kjøttdeigen.",
            ingredients: [{ ingredientId: "i1", name: "Løk", quantity: 1 }],
          },
        ],
      }),
    });
    const { call } = await connect({ api });

    const slim = await call("list-recipes");
    const full = await call("list-recipes", { includeIngredients: true });

    expect(slim.data.hasMore).toBe(true);
    expect(slim.data.recipes[0]).toEqual({
      id: RECIPES.taco.id,
      name: "Taco",
      category: "STORFE",
      everydayScore: 4,
      healthScore: 2,
      usageCount: 12,
      lastUsed: "2026-11-02",
    });
    expect(full.data.recipes[0].ingredients).toEqual([
      { ingredientId: "i1", name: "Løk", quantity: 1 },
    ]);
  });

  it("updates only the given ingredient fields", async () => {
    const { api, callsTo } = fakeApi({
      "ingredient.getWithRecipes": () => ({
        id: "i1",
        name: "Løk",
        unit: "stk",
        isPantryItem: false,
        category: "ANNET",
        recipes: [],
      }),
      "ingredient.update": (input) => input,
    });
    const { call } = await connect({ api });
    const id = "44444444-4444-4444-8444-444444444444";

    await call("update-ingredient", {
      ingredientId: id,
      category: "FRUKT_OG_GRONT",
    });
    await call("update-ingredient", { ingredientId: id, unit: null });

    expect(callsTo("ingredient.update")).toEqual([
      // Name and unit are carried over; the API would otherwise clear the unit.
      {
        id,
        name: "Løk",
        unit: "stk",
        isPantryItem: undefined,
        category: "FRUKT_OG_GRONT",
      },
      {
        id,
        name: "Løk",
        unit: undefined,
        isPantryItem: undefined,
        category: undefined,
      },
    ]);
  });

  it("does not overwrite an ingredient that already exists", async () => {
    const existing = { id: "i1", name: "Løk", unit: "stk", isPantryItem: true };
    const { api, callsTo } = fakeApi({
      "ingredient.list": () => [existing, { id: "i2", name: "Rødløk" }],
    });
    const { call } = await connect({ api });

    const { data } = await call("create-ingredient", { name: "løk" });

    expect(data).toEqual({ created: false, ingredient: existing });
    expect(callsTo("ingredient.create")).toEqual([]);
  });

  it("routes bulk ingredient updates to the right API calls by name or id", async () => {
    const id = "55555555-5555-4555-8555-555555555555";
    const { api, callsTo } = fakeApi({
      "ingredient.list": () => [{ id: "i1", name: "Løk" }],
      "ingredient.bulkUpdateUnits": ({ updates }) => ({
        count: updates.length,
      }),
      "ingredient.bulkUpdateCategories": ({ updates }) => ({
        count: updates.length,
      }),
      "ingredient.bulkUpdatePantryItems": ({ updates }) => ({
        count: updates.length,
      }),
    });
    const { call } = await connect({ api });

    const { data } = await call("bulk-update-ingredients", {
      updates: [
        { name: "LØK", unit: "stk", category: "FRUKT_OG_GRONT" },
        { ingredientId: id, isPantryItem: true },
        { name: "Finnes ikke", unit: "g" },
      ],
    });

    expect(callsTo("ingredient.bulkUpdateUnits")).toEqual([
      { updates: [{ id: "i1", unit: "stk" }] },
    ]);
    expect(callsTo("ingredient.bulkUpdatePantryItems")).toEqual([
      { updates: [{ id, isPantryItem: true }] },
    ]);
    expect(data.updated).toEqual({ units: 1, categories: 1, pantry: 1 });
    expect(data.notFound).toEqual(["Finnes ikke"]);
  });
});

describe("shopping list", () => {
  const WEEK = "2026-11-09T00:00:00.000Z";
  const shoppingList = () => ({
    weekStart: WEEK,
    includedWeekStarts: [WEEK],
    plannedDays: [],
    items: [
      {
        ingredientId: "ing-melk",
        name: "Melk",
        unit: "l",
        category: "MEIERI_OG_EGG",
        totalQuantity: 2,
        hasMissingQuantities: false,
        details: [{ recipeName: "Lasagne" }, { recipeName: "Lasagne" }],
        weekStarts: [WEEK],
        occurrences: [],
        checked: false,
        isPantryItem: false,
      },
      {
        ingredientId: "ing-kokos",
        name: "Kokosmelk",
        unit: null,
        category: "HERMETIKK",
        totalQuantity: null,
        hasMissingQuantities: true,
        details: [{ recipeName: "Curry" }],
        weekStarts: [WEEK],
        occurrences: [],
        checked: true,
        isPantryItem: false,
      },
    ],
    extras: [
      {
        id: "e1",
        name: "Dopapir",
        weekStart: WEEK,
        checked: false,
        category: null,
      },
      {
        id: "e2",
        name: "Kaffe",
        weekStart: WEEK,
        checked: false,
        category: "TORRVARER",
      },
      {
        id: "e3",
        name: "Kaffefilter",
        weekStart: WEEK,
        checked: false,
        category: null,
      },
    ],
  });

  it("summarises the list and can hide what is already checked", async () => {
    const { api, callsTo } = fakeApi({ "planner.shoppingList": shoppingList });
    const { call } = await connect({ api });

    const { data } = await call("get-shopping-list", { onlyUnchecked: true });

    expect(callsTo("planner.shoppingList")).toEqual([
      { weekStart: WEEK, lookaheadWeeks: 0 },
    ]);
    expect(data.summary).toEqual({
      items: 2,
      itemsUnchecked: 1,
      extras: 3,
      extrasUnchecked: 3,
    });
    expect(data.items).toEqual([
      {
        ingredientId: "ing-melk",
        name: "Melk",
        quantity: 2,
        unit: "l",
        category: "MEIERI_OG_EGG",
        checked: false,
        recipes: ["Lasagne"],
      },
    ]);
  });

  it("checks off ingredients and extras by name, and never guesses", async () => {
    const { api, callsTo } = fakeApi({
      "planner.shoppingList": shoppingList,
      "planner.updateShoppingItem": () => ({ ok: true }),
      "planner.extraToggle": () => ({ id: "e1", checked: true }),
    });
    const { call } = await connect({ api });

    const { data } = await call("check-shopping-items", {
      // "melk" is an exact item even though "Kokosmelk" contains it;
      // "kaffe" is an exact extra even though "Kaffefilter" contains it;
      // "dopa" matches a single extra; "ka" matches two; "ost" matches nothing.
      names: ["melk", "kaffe", "dopa", "ka", "ost"],
    });

    expect(callsTo("planner.updateShoppingItem")).toEqual([
      { ingredientId: "ing-melk", unit: "l", weeks: [WEEK], checked: true },
    ]);
    expect(callsTo("planner.extraToggle")).toEqual([
      { weekStart: WEEK, name: "Kaffe", checked: true },
      { weekStart: WEEK, name: "Dopapir", checked: true },
    ]);
    expect(data.updated).toEqual([
      { name: "Melk", kind: "ingredient" },
      { name: "Kaffe", kind: "extra" },
      { name: "Dopapir", kind: "extra" },
    ]);
    expect(data.ambiguous).toEqual([
      { name: "ka", candidates: ["Kaffe", "Kaffefilter"] },
    ]);
    expect(data.notFound).toEqual(["ost"]);
  });

  it("does not check anything off when the API answers for another week", async () => {
    const { api, calls } = fakeApi({
      // Asked for a week beyond the horizon, the API returns the last one.
      "planner.shoppingList": shoppingList,
    });
    const { call } = await connect({ api });

    const checked = await call("check-shopping-items", {
      week: "2027-03-03",
      names: ["melk"],
    });
    const shown = await call("get-shopping-list", { week: "2027-03-03" });

    expect(checked.isError).toBe(true);
    expect(checked.data.error).toContain("2027-03-01");
    expect(calls.map((c) => c.path)).toEqual([
      "planner.shoppingList",
      "planner.shoppingList",
    ]);
    expect(shown.isError).toBe(false);
    expect(shown.data.weekStart).toBe("2026-11-09");
    expect(shown.data.note).toContain("2027-03-01");
  });

  it("reports the stored category of a catalogue item that already existed", async () => {
    const { api, callsTo } = fakeApi({
      "planner.extraAdd": () => ({ id: "c2", name: "Kaffe" }),
      "planner.extraCatalogList": () => [
        { id: "c2", name: "Kaffe", usageCount: 9, category: "TORRVARER" },
      ],
    });
    const { call } = await connect({ api });

    const { data } = await call("add-extra-catalog-item", { name: "Kaffe" });

    expect(data.item).toEqual({
      id: "c2",
      name: "Kaffe",
      category: "TORRVARER",
    });
    expect(callsTo("planner.extraCatalogBulkUpdateCategories")).toEqual([]);
  });

  it("refuses to pick between packages whose names differ only in spacing", async () => {
    const { api, callsTo } = fakeApi({
      "planner.packageList": () => [
        { id: "p1", name: "Storhandel basis", items: [] },
        { id: "p2", name: "Storhandel  basis", items: [] },
      ],
    });
    const { call } = await connect({ api });

    const { data, isError } = await call("delete-shopping-package", {
      packageName: "storhandel basis",
    });

    expect(isError).toBe(true);
    expect(data.candidates.map((c: any) => c.id)).toEqual(["p1", "p2"]);
    expect(callsTo("planner.packageDelete")).toEqual([]);
  });

  it("reuses catalogue spelling for extras and points out lookalikes", async () => {
    const { api, callsTo } = fakeApi({
      "planner.extraCatalogList": () => [
        { id: "c1", name: "Dopapir", usageCount: 3, category: null },
        { id: "c2", name: "Kaffe", usageCount: 9, category: "TORRVARER" },
      ],
      "planner.extraToggle": () => ({ id: "x", checked: false }),
    });
    const { call } = await connect({ api });

    const { data } = await call("add-extra-shopping-items", {
      names: ["dopapir", "Kaffefilter", "DOPAPIR", "Smør", "Smørbukk"],
    });

    expect(callsTo("planner.extraToggle").map((c: any) => c.name)).toEqual([
      "Dopapir",
      "Kaffefilter",
      "Smør",
      "Smørbukk",
    ]);
    expect(data.added).toEqual([
      { name: "Dopapir", source: "catalog" },
      { name: "Kaffefilter", source: "new", similarInCatalog: ["Kaffe"] },
      { name: "Smør", source: "new" },
      // Lookalikes added earlier in the same call count too.
      { name: "Smørbukk", source: "new", similarInCatalog: ["Smør"] },
    ]);
  });
});

describe("freezer and settings", () => {
  it("will not take more portions out of the freezer than it holds", async () => {
    const { api, callsTo } = fakeApi({
      "freezer.list": () => [{ recipeId: RECIPES.taco.id, quantity: 1 }],
    });
    const { call } = await connect({ api });

    const { data, isError } = await call("adjust-freezer-portions", {
      recipeId: RECIPES.taco.id,
      delta: -2,
    });

    expect(isError).toBe(true);
    expect(data.error).toContain("bare 1");
    expect(callsTo("freezer.decrement")).toEqual([]);
  });

  it("accepts plain dates and reports days until expiry", async () => {
    const { api, callsTo } = fakeApi({
      "freezer.upsert": (input) => ({
        recipeId: input.recipeId,
        recipeName: "Taco",
        recipeCategory: "STORFE",
        quantity: input.quantity,
        frozenAt: input.frozenAt,
        expiresAt: "2026-11-22T00:00:00.000Z",
      }),
    });
    const { call } = await connect({ api });

    const { data } = await call("set-freezer-item", {
      recipeId: RECIPES.taco.id,
      portions: 3,
      frozenAt: "2026-11-10",
    });

    expect(callsTo("freezer.upsert")).toEqual([
      {
        recipeId: RECIPES.taco.id,
        quantity: 3,
        frozenAt: "2026-11-10T00:00:00.000Z",
        expiresAt: undefined,
      },
    ]);
    expect(data.item).toMatchObject({
      portions: 3,
      frozenAt: "2026-11-10",
      expiresAt: "2026-11-22",
      daysUntilExpiry: 10,
      expired: false,
    });
  });

  it("merges setting changes into the stored preferences", async () => {
    const storeId = "66666666-6666-4666-8666-666666666666";
    const { api, callsTo } = fakeApi({
      "planner.shoppingSettings": () => ({
        settings: {
          defaultViewMode: "by-day",
          defaultDisplayStyle: "list",
          startDay: 0,
          includeNextWeek: false,
          showPantryWithIngredients: false,
          visibleDayIndices: [0, 1, 2, 3, 4],
          defaultStoreId: "standard",
        },
        stores: [
          { id: "standard", name: "Standard butikk", isDefault: true },
          { id: storeId, name: "Kiwi Sentrum", isDefault: false },
        ],
      }),
      "planner.updateShoppingSettings": (input) => input,
    });
    const { call } = await connect({ api });

    await call("update-shopping-settings", {
      defaultViewMode: "by-category",
      defaultStoreName: "kiwi",
      plannerTapOpensRecipe: true,
    });

    expect(callsTo("planner.updateShoppingSettings")).toEqual([
      {
        defaultViewMode: "by-category",
        defaultDisplayStyle: "list",
        startDay: 0,
        includeNextWeek: false,
        showPantryWithIngredients: false,
        compactShoppingList: undefined,
        plannerTapOpensRecipe: true,
        visibleDayIndices: [0, 1, 2, 3, 4],
        defaultStoreId: storeId,
      },
    ]);
  });

  it("completes a partial store category order", async () => {
    const { api, callsTo } = fakeApi({
      "planner.createShoppingStore": (input) => ({ id: "s1", ...input }),
    });
    const { call } = await connect({ api });

    await call("create-shopping-store", {
      name: "Rema",
      categoryOrder: ["BROD", "FRUKT_OG_GRONT"],
    });

    const order = (callsTo("planner.createShoppingStore")[0] as any)
      .categoryOrder;
    expect(order.slice(0, 2)).toEqual(["BROD", "FRUKT_OG_GRONT"]);
    expect(order).toHaveLength(10);
    expect(new Set(order).size).toBe(10);
  });
});

describe("admin", () => {
  const households = () => [
    {
      id: "h1",
      name: "Hjemme",
      createdAt: "2026-01-01T00:00:00.000Z",
      members: [
        {
          id: "m1",
          role: "OWNER",
          user: { id: "u1", name: "Kari", email: "kari@example.com" },
        },
      ],
    },
  ];

  it("only deletes a household when the confirmation name matches", async () => {
    const { api, callsTo } = fakeApi({
      "admin.listHouseholds": households,
      "admin.deleteHousehold": () => ({ id: "h1" }),
    });
    const { call } = await connect({ api, isAdmin: true });

    const wrong = await call("admin-delete-household", {
      householdId: "h1",
      confirmName: "hjemme",
    });
    expect(wrong.isError).toBe(true);
    expect(callsTo("admin.deleteHousehold")).toEqual([]);

    const right = await call("admin-delete-household", {
      householdId: "h1",
      confirmName: "Hjemme",
    });
    expect(right.isError).toBe(false);
    expect(callsTo("admin.deleteHousehold")).toEqual([{ householdId: "h1" }]);
  });

  it("adds a member by household name and e-mail", async () => {
    const { api, callsTo } = fakeApi({
      "admin.listHouseholds": households,
      "admin.listUsers": () => [
        {
          id: "u2",
          name: "Ola",
          email: "Ola@Example.com",
          role: "USER",
          memberships: [],
        },
      ],
      "admin.addHouseholdMember": (input) => ({ id: "m2", ...input }),
    });
    const { call } = await connect({ api, isAdmin: true });

    const { data } = await call("admin-set-household-member", {
      householdName: "hjemme",
      email: "ola@example.com",
    });

    expect(callsTo("admin.addHouseholdMember")).toEqual([
      { householdId: "h1", userId: "u2", role: "MEMBER" },
    ]);
    expect(data.membership.membershipId).toBe("m2");
  });

  it("removes an allowed e-mail by address", async () => {
    const { api, callsTo } = fakeApi({
      "admin.listAllowedEmails": () => [{ id: "a1", email: "ola@example.com" }],
      "admin.removeAllowedEmail": () => ({
        id: "a1",
        email: "ola@example.com",
      }),
    });
    const { call } = await connect({ api, isAdmin: true });

    await call("admin-remove-allowed-email", { email: "OLA@example.com" });

    expect(callsTo("admin.removeAllowedEmail")).toEqual([{ id: "a1" }]);
  });
});
