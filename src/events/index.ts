/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

export { EventManager } from "./EventManager.js";

export {
    createThreadSubscription,
    createStoreSubscription,
    createKvdbSubscription,
    createInboxSubscription,
    createEventSubscription,
    createConnectionSubscription,
    createUserEventSubscription,
    ConnectionStatusEventType,
} from "./subscriptions.js";

export type {
    Channel,
    GenericEvent,
    EventCallback,
    EventModule,
    EventSubscriber,
    EventSubscription,
    ThreadSubscription,
    StoreSubscription,
    InboxSubscription,
    KvdbSubscription,
    CustomEventSubscription,
    UserEventSubscription,
    ConnectionStatusSubscription,
    ThreadCallbackPayload,
    StoreCallbackPayload,
    InboxCallbackPayload,
    KvdbCallbackPayload,
    UserEventCallbackPayload,
    EventsCallbackPayload,
} from "./subscriptions.js";
