import { test, expect } from "@playwright/test";

/**
 * Build/smoke check for the published-package consumer path. Loads the
 * `example/vite` app (which installs the SDK from the packed tarball and uses the
 * zero-config `/auto` entry) and asserts the WASM core initialises in a real
 * bundler + browser.
 *
 * This is the guard for regressions that unit tests can't see - e.g. a CommonJS
 * dependency that breaks under ESM, a `sideEffects` setting that tree-shakes the
 * worker, or an asset URL that no longer resolves. All of those surface here as
 * either a thrown error or the absence of the "initialised" log line.
 *
 * No PrivMX Bridge is required: the check stops at WASM init, before any connect.
 */
test("example/vite loads and initialises the WASM core", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await page.goto("/");

    const log = page.locator("#log");
    await expect(log).toContainText("WASM core initialised", { timeout: 30000 });
    await expect(log).not.toContainText("setup failed");
    expect(pageErrors, `uncaught page errors:\n${pageErrors.join("\n")}`).toHaveLength(0);
});
