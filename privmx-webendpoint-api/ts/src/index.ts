/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { EndpointFactory } from "./service/EndpointFactory";
import  * as Types from "./Types";

declare function endpointWasmModule(): Promise<any>; // Provided by emscripten js glue code

class Endpoint {
   /**
   * Load the Endpoint's WASM assets and initialize the Endpoint library.
   *
   * @param {string} [assetsBasePath] base path/url to the Endpoint's WebAssembly assets (like: endpoint-wasm-module.js, driver-web-context.js and others)
   */
    public static async loadLibrary(assetsBasePath?: string): Promise<void> {
        if (assetsBasePath) {
            const assets = ["driver-web-context.js", "endpoint-wasm-module.js"];
            for (const asset of assets) {
                await this.loadScript(assetsBasePath + "/" + asset);
            }
        }
        const lib = await this.initWasm();
        EndpointFactory.init(lib);
    }

    private static async loadScript(url: string): Promise<void> {
        return new Promise<void>(resolve => {
            const head = document.getElementsByTagName('head')[0];
            const script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = url;
    
            script.onload = () => {
                resolve()
            };
            head.appendChild(script);    
        });
    }

    private static async initWasm(): Promise<any> {
        return endpointWasmModule();
    }
}

export {Endpoint, EndpointFactory, Types};