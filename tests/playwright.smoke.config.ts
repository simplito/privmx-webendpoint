import { fileURLToPath } from "url";
import { defineConfig } from "@playwright/test";

/**
 * Standalone config for the example build/smoke check (separate from the e2e
 * config so it needs no Docker backend). Boots the `example/vite` dev server -
 * which serves the COOP/COEP headers and the zero-config assets - and runs
 * `tests/smoke/`. Requires the example's deps to be installed first:
 *   npm pack && (cd example/vite && npm install)
 */
const PORT = 5180;

// This config lives in tests/; the dev-server command (`npm --prefix example/vite`)
// is relative to the repo root, so pin the cwd one level up.
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

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
        cwd: repoRoot,
        url: `http://localhost:${PORT}`,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
    },
    projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
