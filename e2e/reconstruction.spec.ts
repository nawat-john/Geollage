import { expect, test } from "@playwright/test";
import { consoleErrors, gotoStudio } from "./helpers";

test("reconstruction playback advances geological time and renders plates", async ({ page }) => {
  await gotoStudio(page);

  await expect(page.getByRole("button", { name: "Time Machine" })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();

  const timeReadout = page.getByText(/^\d+ Ma$/);
  await expect(timeReadout).toHaveText("0 Ma");

  await page.getByRole("button", { name: "Play" }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Pause" }).click();

  const laterText = await timeReadout.textContent();
  const laterMa = Number(laterText?.replace(" Ma", ""));
  expect(laterMa).toBeGreaterThan(0);

  // Scrubbing the timeline directly should also move the readout.
  const slider = page.locator('input[type="range"]');
  await slider.fill("500");
  await expect(timeReadout).toHaveText("500 Ma");

  expect(consoleErrors(page)).toEqual([]);
});

test("selecting a plate shows its inspector panel with Euler pole info", async ({ page }) => {
  await gotoStudio(page);

  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas not found");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(page.getByRole("region", { name: "Plate inspector" })).toBeVisible();
  await expect(page.getByText("Euler pole (instantaneous)")).toBeVisible();

  expect(consoleErrors(page)).toEqual([]);
});

test("guided tour steps through stops and updates the timeline", async ({ page }) => {
  await gotoStudio(page);

  await page.getByRole("button", { name: "Take the tour" }).click();
  await expect(page.getByRole("heading", { name: /^Rodinia — \d+ Ma$/ })).toBeVisible();

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Rodinia breaks apart/ })).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: /^Rodinia — \d+ Ma$/ })).toBeVisible();

  expect(consoleErrors(page)).toEqual([]);
});
