import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, "src/bundle.ts"),
            name: "PrivmxWebEndpoint",
            formats: ["umd"],
        },
        outDir: "dist/bundle",
        emptyOutDir: true,
        rollupOptions: {
            external: [],
            output: {
                entryFileNames: "privmx-endpoint-web.js",
            },
        },
    },
});
