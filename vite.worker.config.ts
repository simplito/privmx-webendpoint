import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
    build: {
        outDir: "dist/assets",
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
