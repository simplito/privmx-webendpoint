/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { EndpointFactory } from "./EndpointFactory.js";

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

const assetUrl = (file: string) => new URL(`../../assets/${file}`, import.meta.url).href;

/**
 * Initializes the Endpoint with **zero manual asset handling** - the three WASM
 * runtime files are located automatically, so you never copy them into a public
 * directory or pass an `assetsBasePath`.
 *
 * Resolves each asset with `new URL("../../assets/<file>", import.meta.url)`,
 * which a bundler (Vite, webpack 5, Rollup, Parcel, Next) graph-includes,
 * fingerprints, and serves; the resolved URLs are then handed to
 * {@link EndpointFactory.setup} (`wasmUrl` is wired through the Emscripten
 * module's `locateFile`, the worker via its own URL). It is
 * **ESM-only** because it relies on `import.meta.url`.
 *
 * Use it instead of {@link EndpointFactory.setup} in any bundled web app - it is
 * the recommended setup path. After it resolves, continue exactly as with the
 * classic flow: {@link EndpointFactory.connect} → `createThreadApi` / … →
 * `disconnect`. For non-bundler setups (plain `<script>`, custom CDN layout),
 * use `EndpointFactory.setup({ assetsBasePath })` instead.
 *
 * @param {SetupAutoOptions} [options] optional tuning (e.g. `workerCount`)
 * @returns {Promise<void>} resolves once all assets are loaded and the Endpoint is initialized
 * @throws {Error} when an asset fails to load, or when called outside a browser
 *   environment (same conditions as {@link EndpointFactory.setup})
 * @example
 * import { Endpoint, setupAuto } from "@simplito/privmx-webendpoint";
 *
 * await setupAuto();
 * const connection = await Endpoint.connect(userPrivKey, solutionId, bridgeUrl);
 * const threadApi = await Endpoint.createThreadApi(connection);
 */
export async function setupAuto(options: SetupAutoOptions = {}): Promise<void> {
    return EndpointFactory.setup({
        wasmModuleUrl: assetUrl("endpoint-wasm-module.js"),
        wasmUrl: assetUrl("endpoint-wasm-module.wasm"),
        workerUrl: assetUrl("privmx-worker.js"),
        workerCount: options.workerCount,
    });
}
