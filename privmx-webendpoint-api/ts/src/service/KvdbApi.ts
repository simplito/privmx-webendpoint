/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { BaseApi } from "./BaseApi";
import { KvdbApiNative } from "../api/KvdbApiNative";
import {
  PagingQuery,
  PagingList,
  UserWithPubKey,
  Kvdb,
  ContainerPolicy,
  KvdbEntry,
  KvdbKeysPagingQuery,
  KvdbEntryPagingQuery,
} from "../Types";

export class KvdbApi extends BaseApi {
  constructor(protected native: KvdbApiNative, ptr: number) {
    super(ptr);
  }

  /**
   * Creates a new Kvdb in given Context.
   *
   * @param {string} contextId ID of the Context to create the Kvdb in
   * @param {UserWithPubKey[]} users array of UserWithPubKey structs which indicates who will have access to the created Kvdb
   * @param {UserWithPubKey[]} managers array of UserWithPubKey structs which indicates who will have access (and management rights) to
   * the created Kvdb
   * @param {Uint8Array} publicMeta public (unencrypted) metadata
   * @param {Uint8Array} privateMeta private (encrypted) metadata
   * @param {ContainerPolicy} policies Kvdb's policies
   * @returns {string} ID of the created Kvdb
   */
  async createKvdb(
    contextId: string,
    users: UserWithPubKey[],
    managers: UserWithPubKey[],
    publicMeta: Uint8Array,
    privateMeta: Uint8Array,
    policies?: ContainerPolicy,
  ): Promise<string> {
    return this.native.createKvdb(this.servicePtr, [
      contextId,
      users,
      managers,
      publicMeta,
      privateMeta,
      policies,
    ]);
  }

  /**
   * Updates an existing Kvdb.
   *
   * @param {string} kvdbId ID of the Kvdb to update
   * @param {UserWithPubKey[]} users array of UserWithPubKey structs which indicates who will have access to the created Kvdb
   * @param {UserWithPubKey[]} managers array of UserWithPubKey structs which indicates who will have access (and management rights) to
   * the created Kvdb
   * @param {Uint8Array} publicMeta public (unencrypted) metadata
   * @param {Uint8Array} privateMeta private (encrypted) metadata
   * @param {number} version current version of the updated Kvdb
   * @param {boolean} force force update (without checking version)
   * @param {boolean} forceGenerateNewKey force to regenerate a key for the Kvdb
   * @param {ContainerPolicy} policies Kvdb's policies
   */
  async updateKvdb(
    kvdbId: string,
    users: UserWithPubKey[],
    managers: UserWithPubKey[],
    publicMeta: Uint8Array,
    privateMeta: Uint8Array,
    version: number,
    force: boolean,
    forceGenerateNewKey: boolean,
    policies?: ContainerPolicy,
  ): Promise<void> {
    return this.native.updateKvdb(this.servicePtr, [
      kvdbId,
      users,
      managers,
      publicMeta,
      privateMeta,
      version,
      force,
      forceGenerateNewKey,
      policies,
    ]);
  }

  /**
   * Deletes a Kvdb by given Kvdb ID.
   *
   * @param {string} kvdbId ID of the Kvdb to delete
   */
  async deleteKvdb(kvdbId: string): Promise<void> {
    return this.native.deleteKvdb(this.servicePtr, [kvdbId]);
  }

  /**
   * Gets a Kvdb by given Kvdb ID.
   *
   * @param {string} kvdbId ID of Kvdb to get
   * @returns {Kvdb} struct containing info about the Kvdb
   */
  async getKvdb(kvdbId: string): Promise<Kvdb> {
    return this.native.getKvdb(this.servicePtr, [kvdbId]);
  }

  /**
   * Gets a list of Kvdbs in given Context.
   *
   * @param {string} contextId ID of the Context to get the Kvdbs from
   * @param {PagingQuery} pagingQuery struct with list query parameters
   * @returns {PagingList<Kvdb>} struct containing a list of Kvdbs
   */
  async listKvdbs(
    contextId: string,
    pagingQuery: PagingQuery
  ): Promise<PagingList<Kvdb>> {
    return this.native.listKvdbs(this.servicePtr, [contextId, pagingQuery]);
  }

