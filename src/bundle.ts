/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { EndpointFactory as Endpoint } from "./service/EndpointFactory.js";
import { groupGrant } from "./service/groupGrant.js";
import { progressStream, takeStream } from "./service/fileStreams.js";
import { deserializeObject, serializeObject, strToUint8, uint8ToStr } from "./extra/utils.js";

/**
 * Vite bundle entry point - what the `<script>`-tag build puts on
 * `window.PrivmxWebEndpoint`. It carries the same helpers as the package root,
 * so a page without a bundler is not left writing them by hand. Import from the
 * package root instead when you have one.
 * @internal
 */
export {
    Endpoint,
    groupGrant,
    progressStream,
    takeStream,
    serializeObject,
    deserializeObject,
    strToUint8,
    uint8ToStr,
};
