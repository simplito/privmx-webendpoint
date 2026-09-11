import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// The PrivMX WASM core runs on worker threads backed by SharedArrayBuffer, which
// browsers only expose on a *cross-origin isolated* page. These two response
// headers enable that isolation - without them, setup() fails with
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

export default defineConfig(({ mode }) => {
    // A bare PrivMX Bridge sends no CORS headers, so a browser on a different
    // origin cannot call it - in production it sits behind a reverse proxy that
    // adds them. For local development, point PRIVMX_BRIDGE_PROXY at the Bridge
    // and the dev server forwards same-origin `/api` to it. No VITE_ prefix:
    // this is a dev-server setting and must not reach the browser.
    const target = loadEnv(mode, process.cwd(), "").PRIVMX_BRIDGE_PROXY;

    return {
        plugins: [react(), crossOriginIsolation],
        optimizeDeps: {
            // Exclude the SDK from pre-bundling so the `/auto` entry's
            // `new URL("../../assets/…", import.meta.url)` resolves against the real
            // package location. The SDK's deps are all ESM, so nothing else is needed.
            exclude: ["@simplito/privmx-webendpoint"],
        },
        // `ws: true` is required, not optional: the core POSTs to /api/v2.0 and
        // then opens a WebSocket on that same path for events.
        server: target ? { proxy: { "/api": { target, changeOrigin: true, ws: true } } } : {},
    };
});
