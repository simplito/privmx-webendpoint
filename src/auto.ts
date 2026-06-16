/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { EndpointFactory } from "./service/EndpointFactory.js";

/**
 * Zero-config entry point — re-exports {@link EndpointFactory} as `Endpoint` so
 * applications can `import { Endpoint, setupAuto } from "@simplito/privmx-webendpoint/auto"`.
 */
export { EndpointFactory as Endpoint };

/**
 * Options for {@link setupAuto}.
 */
export interface SetupAutoOptions {
    /**
     * Number of async-engine worker threads the WASM module spawns (default 4,
     * minimum 2). Forwarded to {@link EndpointFactory.setup}; raise it for
     * heavily parallel file transfers.
     */
    workerCount?: number;
}

/**
 * Initializes the Endpoint with **zero manual asset handling** — the four WASM
 * runtime files are located automatically, so you never copy them into a public
 * directory or pass an `assetsBasePath`.
 *
 * Resolves each asset with `new URL("../assets/<file>", import.meta.url)`,
 * which a bundler (Vite, webpack 5, Rollup, Parcel, Next) graph-includes,
 * fingerprints, and serves; the resolved URLs are then handed to
 * {@link EndpointFactory.setup} (`wasmUrl` is wired through the Emscripten
 * module's `locateFile`, the worker/worklet via their own URLs). This entry is
 * **ESM-only** because it relies on `import.meta.url`.
 *
 * Use it instead of {@link EndpointFactory.setup} in any bundled web app — it is
 * the recommended setup path. After it resolves, continue exactly as with the
 * classic flow: {@link EndpointFactory.connect} → `createThreadApi` / … →
 * `disconnect`. For non-bundler setups (plain `<script>`, custom CDN layout),
 * use `EndpointFactory.setup({ assetsBasePath })` instead.
 *
 * @param {SetupAutoOptions} [options] optional tuning (e.g. `workerCount`)
 * @throws {Error} when an asset fails to load, or when called outside a browser
 *   environment (same conditions as {@link EndpointFactory.setup})
 * @example
 * import { Endpoint, setupAuto } from "@simplito/privmx-webendpoint/auto";
 *
 * await setupAuto();
 * const connection = await Endpoint.connect(userPrivKey, solutionId, bridgeUrl);
 * const threadApi = await Endpoint.createThreadApi(connection);
 */
export async function setupAuto(options: SetupAutoOptions = {}): Promise<void> {
    const assetUrl = (file: string) => new URL(`../assets/${file}`, import.meta.url).href;
    return EndpointFactory.setup({
        wasmModuleUrl: assetUrl("endpoint-wasm-module.js"),
        wasmUrl: assetUrl("endpoint-wasm-module.wasm"),
        workerUrl: assetUrl("privmx-worker.js"),
        rmsProcessorUrl: assetUrl("rms-processor.js"),
        workerCount: options.workerCount,
    });
}
