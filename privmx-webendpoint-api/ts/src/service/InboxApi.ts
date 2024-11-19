/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { BaseApi } from "./BaseApi";
import { InboxApiNative } from "../api/InboxApiNative";
import {
  PagingQuery,
  PagingList,
  UserWithPubKey,
  Inbox,
  InboxPublicView,
  InboxEntry,
  FilesConfig,
  ContainerWithoutItemPolicy,
} from "../Types";

export class InboxApi extends BaseApi {
  constructor(private native: InboxApiNative, ptr: number) {
    super(ptr);
  }

  /**
   * Creates a new Inbox.
   *
   * @param {string} contextId ID of the Context of the new Inbox
   * @param {UserWithPubKey[]} users vector of UserWithPubKey structs which indicates who will have access to the created Inbox
   * @param {UserWithPubKey[]} managers vector of UserWithPubKey structs which indicates who will have access (and management rights) to
   * the created Inbox
   * @param {Uint8Array} publicMeta public (unencrypted) metadata
   * @param {Uint8Array} privateMeta private (encrypted) metadata
   * @param {FilesConfig} filesConfig struct to override default file configuration
   * @param {ContainerWithoutItemPolicy} policies contains policies for the Inbox
   * @returns {string} ID of the created Inbox
   */
  async createInbox(
    contextId: string,
    users: UserWithPubKey[],
    managers: UserWithPubKey[],
    publicMeta: Uint8Array,
    privateMeta: Uint8Array,
    filesConfig?: FilesConfig,
    policies?: ContainerWithoutItemPolicy,

  ): Promise<string> {
    return this.native.createInbox(this.servicePtr, [
      contextId,
      users,
      managers,
      publicMeta,
      privateMeta,
      filesConfig,
      policies,
    ]);
  }

  /**
   * Updates an existing Inbox.
   *
   * @param {string} inboxId ID of the Inbox to update
   * @param {UserWithPubKey[]} users vector of UserWithPubKey structs which indicates who will have access to the created Inbox
   * @param {UserWithPubKey[]} managers vector of UserWithPubKey structs which indicates who will have access (and management rights) to
   * the created Inbox
   * @param {Uint8Array} publicMeta public (unencrypted) metadata
   * @param {Uint8Array} privateMeta private (encrypted) metadata
   * @param {FilesConfig} filesConfig struct to override default files configuration
   * @param {number} version current version of the updated Inbox
   * @param {boolean} force force update (without checking version)
   * @param {boolean} forceGenerateNewKey force to regenerate a key for the Inbox
   * @param {ContainerWithoutItemPolicy} policies Inbox policies
   */
  async updateInbox(
    inboxId: string,
    users: UserWithPubKey[],
    managers: UserWithPubKey[],
    publicMeta: Uint8Array,
    privateMeta: Uint8Array,
    filesConfig: FilesConfig | undefined,
    version: number,
    force: boolean,
    forceGenerateNewKey: boolean,
    policies?: ContainerWithoutItemPolicy,
  ): Promise<void> {
    return this.native.updateInbox(this.servicePtr, [
      inboxId,
      users,
      managers,
      publicMeta,
      privateMeta,
      filesConfig,
      version,
      force,
      forceGenerateNewKey,
      policies,
    ]);
  }

  /**
   * Gets a single Inbox by given Inbox ID.
   *
   * @param {string} inboxId ID of the Inbox to get
   * @returns {Inbox} struct containing information about the Inbox
   */
  async getInbox(inboxId: string): Promise<Inbox> {
    return this.native.getInbox(this.servicePtr, [inboxId]);
  }

  /**
   * Gets s list of Inboxes in given Context.
   *
   * @param {string} contextId ID of the Context to get Inboxes from
   * @param {PagingQuery} pagingQuery struct with list query parameters
   * @returns {PagingList<Inbox>} struct containing list of Inboxes
   */
  async listInboxes(
    contextId: string,
    pagingQuery: PagingQuery
  ): Promise<PagingList<Inbox>> {
    return this.native.listInboxes(this.servicePtr, [contextId, pagingQuery]);
  }

  /**
   * Gets public data of given Inbox.
   * You do not have to be logged in to call this function.
   *
   * @param {string} inboxId ID of the Inbox to get
   * @returns {InboxPublicView} struct containing public accessible information about the Inbox
   */
  async getInboxPublicView(inboxId: string): Promise<InboxPublicView> {
    return this.native.getInboxPublicView(this.servicePtr, [inboxId]);
  }

  /**
   * Deletes an Inbox by given Inbox ID.
   *
   * @param {string} inboxId ID of the Inbox to delete
   */
  async deleteInbox(inboxId: string): Promise<void> {
    return this.native.deleteInbox(this.servicePtr, [inboxId]);
  }