  /**
   * Gets a kvdb entry by given kvdb entry key and kvdb ID.
   *
   * @param {string} kvdbId kvdb ID of the kvdb entry to get
   * @param {string} key key of the kvdb entry to get
   * @returns {Message} struct containing the kvdb entry
   */
  async getEntry(kvdbId: string, key: string): Promise<KvdbEntry> {
    return this.native.getEntry(this.servicePtr, [kvdbId, key]);
  }

  /**
   * Gets a list of kvdb entries keys from a Kvdb.
   *
   * @param {string} kvdbId ID of the Kvdb to list kvdb entries from
   * @param {KvdbKeysPagingQuery} pagingQuery struct with list query parameters
   * @returns {PagingList<string>} struct containing a list of kvdb entries
   */
  async listEntriesKeys(
    kvdbId: string,
    pagingQuery: KvdbKeysPagingQuery
  ): Promise<PagingList<string>> {
    return this.native.listEntriesKeys(this.servicePtr, [kvdbId, pagingQuery]);
  }

  /**
   * Gets a list of kvdb entries from a Kvdb.
   *
   * @param {string} kvdbId ID of the Kvdb to list kvdb entries from
   * @param {KvdbEntryPagingQuery} pagingQuery struct with list query parameters
   * @returns {PagingList<KvdbEntry>} struct containing a list of kvdb entries
   */
  async listEntries(
    kvdbId: string,
    pagingQuery: KvdbEntryPagingQuery
  ): Promise<PagingList<KvdbEntry>> {
    return this.native.listEntries(this.servicePtr, [kvdbId, pagingQuery]);
  }

  /**
   * Sends a kvdb entry in a Kvdb.
   * @param {string} kvdbId ID of the Kvdb to send kvdb entry to
   * @param {string} key 
   * @param {Uint8Array} publicMeta public kvdb entry metadata
   * @param {Uint8Array} privateMeta private kvdb entry metadata
   * @param {Uint8Array} data content of the kvdb entry
   * @returns {string} ID of the new kvdb entry
   */
  async setEntry(
    kvdbId: string,
    key: string,
    publicMeta: Uint8Array,
    privateMeta: Uint8Array,
    data: Uint8Array,
    version: number,
  ): Promise<void> {
    return this.native.setEntry(this.servicePtr, [
      kvdbId,
      key,
      publicMeta,
      privateMeta,
      data,
      version
    ]);
  }

  /**
   * Deletes a kvdb entry by given kvdb entry ID.
   *
   * @param {string} kvdbId kvdb ID of the kvdb entry to delete
   * @param {string} key key of the kvdb entry to delete
   */
  async deleteEntry(kvdbId: string, key: string): Promise<void> {
    return this.native.deleteEntry(this.servicePtr, [kvdbId, key]);
  }

  /**
   * Deletes a kvdb entries by given kvdb entry ID.
   *
   * @param {string} kvdbId kvdb ID of the kvdb entry to delete
   * @param {string[]} keys keys of the kvdb entries to delete
   */
  async deleteEntries(
    kvdbId: string,
    keys: string[],
  ): Promise<void> {
    return this.native.deleteEntries(this.servicePtr, [
      kvdbId,
      keys,
    ]);
  }

  /**
   * Subscribes for the Kvdb module main events.
   */
  async subscribeForKvdbEvents(): Promise<void> {
    return this.native.subscribeForKvdbEvents(this.servicePtr, []);
  }

  /**
   * Unsubscribes from the Kvdb module main events.
   */
  async unsubscribeFromKvdbEvents(): Promise<void> {
    return this.native.unsubscribeFromKvdbEvents(this.servicePtr, []);
  }

  /**
   * Subscribes for events in given Kvdb.
   * @param {string} kvdbId ID of the Kvdb to subscribe
   */
  async subscribeForEntryEvents(kvdbId: string): Promise<void> {
    return this.native.subscribeForEntryEvents(this.servicePtr, [kvdbId]);
  }

  /**
   * Unsubscribes from events in given Kvdb.
   * @param {string} kvdbId ID of the Kvdb to unsubscribe
   */
  async unsubscribeFromEntryEvents(kvdbId: string): Promise<void> {
    return this.native.unsubscribeFromEntryEvents(this.servicePtr, [
      kvdbId,
    ]);
  }
}
