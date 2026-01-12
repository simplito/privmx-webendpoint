/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { BaseApi } from "./BaseApi";
import { ConnectionNative } from "../api/ConnectionNative";
import { PagingQuery, PagingList, Context, UserInfo, PKIVerificationOptions, ConnectionEventType, ConnectionEventSelectorType } from "../Types";
import { BaseNative } from "../api/BaseNative";
import { UserVerifierInterface } from "./UserVerifierInterface";

export class Connection extends BaseApi {
  
  /**
   * //doc-gen:ignore
   */
  apisRefs: { [apiId: string]: { _apiServicePtr: number } } = {};

  /**
   * //doc-gen:ignore
   */
  nativeApisDeps: { [apiId: string]: BaseNative } = {};

  constructor(private native: ConnectionNative, ptr: number) {
    super(ptr);
  }

  /**
   * Gets the ID of the current connection.
   *
   * @returns {number} ID of the connection
   */
  async getConnectionId(): Promise<number> {
    return this.native.getConnectionId(this.servicePtr, []);
  }

  /**
   * Gets a list of Contexts available for the user.
   *
   * @param pagingQuery with list query parameters
   * @returns {PagingList<Context>} containing a list of Contexts
   */
  async listContexts(pagingQuery: PagingQuery): Promise<PagingList<Context>> {
    return this.native.listContexts(this.servicePtr, [pagingQuery]);
  }

  /**
   * Gets a list of users of given context.
   * 
   * @param contextId ID of the Context
   * 
   * @returns a list of the UserInfo objects
   */
  async listContextUsers(contextId: string, pagingQuery: PagingQuery): Promise<PagingList<UserInfo>> {
    return this.native.listContextUsers(this.servicePtr, [contextId, pagingQuery]);
  }

  /**
   * Subscribe for the Context events on the given subscription query.
   * 
   * @param {string[]} subscriptionQueries list of queries
   * @return list of subscriptionIds in matching order to subscriptionQueries
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
   * Generate subscription Query for the Context events.
   * @param {EventType} eventType type of event which you listen for
   * @param {EventSelectorType} selectorType scope on which you listen for events  
   * @param {string} selectorId ID of the selector
   */
  async buildSubscriptionQuery(eventType: ConnectionEventType, selectorType: ConnectionEventSelectorType, selectorId: string): Promise<string> {
    return this.native.buildSubscriptionQuery(this.servicePtr, [eventType, selectorType, selectorId]);
  }

  /**
   * Disconnects from the Platform backend.
   *
   */
  async disconnect(): Promise<void> {
    console.log("native 1");
    await this.native.disconnect(this.servicePtr, []);
    console.log("native 2");
    await this.freeApis();
    console.log("native 3");
    await this.native.deleteConnection(this.servicePtr);
       console.log("native 4");
  }

    /**
     * Sets user's custom verification callback.
     * 
     * The feature allows the developer to set up a callback for user verification. 
     * A developer can implement an interface and pass the implementation to the function. 
     * Each time data is read from the container, a callback will be triggered, allowing the developer to validate the sender in an external service,
     * e.g. Developer's Application Server or PKI Server.
     * @param verifier an implementation of the UserVerifierInterface
     * 
     */
    setUserVerifier(verifier: UserVerifierInterface): Promise<void> {
      return this.native.setUserVerifier(this.servicePtr, [this.servicePtr, verifier]);
    }

  private async freeApis() {
    console.warn("freeApis disabled for debugging purposes. Please re-enable");

    // for (const apiId in this.apisRefs) {
    //   if (this.nativeApisDeps[apiId]) {

    //     await this.nativeApisDeps[apiId].deleteApi(
    //       this.apisRefs[apiId]._apiServicePtr
    //     );
    //   }
    // }
  }
}
