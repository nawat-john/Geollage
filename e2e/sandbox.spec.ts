import { expect, test } from "@playwright/test";
import { consoleErrors, gotoStudio } from "./helpers";

test("dragging a plate in sandbox mode moves it and can be undone", async ({ page }) => {
  await gotoStudio(page);

  await page.getByRole("button", { name: "Sandbox" }).click();
  await page.getByRole("button", { name: "Drag" }).click();

  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas not found");

  const undoButton = page.getByRole("button", { name: "Undo" });
  await expect(undoButton).toBeDisabled();

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 120, startY + 60, { steps: 15 });
  await page.mouse.up();

  await expect(undoButton).toBeEnabled();

  await undoButton.click();
  await expect(undoButton).toBeDisabled();

  expect(consoleErrors(page)).toEqual([]);
});

test("great-circle cut splits a plate into two selectable pieces", async ({ page }) => {
  await gotoStudio(page);

  await page.getByRole("button", { name: "Sandbox" }).click();
  await page.getByRole("button", { name: "Cut (great circle)" }).click();

  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas not found");

  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.3);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.75);

  // A successful cut selects one of the two new pieces, named "<Plate> (1)".
  await expect(page.getByRole("region", { name: "Plate inspector" }).getByText(/\(1\)$/)).toBeVisible({
    timeout: 5000,
  });

  expect(consoleErrors(page)).toEqual([]);
});

test("cutting undoes back to the original single plate", async ({ page }) => {
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

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(inspector.getByText(/\(1\)$/)).not.toBeVisible();

  expect(consoleErrors(page)).toEqual([]);
});
