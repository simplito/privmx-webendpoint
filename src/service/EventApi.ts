/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { BaseApi } from "./BaseApi.js";
import { EventApiNative } from "../native/EventApiNative.js";
import { EventsEventSelectorType, UserWithPubKey } from "../Types.js";

export class EventApi extends BaseApi {
    /**
     * Created by {@link EndpointFactory.createEventApi} - never
     * constructed by SDK users.
     * @internal
     */
    constructor(
        private native: EventApiNative,
        ptr: number,
    ) {
        super(ptr);
    }

    /**
     * Emits the custom event on the given Context and channel.
     *
     * @param {string} contextId ID of the Context
     * @param {UserWithPubKey[]} users list of UserWithPubKey objects which defines the recipients of the event
     * @param {string} channelName name of the Channel
     * @param {Uint8Array} eventData event's data
     * @returns {Promise<void>} resolves when the event has been delivered to the server
     */
    async emitEvent(
        contextId: string,
        users: UserWithPubKey[],
        channelName: string,
        eventData: Uint8Array,
    ) {
        return this.native.emitEvent(this.servicePtr, [contextId, users, channelName, eventData]);
    }

    /**
     * Subscribe for the custom events on the given subscription query.
     *
     * @param {string[]} subscriptionQueries list of queries
     * @returns {Promise<string[]>} list of subscriptionIds in matching order to subscriptionQueries
     */
    async subscribeFor(subscriptionQueries: string[]): Promise<string[]> {
        return this.native.subscribeFor(this.servicePtr, [subscriptionQueries]);
    }

    /**
     * Unsubscribe from events for the given subscriptionId.
     * @param {string[]} subscriptionIds list of subscriptionId
     * @returns {Promise<void>} resolves when all subscriptions have been cancelled
     */
    async unsubscribeFrom(subscriptionIds: string[]): Promise<void> {
        return this.native.unsubscribeFrom(this.servicePtr, [subscriptionIds]);
    }

    /**
     * Generate subscription Query for the custom events.
     * @param {string} channelName name of the Channel
     * @param {EventsEventSelectorType} selectorType scope on which you listen for events
     * @param {string} selectorId ID of the selector
     * @returns {Promise<string>} subscription query string consumed by {@link subscribeFor}
     */
    async buildSubscriptionQuery(
        channelName: string,
        selectorType: EventsEventSelectorType,
        selectorId: string,
    ): Promise<string> {
        return this.native.buildSubscriptionQuery(this.servicePtr, [
            channelName,
            selectorType,
            selectorId,
        ]);
    }
}
