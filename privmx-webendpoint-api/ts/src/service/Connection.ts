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
import { PagingQuery, PagingList, Context, UserInfo } from "../Types";
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
   * @param pagingQuery struct with list query parameters
   * @returns {PagingList<Context>} struct containing a list of Contexts
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
  async getContextUsers(contextId: string): Promise<UserInfo[]> {
    return this.native.getContextUsers(this.servicePtr, [contextId]);
  }

  /**
   * Disconnects from the Platform backend.
   *
   */
  async disconnect(): Promise<void> {
    await this.native.disconnect(this.servicePtr, []);
    await this.freeApis();
    await this.native.deleteConnection(this.servicePtr);
  }

    /**
     * Sets user's custom verification callback.
     * 
     * The feature allows the developer to set up a callback for user verification. 
     * A developer can implement an interface and pass the implementation to the function. 
     * Each time data is read from the container, a callback will be triggered, allowing the developer to validate the sender in an external service,
     * e.g. Developers Application Server or PKI Server
     * @param verifier an implementation of the UserVerifierInterface
     * 
     */
    setUserVerifier(verifier: UserVerifierInterface) {
      return this.native.setUserVerifier(this.servicePtr, [this.servicePtr, verifier]);
    }

  private async freeApis() {
    for (const apiId in this.apisRefs) {
      if (this.nativeApisDeps[apiId]) {
        await this.nativeApisDeps[apiId].deleteApi(
          this.apisRefs[apiId]._apiServicePtr
        );
      }
    }
  }
}
