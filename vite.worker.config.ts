import { resolve } from "path";
import { defineConfig } from "vite";

// Builds the E2EE web worker as a self-contained IIFE script.
// The worker uses `self` (not `window`), so no special target configuration
// is needed — IIFE format is sufficient for a web worker script.
export default defineConfig({
    build: {
        outDir: "dist/assets",
        // Do not wipe outDir — WASM assets written by build:wasm live here too.
        emptyOutDir: false,
        rollupOptions: {
            input: resolve(__dirname, "src/crypto/workerHelper.ts"),
            external: [],
            output: {
                format: "iife",
                entryFileNames: "privmx-worker.js",
            },
        },
    },
});
