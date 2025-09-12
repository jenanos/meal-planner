import { test, expect } from "@playwright/test";

test("happy path", async ({ page }) => {
  await page.goto("http://localhost:3000/recipes");
  await page.getByLabel("Title").fill("Testgryte");
  await page.getByLabel("Diet").selectOption("MEAT");
  await page.click("text=Create");
  await expect(page.locator("li", { hasText: "Testgryte" })).toBeVisible();

  await page.goto("http://localhost:3000/planner");
  await page.fill("input[type=date]", "2024-01-01");
  const nums = page.locator("input[type=number]");
  await nums.nth(0).fill("3");
  await nums.nth(1).fill("2");
  await nums.nth(2).fill("2");
  await page.click("text=Generate");
  await expect(page.locator("li")).toHaveCount(7);

  page.once("dialog", (dialog) => dialog.accept());
  await page.click("text=Save plan");
});

