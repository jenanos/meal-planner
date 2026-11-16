import { expect, test } from "@playwright/test";
import { missingSetup, signIn } from "./helpers";

test.skip(missingSetup !== null, missingSetup ?? "");

test.beforeEach(async ({ context, page }) => {
  await signIn(context);
  await page.goto("/recipes");
});

const sheet = (page: import("@playwright/test").Page) => page.getByRole("dialog");

test("the back button closes a recipe instead of leaving the page", async ({
  page,
}) => {
  await page.locator("main .cursor-pointer").first().click();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByRole("heading", { name: "Ingredienser" })).toBeVisible();

  await page.goBack();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/recipes$/);
});

test("the recipe form is one page and guards unsaved edits", async ({ page }) => {
  await page.locator("main .cursor-pointer").first().click();
  await sheet(page).getByRole("button", { name: "Rediger" }).click();

  const form = sheet(page);
  await expect(form.getByRole("heading", { name: "Rediger oppskrift" })).toBeVisible();
  // Every part of the recipe is on the same page: no steps to page through.
  await expect(form.getByLabel("Navn")).toBeVisible();
  await expect(form.getByRole("radiogroup", { name: "Kategori" })).toBeVisible();
  await expect(form.getByLabel("Søk etter ingrediens")).toBeAttached();
  await expect(form.getByLabel("Beskrivelse")).toBeAttached();

  // Untouched, it closes straight away…
  await page.goBack();
  await expect(sheet(page)).toHaveCount(0);

  // …but edits are not thrown away without asking.
  await page.locator("main .cursor-pointer").first().click();
  await sheet(page).getByRole("button", { name: "Rediger" }).click();
  await sheet(page).getByLabel("Navn").fill("Noe helt annet");
  await page.goBack();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Fortsett" }).click();
  await expect(sheet(page).getByLabel("Navn")).toHaveValue("Noe helt annet");

  await page.goBack();
  await page.getByRole("alertdialog").getByRole("button", { name: "Forkast" }).click();
  await expect(sheet(page)).toHaveCount(0);
});

test("the sheet shrinks with the keyboard and keeps the save button in view", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Ny oppskrift" }).last().click();
  const save = sheet(page).getByRole("button", { name: "Lagre" });
  await expect(save).toBeVisible();

  // Stand-in for the on-screen keyboard taking the lower half of the screen.
  await page.setViewportSize({ width: 390, height: 420 });
  await sheet(page).getByLabel("Søk etter ingrediens").focus();
  await expect(save).toBeInViewport();
  await expect(sheet(page).getByLabel("Søk etter ingrediens")).toBeInViewport();
  const box = await sheet(page).boundingBox();
  expect(box?.height).toBeLessThanOrEqual(420);
});
