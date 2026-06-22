import { defineConfig } from "@playwright/test";

/**
 * Standalone config for the example build/smoke check (separate from the e2e
 * config so it needs no Docker backend). Boots the `example/vite` dev server -
 * which serves the COOP/COEP headers and the zero-config assets - and runs
 * `smoke/`. Requires the example's deps to be installed first:
 *   npm pack && (cd example/vite && npm install)
 */
const PORT = 5180;

export default defineConfig({
    testDir: "./smoke",
    timeout: 60_000,
    fullyParallel: false,
    reporter: "list",
    use: {
        baseURL: `http://localhost:${PORT}`,
    },
    webServer: {
        command: `npm --prefix example/vite run dev -- --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}`,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
    },
    projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
