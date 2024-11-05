/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { Api } from "./api/Api";
import { IdGenerator } from "./api/IdGenerator";
import { EndpointFactory } from "./service/EndpointFactory";

declare function endpointWasmModule(): Promise<any>; // Provided by emscripten js glue code

function setLib(){
    endpointWasmModule().then((lib: any)=>{
        EndpointFactory.init(lib);
        dispatchEvent(new CustomEvent('libInitialized'));
    }).catch((err: Error)=>console.log(err));
}

addEventListener("wasmLoaded", setLib);

export {EndpointFactory}

/**
 * TODO: komunikat o niepowodzeniu ladowania wasma - np ze prawdopodobnie brakuje plików w public
 */