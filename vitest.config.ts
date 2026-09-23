import { defineConfig } from "vitest/config";

/// Kept separate from `vite.config.ts` so the app build never pulls in the test
/// runner's config. Everything under test here is pure logic — no DOM, no Solid
/// rendering — so no plugins are needed either.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
