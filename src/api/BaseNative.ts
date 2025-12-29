/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { Api } from "./Api";

export abstract class BaseNative {
    protected _api: Api | null;
    constructor(api: Api){
        this._api = api;
    }

    get api(): Api {
        if (!this._api) {
            throw new Error("This API instance is no longer valid because the connection associated with it has been closed.")
        }
        return this._api;
    }

    protected abstract newApi(connectionPtr: number, ...apisPtrs: number[]): Promise<number>;
    
    abstract deleteApi(ptr: number): Promise<void>;

    protected deleteApiRef() {
        this._api = null;
    }

    protected async runAsync<T>(func: (taskId: number)=>void) {
        if (!this.api) {
            throw new Error("This API instance is no longer valid because the connection associated with it has been closed.")
        }
        return this.api.runAsync<T>(func);
    }
}
