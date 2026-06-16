import { defineConfig, type Plugin } from "vite";

// The PrivMX WASM core runs on worker threads backed by SharedArrayBuffer, which
// browsers only expose on a *cross-origin isolated* page. These two response
// headers enable that isolation — without them, setup() fails with
// "SharedArrayBuffer is not defined". Apply the same headers in production.
const COOP_COEP = {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
};
const crossOriginIsolation: Plugin = {
    name: "cross-origin-isolation",
    configureServer(server) {
        server.middlewares.use((_req, res, next) => {
            for (const [k, v] of Object.entries(COOP_COEP)) res.setHeader(k, v);
            next();
        });
    },
    configurePreviewServer(server) {
        server.middlewares.use((_req, res, next) => {
            for (const [k, v] of Object.entries(COOP_COEP)) res.setHeader(k, v);
            next();
        });
    },
};

export default defineConfig({
    plugins: [crossOriginIsolation],
    optimizeDeps: {
        // Exclude the SDK from pre-bundling so the `/auto` entry's
        // `new URL("../../assets/…", import.meta.url)` resolves against the real
        // package location. The SDK's deps are all ESM, so nothing else is needed.
        exclude: ["@simplito/privmx-webendpoint"],
    },
});
