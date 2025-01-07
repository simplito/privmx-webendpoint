/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

// export { EndpointFactory, ThreadApi, StoreApi, InboxApi, CryptoApi} from "./service";
import { EndpointFactory } from "./service/EndpointFactory"; 
// import {ThreadApi} from "./service/ThreadApi"; 
//     import {StoreApi} from "./service/StoreApi"; 
//     import {InboxApi} from "./service/InboxApi"; 
//     import {CryptoApi} from "./service/CryptoApi"; 
//     import {Connection} from "./service/Connection"; 
//     import {EventQueue } from "./service/EventQueue";

// import { EndpointFactory, ThreadApi, StoreApi, InboxApi, CryptoApi, Connection, EventQueue } from "./service";


// export {EndpointFactory, ThreadApi, StoreApi, InboxApi, CryptoApi, Connection, EventQueue};

// declare function endpointWasmModule(): Promise<any>; // Provided by emscripten js glue code

// function setLib(){
//     endpointWasmModule().then((lib: any)=>{
//         EndpointFactory.init(lib);
//         dispatchEvent(new CustomEvent('libInitialized'));
//     }).catch((err: Error)=>console.log(err));
// }
class Endpoint {
    public static async loadLibrary(endpointWasmModuleJsPath: string): Promise<void> {
        // const wasmLibModule = await import(/* webpackChunkName: "endpoint-wasm-module" */`${endpointWasmModuleJsPath}`);
        // console.log({wasmLibModule});
        // const module = await wasmLibModule();
        // console.log({module});
    }
}

export {Endpoint, EndpointFactory};