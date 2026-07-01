import type { Page } from "@playwright/test";

export async function gotoStudio(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  (page as unknown as { __consoleErrors: string[] }).__consoleErrors = errors;

  await page.goto("/", { waitUntil: "networkidle" });
  // Data loading (and, under parallel test load, the dev server's first
  // compile) can take a while — give this a generous timeout rather than
  // racing a short one, so a slow load doesn't leave the modal open to
  // intercept every later click in the test. Playwright's `click` already
  // waits for the element to appear and become actionable; the `.catch`
  // only covers the case where onboarding was already dismissed earlier in
  // this same browser context (localStorage flag already set).
  await page
    .getByRole("button", { name: "Got it" })
    .click({ timeout: 15000 })
    .catch(() => {});
}

export function consoleErrors(page: Page): string[] {
  return (page as unknown as { __consoleErrors?: string[] }).__consoleErrors ?? [];
}
