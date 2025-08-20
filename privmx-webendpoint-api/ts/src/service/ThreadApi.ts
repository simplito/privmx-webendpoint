/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { BaseApi } from "./BaseApi";
import { ThreadApiNative } from "../api/ThreadApiNative";
import {
  PagingQuery,
  PagingList,
  UserWithPubKey,
  Thread,
  Message,
  ContainerPolicy,
  ThreadEventType,
  ThreadEventSelectorType,
} from "../Types";

export class ThreadApi extends BaseApi {
  constructor(protected native: ThreadApiNative, ptr: number) {
    super(ptr);
  }

  /**
   * Creates a new Thread in given Context.
   *
   * @param {string} contextId ID of the Context to create the Thread in
   * @param {UserWithPubKey[]} users array of UserWithPubKey structs which indicates who will have access to the created Thread
   * @param {UserWithPubKey[]} managers array of UserWithPubKey structs which indicates who will have access (and management rights) to
   * the created Thread
   * @param {Uint8Array} publicMeta public (unencrypted) metadata
   * @param {Uint8Array} privateMeta private (encrypted) metadata
   * @param {ContainerPolicy} policies Thread's policies
   * @returns {string} ID of the created Thread
   */
  async createThread(
    contextId: string,
    users: UserWithPubKey[],
    managers: UserWithPubKey[],
    publicMeta: Uint8Array,
    privateMeta: Uint8Array,
    policies?: ContainerPolicy,
  ): Promise<string> {
    return this.native.createThread(this.servicePtr, [
      contextId,
      users,
      managers,
      publicMeta,
      privateMeta,
      policies,
    ]);
  }

  /**
   * Updates an existing Thread.
   *
   * @param {string} threadId ID of the Thread to update
   * @param {UserWithPubKey[]} users array of UserWithPubKey structs which indicates who will have access to the created Thread
   * @param {UserWithPubKey[]} managers array of UserWithPubKey structs which indicates who will have access (and management rights) to
   * the created Thread
   * @param {Uint8Array} publicMeta public (unencrypted) metadata
   * @param {Uint8Array} privateMeta private (encrypted) metadata
   * @param {number} version current version of the updated Thread
   * @param {boolean} force force update (without checking version)
   * @param {boolean} forceGenerateNewKey force to regenerate a key for the Thread
   * @param {ContainerPolicy} policies Thread's policies
   */
  async updateThread(
    threadId: string,
    users: UserWithPubKey[],
    managers: UserWithPubKey[],
    publicMeta: Uint8Array,
    privateMeta: Uint8Array,
    version: number,
    force: boolean,
    forceGenerateNewKey: boolean,
    policies?: ContainerPolicy,
  ): Promise<void> {
    return this.native.updateThread(this.servicePtr, [
      threadId,
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
   * Deletes a Thread by given Thread ID.
   *
   * @param {string} threadId ID of the Thread to delete
   */
  async deleteThread(threadId: string): Promise<void> {
    return this.native.deleteThread(this.servicePtr, [threadId]);
  }

  /**
   * Gets a Thread by given Thread ID.
   *
   * @param {string} threadId ID of Thread to get
   * @returns {Thread}  containing info about the Thread
   */
  async getThread(threadId: string): Promise<Thread> {
    return this.native.getThread(this.servicePtr, [threadId]);
  }

  /**
   * Gets a list of Threads in given Context.
   *
   * @param {string} contextId ID of the Context to get the Threads from
   * @param {PagingQuery} pagingQuery  with list query parameters
   * @returns {PagingList<Thread>}  containing a list of Threads
   */
  async listThreads(
    contextId: string,
    pagingQuery: PagingQuery
  ): Promise<PagingList<Thread>> {
    return this.native.listThreads(this.servicePtr, [contextId, pagingQuery]);
  }

  /**
   * Gets a message by given message ID.
   *
   * @param {string} messageId ID of the message to get
   * @returns {Message}  containing the message
   */
  async getMessage(messageId: string): Promise<Message> {
    return this.native.getMessage(this.servicePtr, [messageId]);
  }

  /**
   * Gets a list of messages from a Thread.
   *
   * @param {string} threadId ID of the Thread to list messages from
   * @param {PagingQuery} pagingQuery  with list query parameters
   * @returns {PagingList<Message>}  containing a list of messages
   */
  async listMessages(
    threadId: string,
    pagingQuery: PagingQuery
  ): Promise<PagingList<Message>> {
    return this.native.listMessages(this.servicePtr, [threadId, pagingQuery]);
  }

  /**
   * Sends a message in a Thread.
   *
   * @param {string} threadId ID of the Thread to send message to
   * @param {Uint8Array} publicMeta public message metadata
   * @param {Uint8Array} privateMeta private message metadata
   * @param {Uint8Array} data content of the message
   * @returns {string} ID of the new message
   */
  async sendMessage(
    threadId: string,
    publicMeta: Uint8Array,
    privateMeta: Uint8Array,
    data: Uint8Array
  ): Promise<string> {
    return this.native.sendMessage(this.servicePtr, [
      threadId,
      publicMeta,
      privateMeta,
      data,
    ]);
  }

  /**
   * Deletes a message by given message ID.
   *
   * @param {string} messageId ID of the message to delete
   */
  async deleteMessage(messageId: string): Promise<void> {
    return this.native.deleteMessage(this.servicePtr, [messageId]);
  }

  /**
   * Update message in a Thread.
   *
   * @param {string} messageId ID of the message to update
   * @param {Uint8Array} publicMeta public message metadata
   * @param {Uint8Array} privateMeta private message metadata
   * @param {Uint8Array} data content of the message
   */
  async updateMessage(
    messageId: string,
    publicMeta: Uint8Array,
    privateMeta: Uint8Array,
    data: Uint8Array
  ): Promise<void> {
    return this.native.updateMessage(this.servicePtr, [
      messageId,
      publicMeta,
      privateMeta,
      data,
    ]);
  }

  // /**
  //  * Subscribes for the Thread module main events.
  //  */
  // async subscribeForThreadEvents(): Promise<void> {
  //   return this.native.subscribeForThreadEvents(this.servicePtr, []);
  // }

  // /**
  //  * Unsubscribes from the Thread module main events.
  //  */
  // async unsubscribeFromThreadEvents(): Promise<void> {
  //   return this.native.unsubscribeFromThreadEvents(this.servicePtr, []);
  // }

  // /**
  //  * Subscribes for events in given Thread.
  //  * @param {string} threadId ID of the Thread to subscribe
  //  */
  // async subscribeForMessageEvents(threadId: string): Promise<void> {
  //   return this.native.subscribeForMessageEvents(this.servicePtr, [threadId]);
  // }

  // /**
  //  * Unsubscribes from events in given Thread.
  //  * @param {string} threadId ID of the Thread to unsubscribe
  //  */
  // async unsubscribeFromMessageEvents(threadId: string): Promise<void> {
  //   return this.native.unsubscribeFromMessageEvents(this.servicePtr, [
  //     threadId,
  //   ]);
  // }

  /**
   * Subscribe for the Thread events on the given subscription query.
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
     * Generate subscription Query for the Thread events.
     * @param {EventType} eventType type of event which you listen for
     * @param {EventSelectorType} selectorType scope on which you listen for events  
     * @param {string} selectorId ID of the selector
     */
    async buildSubscriptionQuery(eventType: ThreadEventType, selectorType: ThreadEventSelectorType, selectorId: string): Promise<string> {
      return this.native.buildSubscriptionQuery(this.servicePtr, [eventType, selectorType, selectorId]);
    }
}
