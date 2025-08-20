/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { BaseApi } from "./BaseApi";
import { StoreApiNative } from "../api/StoreApiNative";
import { PagingQuery, PagingList, UserWithPubKey, Store, File, ContainerPolicy, StoreEventSelectorType, StoreEventType } from "../Types";

export class StoreApi extends BaseApi {
  constructor(private native: StoreApiNative, ptr: number) {
    super(ptr);
  }

  /**
   * Creates a new Store in given Context.
   *
   * @param {string} contextId ID of the Context to create the Store in
   * @param {UserWithPubKey[]} users array of UserWithPubKey structs which indicates who will have access to the created Store
   * @param {UserWithPubKey[]} managers array of UserWithPubKey structs which indicates who will have access (and management rights) to the
   * created Store
   * @param {Uint8Array} publicMeta public (unencrypted) metadata
   * @param {Uint8Array} privateMeta private (encrypted) metadata
   * @param {ContainerPolicy} policies Store's policies
   * @returns {string} created Store ID
   */
  async createStore(
    contextId: string,
    users: UserWithPubKey[],
    managers: UserWithPubKey[],
    publicMeta: Uint8Array,
    privateMeta: Uint8Array,
    policies?: ContainerPolicy,
  ): Promise<string> {
    return this.native.createStore(this.servicePtr, [
      contextId,
      users,
      managers,
      publicMeta,
      privateMeta,
      policies
    ]);
  }

  /**
   * Updates an existing Store.
   *
   * @param {string} storeId ID of the Store to update
   * @param {UserWithPubKey[]} users array of UserWithPubKey structs which indicates who will have access to the created Store
   * @param {UserWithPubKey[]} managers array of UserWithPubKey structs which indicates who will have access (and management rights) to the
   * created Store
   * @param {Uint8Array} publicMeta public (unencrypted) metadata
   * @param {Uint8Array} privateMeta private (encrypted) metadata
   * @param {number} version current version of the updated Store
   * @param {boolean} force force update (without checking version)
   * @param {boolean} forceGenerateNewKey force to regenerate a key for the Store
   * @param {ContainerPolicy} policies Store's policies
   */
  async updateStore(
    storeId: string,
    users: UserWithPubKey[],
    managers: UserWithPubKey[],
    publicMeta: Uint8Array,
    privateMeta: Uint8Array,
    version: number,
    force: boolean,
    forceGenerateNewKey: boolean,
    policies?: ContainerPolicy,
  ): Promise<void> {
    return this.native.updateStore(this.servicePtr, [
      storeId,
      users,
      managers,
      publicMeta,
      privateMeta,
      version,
      force,
      forceGenerateNewKey,
      policies
    ]);
  }

  /**
   * Deletes a Store by given Store ID.
   *
   * @param {string} storeId ID of the Store to delete
   */
  async deleteStore(storeId: string): Promise<void> {
    return this.native.deleteStore(this.servicePtr, [storeId]);
  }

  /**
   * Gets a single Store by given Store ID.
   *
   * @param {string} storeId ID of the Store to get
   * @returns {Store}  containing information about the Store
   */
  async getStore(storeId: string): Promise<Store> {
    return this.native.getStore(this.servicePtr, [storeId]);
  }

  /**
   * Gets a list of Stores in given Context.
   *
   * @param {string} contextId ID of the Context to get the Stores from
   * @param {PagingQuery} pagingQuery  with list query parameters
   * @returns {PagingList<Store>}  containing list of Stores
   */
  async listStores(
    contextId: string,
    pagingQuery: PagingQuery
  ): Promise<PagingList<Store>> {
    return this.native.listStores(this.servicePtr, [contextId, pagingQuery]);
  }

  /**
   * Creates a new file in a Store.
   *
   * @param {string} storeId ID of the Store to create the file in
   * @param {Uint8Array} publicMeta public file metadata
   * @param {Uint8Array} privateMeta private file metadata
   * @param {number} size size of the file
   * @param {boolean} randomWriteSupport enable random write support for file
   * @returns {number} handle to write data
   */
  async createFile(
    storeId: string,
    publicMeta: Uint8Array,
    privateMeta: Uint8Array,
    size: number,
    randomWriteSupport?: boolean
  ): Promise<number> {
    return this.native.createFile(this.servicePtr, [
      storeId,
      publicMeta,
      privateMeta,
      size,
      randomWriteSupport
    ]);
  }

  /**
   * Update an existing file in a Store.
   *
   * @param {string} fileId ID of the file to update
   * @param {Uint8Array} publicMeta public file metadata
   * @param {Uint8Array} privateMeta private file metadata
   * @param {number} size size of the file
   * @returns {number} handle to write file data
   */
  async updateFile(
    fileId: string,
    publicMeta: Uint8Array,
    privateMeta: Uint8Array,
    size: number
  ): Promise<number> {
    return this.native.updateFile(this.servicePtr, [
      fileId,
      publicMeta,
      privateMeta,
      size,
    ]);
  }

