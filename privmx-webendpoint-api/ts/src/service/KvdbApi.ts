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
  DeleteEntriesResult
} from "../Types";

export class KvdbApi extends BaseApi {
  constructor(protected native: KvdbApiNative, ptr: number) {
    super(ptr);
  }

  /**
   * Creates a new KVDB in given Context.
   *
   * @param {string} contextId ID of the Context to create the KVDB in
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
   * @param {string} kvdbId ID of the KVDB to update
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
   * Deletes a KVDB by given KVDB ID.
   *
   * @param {string} kvdbId ID of the KVDB to delete
   */
  async deleteKvdb(kvdbId: string): Promise<void> {
    return this.native.deleteKvdb(this.servicePtr, [kvdbId]);
  }

  /**
   * Gets a KVDB by given KVDB ID.
   *
   * @param {string} kvdbId ID of KVDB to get
   * @returns {Kvdb} containing info about the Kvdb
   */
  async getKvdb(kvdbId: string): Promise<Kvdb> {
    return this.native.getKvdb(this.servicePtr, [kvdbId]);
  }

  /**
   * Gets a list of Kvdbs in given Context.
   *
   * @param {string} contextId ID of the Context to get the Kvdbs from
   * @param {PagingQuery} pagingQuery with list query parameters
   * @returns {PagingList<Kvdb>} containing a list of Kvdbs
   */
  async listKvdbs(
    contextId: string,
    pagingQuery: PagingQuery
  ): Promise<PagingList<Kvdb>> {
    return this.native.listKvdbs(this.servicePtr, [contextId, pagingQuery]);
  }

  /**
   * Gets a KVDB entry by given KVDB entry key and KVDB ID.
   *
   * @param {string} kvdbId KVDB ID of the KVDB entry to get
   * @param {string} key key of the KVDB entry to get
   * @returns {KvdbEntry} containing the KVDB entry
   */
  async getEntry(kvdbId: string, key: string): Promise<KvdbEntry> {
    return this.native.getEntry(this.servicePtr, [kvdbId, key]);
  }

  /**
   * Check whether the KVDB entry exists.
   *
   * @param {string} kvdbId KVDB ID of the KVDB entry to check
   * @param {string} key key of the KVDB entry to check
   * @returns {boolean} 'true' if the KVDB has an entry with given key, 'false' otherwise
   */
  async hasEntry(kvdbId: string, key: string): Promise<boolean> {
    return this.native.hasEntry(this.servicePtr, [kvdbId, key]);
  }
  /**
   * Gets a list of KVDB entries keys from a Kvdb.
   *
   * @param {string} kvdbId ID of the KVDB to list KVDB entries from
   * @param {PagingQuery} pagingQuery with list query parameters
   * @returns {PagingList<string>} containing a list of KVDB entries
   */
  async listEntriesKeys(
    kvdbId: string,
    pagingQuery: PagingQuery
  ): Promise<PagingList<string>> {
    return this.native.listEntriesKeys(this.servicePtr, [kvdbId, pagingQuery]);
  }

  /**
   * Gets a list of KVDB entries from a Kvdb.
   *
   * @param {string} kvdbId ID of the KVDB to list KVDB entries from
   * @param {PagingQuery} pagingQuery with list query parameters
   * @returns {PagingList<KvdbEntry>} containing a list of KVDB entries
   */
  async listEntries(
    kvdbId: string,
    pagingQuery: PagingQuery
  ): Promise<PagingList<KvdbEntry>> {
    return this.native.listEntries(this.servicePtr, [kvdbId, pagingQuery]);
  }

  /**
   * Sets a KVDB entry in the given Kvdb.
   * @param {string} kvdbId ID of the KVDB to set the entry to
   * @param {string} key KVDB entry key
   * @param {Uint8Array} publicMeta public KVDB entry metadata
   * @param {Uint8Array} privateMeta private KVDB entry metadata
   * @param {Uint8Array} data content of the KVDB entry
   * @param {number} [version] KVDB entry version (when updating the entry)
   * @returns {string} ID of the KVDB entry
   */
  async setEntry(
    kvdbId: string,
    key: string,
    publicMeta: Uint8Array,
    privateMeta: Uint8Array,
    data: Uint8Array,
    version?: number,
  ): Promise<void> {
    return this.native.setEntry(this.servicePtr, [
      kvdbId,
      key,
      publicMeta,
      privateMeta,
      data,
      version || 0
    ]);
  }

  /**
   * Deletes a KVDB entry by given KVDB entry ID.
   *
   * @param {string} kvdbId KVDB ID of the KVDB entry to delete
   * @param {string} key key of the KVDB entry to delete
   */
  async deleteEntry(kvdbId: string, key: string): Promise<void> {
    return this.native.deleteEntry(this.servicePtr, [kvdbId, key]);
  }

  /**
   * Deletes KVDB entries by given KVDB IDs and the list of entry keys.
   *
   * @param {string} kvdbId ID of the KVDB database to delete from
   * @param {string[]} keys keys of the KVDB entries to delete
   * @returns {Map<string, boolean>} map with the statuses of deletion for every key
   */
  async deleteEntries(
    kvdbId: string,
    keys: string[],
  ): Promise<DeleteEntriesResult> {
    return this.native.deleteEntries(this.servicePtr, [
      kvdbId,
      keys,
    ]);
  }

  /**
   * Subscribes for the KVDB module main events.
   */
  async subscribeForKvdbEvents(): Promise<void> {
    return this.native.subscribeForKvdbEvents(this.servicePtr, []);
  }

  /**
   * Unsubscribes from the KVDB module main events.
   */
  async unsubscribeFromKvdbEvents(): Promise<void> {
    return this.native.unsubscribeFromKvdbEvents(this.servicePtr, []);
  }

  /**
   * Subscribes for events in given Kvdb.
   * @param {string} kvdbId ID of the KVDB to subscribe
   */
  async subscribeForEntryEvents(kvdbId: string): Promise<void> {
    return this.native.subscribeForEntryEvents(this.servicePtr, [kvdbId]);
  }

  /**
   * Unsubscribes from events in given Kvdb.
   * @param {string} kvdbId ID of the KVDB to unsubscribe
   */
  async unsubscribeFromEntryEvents(kvdbId: string): Promise<void> {
    return this.native.unsubscribeFromEntryEvents(this.servicePtr, [
      kvdbId,
    ]);
  }
}
