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
import { UserWithPubKey } from "../Types";

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
     * @param {string} channelName name of the Channel
     * @param {Uint8Array} eventData event's data
     * @param {UserWithPubKey[]} users list of UserWithPubKey objects which defines the recipients of the event
     */
    async emitEvent(contextId: string, channelName: string, eventData: Uint8Array, users: UserWithPubKey[]) {
      return this.native.emitEvent(this.servicePtr, [contextId, channelName, eventData, users]);
    }
    
    /**
     * Subscribe for the custom events on the given channel.
     * 
     * @param {string} contextId ID of the Context
     * @param {string} channelName name of the Channel
     */
    async subscribeForCustomEvents(contextId: string, channelName: string) {
      return this.native.subscribeForCustomEvents(this.servicePtr, [contextId, channelName]);
    }
    
    /**
     * Unsubscribe from the custom events on the given channel.
     * 
     * @param {string} contextId ID of the Context
     * @param {string} channelName name of the Channel
     */
    async unsubscribeFromCustomEvents(contextId: string, channelName: string) {
      return this.native.unsubscribeFromCustomEvents(this.servicePtr, [contextId, channelName]);
    }
}