  /**
   * Prepares a request to send data to an Inbox.
   * You do not have to be logged in to call this function.
   *
   * @param {string} inboxId ID of the Inbox to which the request applies
   * @param {Uint8Array} data entry data to send
   * @param {number[]} [inboxFileHandles] optional list of file handles that will be sent with the request
   * @param {string} [userPrivKey] optional sender's private key which can be used later to encrypt data for that sender
   * @returns {number} Inbox handle
   */
  async prepareEntry(
    inboxId: string,
    data: Uint8Array,
    inboxFileHandles: number[],
    userPrivKey?: string | undefined
  ): Promise<number> {
    return this.native.prepareEntry(this.servicePtr, [
      inboxId,
      data,
      inboxFileHandles,
      userPrivKey,
    ]);
  }

  /**
   * Sends data to an Inbox.
   * You do not have to be logged in to call this function.
   *
   * @param {string} inboxHandle ID of the Inbox to which the request applies
   */
  async sendEntry(inboxHandle: number): Promise<void> {
    return this.native.sendEntry(this.servicePtr, [inboxHandle]);
  }

  /**
   * Gets an entry from an Inbox.
   *
   * @param {string} inboxEntryId ID of an entry to read from the Inbox
   * @returns {InboxEntry} struct containing data of the selected entry stored in the Inbox
   */
  async readEntry(inboxEntryId: string): Promise<InboxEntry> {
    return this.native.readEntry(this.servicePtr, [inboxEntryId]);
  }

  /**
   * Gets list of entries in given Inbox.
   *
   * @param {string} inboxId ID of the Inbox
   * @param {PagingQuery} pagingQuery struct with list query parameters
   * @returns {PagingList<InboxEntry>} struct containing list of entries
   */
  async listEntries(
    inboxId: string,
    pagingQuery: PagingQuery
  ): Promise<PagingList<InboxEntry>> {
    return this.native.listEntries(this.servicePtr, [inboxId, pagingQuery]);
  }

  /**
   * Delete an entry from an Inbox.
   *
   * @param {string} inboxEntryId ID of an entry to delete from the Inbox
   */
  async deleteEntry(inboxEntryId: string): Promise<void> {
    return this.native.deleteEntry(this.servicePtr, [inboxEntryId]);
  }

  /**
   * Creates a file handle to send a file to an Inbox.
   * You do not have to be logged in to call this function.
   *
   * @param {Uint8Array} publicMeta public file metadata
   * @param {Uint8Array} privateMeta private file metadata
   * @param {number} fileSize size of the file to send
   * @returns {number} file handle
   */
  async createFileHandle(
    publicMeta: Uint8Array,
    privateMeta: Uint8Array,
    fileSize: number
  ): Promise<number> {
    return this.native.createFileHandle(this.servicePtr, [
      publicMeta,
      privateMeta,
      fileSize,
    ]);
  }

  /**
   * Sends a file's data chunk to an Inbox.
   * (note: To send the entire file - divide it into pieces of the desired size and call the function for each fragment.)
   * You do not have to be logged in to call this function.
   *
   * @param {number} inboxHandle ID of the Inbox to which the request applies
   * @param {number} inboxFileHandle handle to the file where the uploaded chunk belongs
   * @param {Uint8Array} dataChunk - file chunk to send
   */
  async writeToFile(
    inboxHandle: number,
    inboxFileHandle: number,
    dataChunk: Uint8Array
  ): Promise<void> {
    return this.native.writeToFile(this.servicePtr, [
      inboxHandle,
      inboxFileHandle,
      dataChunk,
    ]);
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
   *
   * @param {number} fileHandle handle to the file
   * @param {number} length size of data to read
   * @returns {Uint8Array} buffer with file data chunk
   */
  async readFromFile(fileHandle: number, length: number): Promise<Uint8Array> {
    return this.native.readFromFile(this.servicePtr, [fileHandle, length]);
  }

  /**
   * Moves file's read cursor.
   *
   * @param {number} fileHandle handle to the file
   * @param {number} position sets new cursor position
   */
  async seekInFile(fileHandle: number, position: number): Promise<void> {
    return this.native.seekInFile(this.servicePtr, [fileHandle, position]);
  }

  /**
   * Closes a file by given handle.
   *
   * @param {number} fileHandle handle to the file
   * @returns {string} ID of closed file
   */
  async closeFile(fileHandle: number): Promise<void> {
    return this.native.closeFile(this.servicePtr, [fileHandle]);
  }

  /**
   * Subscribes for the Inbox module main events.
   */
  async subscribeForInboxEvents(): Promise<void> {
    return this.native.subscribeForInboxEvents(this.servicePtr, []);
  }

  /**
   * Unsubscribes from the Inbox module main events.
   */
  async unsubscribeFromInboxEvents(): Promise<void> {
    return this.native.unsubscribeFromInboxEvents(this.servicePtr, []);
  }

  /**
   * Subscribes for events in given Inbox.
   * @param {string} inboxId ID of the Inbox to subscribe
   */
  async subscribeForEntryEvents(inboxId: string): Promise<void> {
    return this.native.subscribeForEntryEvents(this.servicePtr, [inboxId]);
  }

  /**
   * Unsubscribes from events in given Inbox.
   * @param {string} inboxId ID of the Inbox to unsubscribe
   */
  async unsubscribeFromEntryEvents(inboxId: string): Promise<void> {
    return this.native.unsubscribeFromEntryEvents(this.servicePtr, [inboxId]);
  }
}
