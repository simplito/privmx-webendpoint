/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { EndpointFactory } from "./service/EndpointFactory.js";
import { NativeError } from "./native/NativeError.js";
export {
    CoreErrorCode,
    ConnectionErrorCode,
    ThreadErrorCode,
    StoreErrorCode,
    InboxErrorCode,
    KvdbErrorCode,
    EventErrorCode,
    StreamRoomErrorCode,
} from "./native/NativeErrorCodes.js";
import {
    EventQueue,
    StoreApi,
    ThreadApi,
    InboxApi,
    KvdbApi,
    Connection,
    CryptoApi,
    BaseApi,
    StreamApi,
    ExtKey,
    EventApi,
} from "./service/index.js";
import * as Types from "./Types.js";
import { setEndpointLogger } from "./webStreams/Logger.js";
export type { LogLevelName, LogSink } from "./webStreams/Logger.js";

export {
    EndpointFactory as Endpoint,
    NativeError,
    setEndpointLogger,
    Types,
    EventQueue,
    StoreApi,
    ThreadApi,
    InboxApi,
    KvdbApi,
    CryptoApi,
    StreamApi,
    Connection,
    BaseApi,
    ExtKey,
    EventApi,
};
