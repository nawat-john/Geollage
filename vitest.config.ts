import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // e2e/ holds Playwright specs, run separately via `npm run test:e2e` —
    // Vitest's default glob would otherwise also try (and fail) to run them.
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
});
