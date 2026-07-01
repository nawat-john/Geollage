import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { consoleErrors, gotoStudio } from "./helpers";

test("export -> reload -> import round-trips a sandbox cut", async ({ page }, testInfo) => {
  await gotoStudio(page);

  await page.getByRole("button", { name: "Sandbox" }).click();
  await page.getByRole("button", { name: "Cut (great circle)" }).click();

  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas not found");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.3);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.75);

  const inspector = page.getByRole("region", { name: "Plate inspector" });
  await expect(inspector.getByText(/\(1\)$/)).toBeVisible({ timeout: 5000 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export" }).click(),
  ]);
  const downloadPath = testInfo.outputPath("exported.tecto.json");
  await download.saveAs(downloadPath);

  // Fresh load: the cut should be gone (back to the bundled present-day state).
  await gotoStudio(page);
  await expect(inspector).not.toBeVisible();

  await page.locator('input[type="file"]').setInputFiles(downloadPath);

  // Import should restore sandbox mode and the cut plate — selection itself
  // is transient UI state and isn't part of the saved project, so check the
  // cut survived via the plate list rather than re-checking the inspector.
  await expect(page.getByRole("button", { name: "Sandbox", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("option", { name: /\(1\)$/ })).toHaveCount(1, { timeout: 5000 });

  expect(consoleErrors(page)).toEqual([]);
});

test("importing an invalid file shows an error instead of crashing", async ({ page }, testInfo) => {
  await gotoStudio(page);

  const badFile = testInfo.outputPath("bad.json");
  await writeFile(badFile, JSON.stringify({ not: "a project" }));

  await page.locator('input[type="file"]').setInputFiles(badFile);
  await expect(page.getByText(/Not a tecto-studio project file/i)).toBeVisible();

  expect(consoleErrors(page)).toEqual([]);
});
