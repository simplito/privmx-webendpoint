/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { Api } from "./Api";

export class ApiStatic {
    private static instance: Api;

    public static init(api: Api) {
        this.instance = api;
    }
    public static getInstance() {
        if (!this.instance) {
            throw new Error("API Static not initialized");
        }
        return this.instance;
    }
}
