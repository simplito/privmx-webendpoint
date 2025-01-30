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
import { PagingQuery, PagingList, Context } from "../Types";
import { BaseNative } from "../api/BaseNative";

export class Connection extends BaseApi {
  apisRefs: { [apiId: string]: { _apiServicePtr: number } } = {};
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
   * Disconnects from the Platform backend.
   *
   */
  async disconnect(): Promise<void> {
    await this.native.disconnect(this.servicePtr, []);
    await this.freeApis();
    await this.native.deleteConnection(this.servicePtr);
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
