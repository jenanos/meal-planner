import { expect, test, type Page } from "@playwright/test";
import { missingSetup, signIn } from "./helpers";

test.skip(missingSetup !== null, missingSetup ?? "");

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

/** Make sure the week on screen has dinners from today on. */
async function fillPlan(page: Page) {
  await page.goto("/planner");
  // The button is disabled until the plan has loaded.
  const generate = page.getByRole("button", { name: /Generer ukesplan/ });
  await expect(generate).toBeEnabled();
  await generate.click();
  const fill = page.getByRole("menuitem", { name: /Fyll tomme dager/ });
  if (await fill.isEnabled()) {
    await fill.click();
    await expect(generate).toBeEnabled();
  } else {
    await page.keyboard.press("Escape");
  }
}

const dayChips = (page: Page) =>
  page.locator("button[aria-pressed]").filter({ hasNotText: "Tidligere" });

const checkboxes = (page: Page) => page.locator("input[type=checkbox]");

test("the planner highlights today", async ({ page }) => {
  await fillPlan(page);
  const today = page.locator("[aria-current=date]:visible");
  await expect(today).toHaveCount(1);
  await expect(today.getByText("I dag")).toBeVisible();
});

test("the shopping list starts today and follows the horizon", async ({
  page,
}) => {
  await fillPlan(page);
  await page.goto("/shopping-list");

  await page.getByRole("radio", { name: "7 dager" }).click();
  await expect(dayChips(page).first()).toHaveText("I dag");
  expect(await dayChips(page).count()).toBeGreaterThan(1);

  await page.getByRole("radio", { name: "I dag", exact: true }).click();
  await expect(dayChips(page)).toHaveCount(1);

  // Tapping a day off takes its items out of the list.
  await page.getByRole("radio", { name: "7 dager" }).click();
  await expect(checkboxes(page).first()).toBeVisible();
  const before = await checkboxes(page).count();
  const secondDay = dayChips(page).nth(1);
  await secondDay.click();
  await expect(secondDay).toHaveAttribute("aria-pressed", "false");
  expect(await checkboxes(page).count()).toBeLessThan(before);
  await secondDay.click();
  await expect(checkboxes(page)).toHaveCount(before);
});

test("a check mark survives a reload and waits for the network", async ({
  page,
  context,
}) => {
  await fillPlan(page);
  await page.goto("/shopping-list");
  await page.getByRole("radio", { name: "7 dager" }).click();

  const unchecked = page.locator("input[type=checkbox]:not(:checked)");
  const firstLabel = await unchecked.first().getAttribute("aria-label");
  expect(firstLabel).toBeTruthy();
  const first = page.getByLabel(firstLabel!, { exact: true }).first();

  await first.check();
  await page.reload();
  await expect(first).toBeChecked();

  // Offline: the tap shows at once and is sent when the connection is back.
  const secondLabel = await unchecked.first().getAttribute("aria-label");
  const second = page.getByLabel(secondLabel!, { exact: true }).first();
  await context.setOffline(true);
  await second.check();
  await expect(second).toBeChecked();
  await expect(page.getByRole("status")).toContainText("venter på nett");

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 15_000 });
  await page.reload();
  await expect(second).toBeChecked();

  // Leave the list as it was found.
  await first.uncheck();
  await second.uncheck();
  await page.waitForTimeout(2_000);
  await page.reload();
  await expect(first).not.toBeChecked();
  await expect(second).not.toBeChecked();
});
