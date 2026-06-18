/**
 * Vite worker bundle entry point (built to dist/assets/privmx-worker.js) —
 * installs the global EmCrypto instance and loads the E2EE worker script.
 * @internal
 */
import { setGlobalEmCrypto } from "./index.js";
import "../webStreams/worker/worker.js";

setGlobalEmCrypto();
