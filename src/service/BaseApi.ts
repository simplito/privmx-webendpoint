/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { BaseNative } from "../api/BaseNative";

export class BaseApi {
    private _servicePtr: number;

    constructor(ptr: number) {
        this._servicePtr = ptr;
    }

    public get servicePtr() {
        if (this._servicePtr < 0) {
            throw new Error("This API instance is no longer valid because the connection associated with it has been closed.")
        }
        return this._servicePtr;
    }


    public destroyRefs() {
        this._servicePtr = -1;
    }
}
