/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { EndpointFactory } from "./EndpointFactory.js";
import type { Connection } from "./Connection.js";
import type { ThreadApi } from "./ThreadApi.js";
import type { StoreApi } from "./StoreApi.js";
import type { InboxApi } from "./InboxApi.js";
import type { KvdbApi } from "./KvdbApi.js";
import type { EventApi } from "./EventApi.js";
import type { StreamApi } from "./StreamApi.js";
import type { CryptoApi } from "./CryptoApi.js";

/**
 * Standalone, tree-shakeable counterparts to the `EndpointFactory.createXApi`
 * methods and the `connection.getXApi()` instance methods. Import only the
 * factory you need:
 *
 * ```ts
 * import { createThreadApi } from "@simplito/privmx-webendpoint";
 * const threadApi = await createThreadApi(connection);
 * ```
 *
 * All three forms (this function, `EndpointFactory.createThreadApi(connection)`
 * and `connection.getThreadApi()`) resolve the same per-connection instance.
 */

/**
 * Returns the Thread API (encrypted messaging) for the given connection.
 * @param {Connection} connection connection returned by {@link EndpointFactory.connect}
 * @returns {Promise<ThreadApi>} the per-connection ThreadApi instance
 */
export function createThreadApi(connection: Connection): Promise<ThreadApi> {
    return EndpointFactory.createThreadApi(connection);
}

/**
 * Returns the Store API (encrypted file storage) for the given connection.
 * @param {Connection} connection connection returned by {@link EndpointFactory.connect}
 * @returns {Promise<StoreApi>} the per-connection StoreApi instance
 */
export function createStoreApi(connection: Connection): Promise<StoreApi> {
    return EndpointFactory.createStoreApi(connection);
}

/**
 * Returns the Inbox API (one-way encrypted submissions) for the given connection.
 * @param {Connection} connection connection returned by {@link EndpointFactory.connect}
 *   or {@link EndpointFactory.connectPublic}
 * @returns {Promise<InboxApi>} the per-connection InboxApi instance
 */
export function createInboxApi(connection: Connection): Promise<InboxApi> {
    return EndpointFactory.createInboxApi(connection);
}

/**
 * Returns the KVDB API (encrypted key-value storage) for the given connection.
 * @param {Connection} connection connection returned by {@link EndpointFactory.connect}
 * @returns {Promise<KvdbApi>} the per-connection KvdbApi instance
 */
export function createKvdbApi(connection: Connection): Promise<KvdbApi> {
    return EndpointFactory.createKvdbApi(connection);
}

/**
 * Returns the Event API (custom encrypted Context events) for the given connection.
 * @param {Connection} connection connection returned by {@link EndpointFactory.connect}
 * @returns {Promise<EventApi>} the per-connection EventApi instance
 */
export function createEventApi(connection: Connection): Promise<EventApi> {
    return EndpointFactory.createEventApi(connection);
}

/**
 * Returns the Stream API (E2EE WebRTC audio/video) for the given connection.
 * @param {Connection} connection connection returned by {@link EndpointFactory.connect}
 * @returns {Promise<StreamApi>} the per-connection StreamApi instance
 */
export function createStreamApi(connection: Connection): Promise<StreamApi> {
    return EndpointFactory.createStreamApi(connection);
}

/**
 * Returns the standalone Crypto API (key generation, signing, symmetric
 * encryption). Needs no connection - it runs entirely client-side.
 * @returns {Promise<CryptoApi>} the CryptoApi singleton
 */
export function createCryptoApi(): Promise<CryptoApi> {
    return EndpointFactory.createCryptoApi();
}
