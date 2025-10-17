/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { BaseApi } from "./BaseApi";
import { EventApiNative } from "../api/EventApiNative";
import { EventsEventSelectorType, UserWithPubKey } from "../Types";

export class EventApi extends BaseApi {
  constructor(private native: EventApiNative, ptr: number) {
    super(ptr);
  }

    // /**
    //  * Creates an instance of 'EventApi'.
    //  * 
    //  * @param connection instance of 'Connection'
    //  * 
    //  * @return EventApi object
    //  */
    // static EventApi create(core::Connection& connection);
    // EventApi() = default;

    /**
     * Emits the custom event on the given Context and channel.
     * 
     * @param {string} contextId ID of the Context
     * @param {UserWithPubKey[]} users list of UserWithPubKey objects which defines the recipients of the event
     * @param {string} channelName name of the Channel
     * @param {Uint8Array} eventData event's data
     */
    async emitEvent(contextId: string, users: UserWithPubKey[], channelName: string, eventData: Uint8Array) {
      return this.native.emitEvent(this.servicePtr, [contextId, users, channelName, eventData]);
    }
    
    // /**
    //  * Subscribe for the custom events on the given channel.
    //  * 
    //  * @param {string} contextId ID of the Context
    //  * @param {string} channelName name of the Channel
    //  */
    // async subscribeForCustomEvents(contextId: string, channelName: string) {
    //   return this.native.subscribeForCustomEvents(this.servicePtr, [contextId, channelName]);
    // }
    
    // /**
    //  * Unsubscribe from the custom events on the given channel.
    //  * 
    //  * @param {string} contextId ID of the Context
    //  * @param {string} channelName name of the Channel
    //  */
    // async unsubscribeFromCustomEvents(contextId: string, channelName: string) {
    //   return this.native.unsubscribeFromCustomEvents(this.servicePtr, [contextId, channelName]);
    // }

    /**
     * Subscribe for the custom events on the given subscription query.
     * 
     * @param {string[]} subscriptionQueries list of queries
     * @return list of subscriptionIds in maching order to subscriptionQueries
     */
    async subscribeFor(subscriptionQueries: string[]): Promise<string[]> {
      return this.native.subscribeFor(this.servicePtr, [subscriptionQueries]);
    }

    /**
     * Unsubscribe from events for the given subscriptionId.
     * @param {string[]} subscriptionIds list of subscriptionId
     */
    async unsubscribeFrom(subscriptionIds: string[]): Promise<void> {
      return this.native.unsubscribeFrom(this.servicePtr, [subscriptionIds]);
    }

    /**
     * Generate subscription Query for the custom events.
     * @param {string} channelName name of the Channel
     * @param {EventSelectorType} selectorType scope on which you listen for events  
     * @param {string} selectorId ID of the selector
     */
    async buildSubscriptionQuery(channelName: string, selectorType: EventsEventSelectorType, selectorId: string): Promise<string> {
      return this.native.buildSubscriptionQuery(this.servicePtr, [channelName, selectorType, selectorId]);
    }
}
