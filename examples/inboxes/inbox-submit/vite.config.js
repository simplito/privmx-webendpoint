// vite.config.js
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [
        {
            name: 'configure-response-headers',
            configureServer: server => {
                server.middlewares.use((req, res, next) => {
                    // Apply headers only to relevant paths
                    if (req.url.startsWith('/privmx-assets') || req.url === '/') {
                        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
                        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
                    }
                    next();
                });
            },
        },
    ],
});
