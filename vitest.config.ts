import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["src/**/*.test.ts"],
    },
    resolve: {
        // Source uses nodenext-style `.js` extensions on relative imports; strip
        // them so Vite resolves the `.ts` sources at test time (this mirrors the
        // moduleNameMapper the old Jest setup used).
        alias: [{ find: /^(\.{1,2}\/.*)\.js$/, replacement: "$1" }],
    },
});