  /**
   * Update metadata of an existing file in a Store.
   *
   * @param {string} fileId ID of the file to update
   * @param {Uint8Array} publicMeta public file metadata
   * @param {Uint8Array} privateMeta private file metadata
   */
  async updateFileMeta(
    fileId: string,
    publicMeta: Uint8Array,
    privateMeta: Uint8Array
  ): Promise<void> {
    return this.native.updateFileMeta(this.servicePtr, [
      fileId,
      publicMeta,
      privateMeta,
    ]);
  }

  /**
   * Writes a file data.
   *
   * @param {number} fileHandle handle to write file data
   * @param {Uint8Array} dataChunk file data chunk
   * @param {boolean} [truncate] truncate the file from: current pos + dataChunk size
   */
  async writeToFile(fileHandle: number, dataChunk: Uint8Array, truncate?: boolean): Promise<void> {
    return this.native.writeToFile(this.servicePtr, [fileHandle, dataChunk, truncate]);
  }

  /**
   * Deletes a file by given ID.
   *
   * @param {string} fileId ID of the file to delete
   */
  async deleteFile(fileId: string): Promise<void> {
    return this.native.deleteFile(this.servicePtr, [fileId]);
  }

  /**
   * Gets a single file by the given file ID.
   *
   * @param {string} fileId ID of the file to get
   * @returns {File}  containing information about the file
   */
  async getFile(fileId: string): Promise<File> {
    return this.native.getFile(this.servicePtr, [fileId]);
  }

  /**
   * Gets a list of files in given Store.
   *
   * @param {string} storeId ID of the Store to get files from
   * @param {PagingQuery} pagingQuery  with list query parameters
   * @returns {PagingList<File>}  containing list of files
   */
  async listFiles(
    storeId: string,
    pagingQuery: PagingQuery
  ): Promise<PagingList<File>> {
    return this.native.listFiles(this.servicePtr, [storeId, pagingQuery]);
  }

  /**
   * Opens a file to read.
   *
   * @param {string} fileId ID of the file to read
   * @returns {number} handle to read file data
   */
  async openFile(fileId: string): Promise<number> {
    return this.native.openFile(this.servicePtr, [fileId]);
  }

  /**
   * Reads file data.
   * Single read call moves the files's cursor position by declared length or set it at the end of the file.
   *
   * @param {string} fileHandle handle to write file data
   * @param {number} length size of data to read
   * @returns {Uint8Array} array buffer with file data chunk
   */
  async readFromFile(fileHandle: number, length: number): Promise<Uint8Array> {
    return this.native.readFromFile(this.servicePtr, [fileHandle, length]);
  }

  /**
   * Moves read cursor.
   *
   * @param {string} fileHandle handle to write file data
   * @param {number} position new cursor position
   */
  async seekInFile(fileHandle: number, position: number): Promise<void> {
    return this.native.seekInFile(this.servicePtr, [fileHandle, position]);
  }

  /**
   * Closes the file handle.
   *
   * @param {string} fileHandle handle to read/write file data
   * @returns {string} ID of closed file
   */
  async closeFile(fileHandle: number): Promise<string> {
    return this.native.closeFile(this.servicePtr, [fileHandle]);
  }

  // /**
  //  * Subscribes for the Store module main events.
  //  */
  // async subscribeForStoreEvents(): Promise<void> {
  //   return this.native.subscribeForStoreEvents(this.servicePtr, []);
  // }

  // /**
  //  * Unsubscribes from the Store module main events.
  //  */
  // async unsubscribeFromStoreEvents(): Promise<void> {
  //   return this.native.unsubscribeFromStoreEvents(this.servicePtr, []);
  // }

  // /**
  //  * Subscribes for events in given Store.
  //  * @param {string} storeId ID of the Store to subscribe
  //  */
  // async subscribeForFileEvents(storeId: string): Promise<void> {
  //   return this.native.subscribeForFileEvents(this.servicePtr, [storeId]);
  // }

  // /**
  //  * Unsubscribes from events in given Store.
  //  * @param {string} storeId ID of the Store to unsubscribe
  //  */
  // async unsubscribeFromFileEvents(storeId: string): Promise<void> {
  //   return this.native.unsubscribeFromFileEvents(this.servicePtr, [storeId]);
  // }

  /**
   * Subscribe for the Store events on the given subscription query.
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
     * Generate subscription Query for the Store events.
     * @param {EventType} eventType type of event which you listen for
     * @param {EventSelectorType} selectorType scope on which you listen for events  
     * @param {string} selectorId ID of the selector
     */
    async buildSubscriptionQuery(eventType: StoreEventType, selectorType: StoreEventSelectorType, selectorId: string): Promise<string> {
      return this.native.buildSubscriptionQuery(this.servicePtr, [eventType, selectorType, selectorId]);
    }  
}
