/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { BaseApi } from "./BaseApi.js";
import { ThreadApiNative } from "../native/ThreadApiNative.js";
import {
    PagingQuery,
    PagingList,
    UserWithPubKey,
    Thread,
    Message,
    ContainerPolicy,
    ThreadEventType,
    ThreadEventSelectorType,
} from "../Types.js";

/**
 * Encrypted messaging API: manages Threads (message containers shared by a
 * fixed set of users within a Context) and the end-to-end encrypted messages
 * inside them. Message content is encrypted in the browser before upload —
 * the Bridge server only ever stores ciphertext (plus the deliberately public
 * `publicMeta`).
 *
 * Obtain an instance via {@link EndpointFactory.createThreadApi}; do not
 * construct it directly.
 *
 * ## Workflow
 * Messaging: {@link createThread} → {@link sendMessage} →
 * {@link listMessages} / {@link getMessage}; change membership or metadata
 * with {@link updateThread}.
 *
 * Events: {@link buildSubscriptionQuery} → {@link subscribeFor} → consume via
 * {@link EventQueue.waitEvent} → {@link unsubscribeFrom}.
 *
 * All methods reject with `NativeError` on server/crypto errors and throw
 * `Error` when the underlying connection has been closed.
 */
export class ThreadApi extends BaseApi {
    /**
     * @internal Created by EndpointFactory — never constructed by SDK users.
     */
    constructor(
        private native: ThreadApiNative,
        ptr: number,
    ) {
        super(ptr);
    }

    /**
     * Creates a new Thread in the given Context and returns the new Thread's ID.
     *
     * A random 256-bit thread key is generated client-side and encrypted
     * separately for each listed user with ECIES using their public key — the
     * server stores only the encrypted per-user key entries and cannot read
     * the key. `privateMeta` is encrypted client-side with the thread key;
     * `publicMeta` is stored unencrypted on the server.
     *
     * Entry point of the messaging workflow: follow with {@link sendMessage}
     * and {@link listMessages}. Adjust members or metadata later with
     * {@link updateThread}.
     *
     * @param {string} contextId ID of the Context to create the Thread in,
     *   from `Context.contextId` returned by {@link Connection.listContexts}
     * @param {UserWithPubKey[]} users members allowed to read and post in the
     *   Thread; build the entries from {@link Connection.listContextUsers}
     * @param {UserWithPubKey[]} managers members who can additionally update
     *   or delete the Thread; build the entries from
     *   {@link Connection.listContextUsers}
     * @param {Uint8Array} publicMeta metadata stored unencrypted on the
     *   server — readable by the Bridge, so never place secrets here
     * @param {Uint8Array} privateMeta metadata encrypted client-side with the
     *   thread key; only Thread members can decrypt it
     * @param {ContainerPolicy} [policies] fine-grained access rules (who may
     *   post, update or delete items) overriding the Context defaults
     * @returns {string} ID of the new Thread — pass to {@link sendMessage},
     *   {@link listMessages}, {@link getThread} or {@link updateThread}
     * @throws {NativeError} when the Context does not exist or a listed user
     *   is not registered in it
     * @example
     * const threadId = await threadApi.createThread(
     *     contextId, users, managers,
     *     new TextEncoder().encode("{}"),               // publicMeta (server-readable)
     *     new TextEncoder().encode("project chat"));    // privateMeta (encrypted)
     * await threadApi.sendMessage(threadId, new Uint8Array(), new Uint8Array(),
     *     new TextEncoder().encode("Hello!"));
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
     * Replaces the member lists, metadata and (optionally) the encryption key
     * of an existing Thread.
     *
     * The thread key list is re-encrypted for the new user set (ECIES on each
     * user's public key). With `forceGenerateNewKey` a fresh thread key is
     * generated, so removed users cannot decrypt messages sent after the
     * update.
     *
     * The update is a full replacement, not a diff — fetch the current state
     * with {@link getThread}, modify it, and pass the Thread's `version` back
     * so concurrent modifications are detected. Set `forceGenerateNewKey`
     * whenever you remove users.
     *
     * @param {string} threadId ID of the Thread to update, returned by
     *   {@link createThread} or from `Thread.threadId` in {@link listThreads}
     * @param {UserWithPubKey[]} users full replacement list of members allowed
     *   to read and post; users missing from this list lose access
     * @param {UserWithPubKey[]} managers full replacement list of members with
     *   management rights (update / delete the Thread)
     * @param {Uint8Array} publicMeta new metadata stored unencrypted on the
     *   server — never place secrets here
     * @param {Uint8Array} privateMeta new metadata encrypted client-side with
     *   the thread key
     * @param {number} version current Thread version, from `Thread.version`
     *   returned by {@link getThread} — lets the server reject stale updates
     * @param {boolean} force `true` skips the `version` check and overwrites
     *   any concurrent modification
     * @param {boolean} forceGenerateNewKey when `true`, a fresh thread key is
     *   generated by the WASM core and redistributed, so users removed by this
     *   update cannot decrypt messages sent afterwards — set it whenever you
     *   revoke access
     * @param {ContainerPolicy} [policies] new access policies; omit to keep
     *   the current ones
     * @throws {NativeError} when the Thread does not exist, the user lacks
     *   management rights, or `version` does not match the server state
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
     * Permanently deletes a Thread together with all its messages.
     *
     * The server removes the Thread record, its encrypted per-user key entries
     * and every stored message ciphertext — there is no undo.
     *
     * Requires management rights to the Thread (see the `managers` list of
     * {@link createThread} / {@link updateThread}). To merely revoke access,
     * keep the Thread and remove users with {@link updateThread} instead.
     *
     * @param {string} threadId ID of the Thread to delete, returned by
     *   {@link createThread} or from `Thread.threadId` in {@link listThreads}
     * @throws {NativeError} when the Thread does not exist or the user lacks
     *   management rights
     */
    async deleteThread(threadId: string): Promise<void> {
        return this.native.deleteThread(this.servicePtr, [threadId]);
    }

    /**
     * Fetches a single Thread with its metadata, member lists and version.
     *
     * Downloads the Thread record from the Bridge and decrypts `privateMeta`
     * client-side with the user's copy of the thread key; `publicMeta` arrives
     * as stored, unencrypted.
     *
     * Use it to display Thread details or to obtain the current `version`
     * required by {@link updateThread}.
     *
     * @param {string} threadId ID of the Thread to fetch, returned by
     *   {@link createThread} or from `Thread.threadId` in {@link listThreads}
     * @returns {Thread} decrypted Thread data — `version` feeds
     *   {@link updateThread}; `threadId` feeds {@link sendMessage} and
     *   {@link listMessages}
     * @throws {NativeError} when the Thread does not exist or the user is not
     *   a member of it
     */
    async getThread(threadId: string): Promise<Thread> {
        return this.native.getThread(this.servicePtr, [threadId]);
    }

    /**
     * Lists the Threads of a Context that the user is a member of, one page
     * at a time.
     *
     * Downloads the Thread records from the Bridge and decrypts each
     * `privateMeta` client-side with the corresponding thread key.
     *
     * Typically the first ThreadApi call after connecting — pick a Thread from
     * the result and read it with {@link listMessages}.
     *
     * @param {string} contextId ID of the Context to enumerate, from
     *   `Context.contextId` returned by {@link Connection.listContexts}
     * @param {PagingQuery} pagingQuery pagination and sorting; start with
     *   `{ skip: 0, limit: 100, sortOrder: "desc" }` and page using `skip`
     *   or `lastId`
     * @returns {PagingList<Thread>} one page of Threads plus `totalAvailable`;
     *   use `Thread.threadId` with {@link sendMessage} or {@link listMessages}
     */
    async listThreads(contextId: string, pagingQuery: PagingQuery): Promise<PagingList<Thread>> {
        return this.native.listThreads(this.servicePtr, [contextId, pagingQuery]);
    }

    /**
     * Fetches and decrypts a single message.
     *
     * Downloads the message from the Bridge and decrypts `data` and
     * `privateMeta` client-side with the thread key; per-field SHA-256
     * checksums and the author's ECDSA signature protect the content against
     * tampering, and `Message.authorPubKey` identifies the signer.
     *
     * Use it to resolve a single message ID delivered by an event
     * subscription ({@link subscribeFor}); for bulk reading prefer
     * {@link listMessages}.
     *
     * @param {string} messageId ID of the message, returned by
     *   {@link sendMessage} or from `Message.info.messageId` in
     *   {@link listMessages}
     * @returns {Message} decrypted message — payload in `data`, metadata and
     *   author info alongside
     * @throws {NativeError} when the message does not exist or the user is
     *   not a member of its Thread
     */
    async getMessage(messageId: string): Promise<Message> {
        return this.native.getMessage(this.servicePtr, [messageId]);
    }

    /**
     * Lists the messages of a Thread, one page at a time.
     *
     * Downloads the message records from the Bridge and decrypts each
     * message's `data` and `privateMeta` client-side with the thread key;
     * signatures and checksums are verified during decryption.
     *
     * The standard way to render a conversation — typically called right
     * after picking a Thread from {@link listThreads}.
     *
     * @param {string} threadId ID of the Thread to read, returned by
     *   {@link createThread} or from `Thread.threadId` in {@link listThreads}
     * @param {PagingQuery} pagingQuery pagination and sorting; start with
     *   `{ skip: 0, limit: 100, sortOrder: "desc" }` and page using `skip`
     *   or `lastId`
     * @returns {PagingList<Message>} one page of decrypted messages plus
     *   `totalAvailable`; use `Message.info.messageId` with
     *   {@link updateMessage} or {@link deleteMessage}
     * @throws {NativeError} when the Thread does not exist or the user is not
     *   a member of it
     */
    async listMessages(threadId: string, pagingQuery: PagingQuery): Promise<PagingList<Message>> {
        return this.native.listMessages(this.servicePtr, [threadId, pagingQuery]);
    }

    /**
     * Sends a new message to a Thread and returns the new message's ID.
     *
     * `data` and `privateMeta` are encrypted client-side with the thread key
     * and signed with the sender's private key before upload — the server
     * stores only ciphertext; `publicMeta` is stored unencrypted.
     *
     * Core call of the messaging workflow after {@link createThread}; other
     * members receive the message via {@link listMessages} or a
     * {@link subscribeFor} event subscription.
     *
     * @param {string} threadId ID of the destination Thread, returned by
     *   {@link createThread} or from `Thread.threadId` in {@link listThreads}
     * @param {Uint8Array} publicMeta message metadata stored unencrypted on
     *   the server — readable by the Bridge, so never place secrets here
     * @param {Uint8Array} privateMeta message metadata encrypted client-side
     *   with the thread key; only Thread members can decrypt it
     * @param {Uint8Array} data message payload, encrypted client-side with
     *   the thread key before upload
     * @returns {string} ID of the new message — pass to {@link getMessage},
     *   {@link updateMessage} or {@link deleteMessage}
     * @throws {NativeError} when the Thread does not exist or the user is not
     *   allowed to post in it
     */
    async sendMessage(
        threadId: string,
        publicMeta: Uint8Array,
        privateMeta: Uint8Array,
        data: Uint8Array,
    ): Promise<string> {
        return this.native.sendMessage(this.servicePtr, [threadId, publicMeta, privateMeta, data]);
    }

    /**
     * Permanently deletes a single message from its Thread.
     *
     * The server removes the message ciphertext and its metadata — there is
     * no undo.
     *
     * Allowed for the message author or users granted the right by the
     * Thread's policies (see {@link createThread}); to change content instead
     * of removing it, use {@link updateMessage}.
     *
     * @param {string} messageId ID of the message to delete, returned by
     *   {@link sendMessage} or from `Message.info.messageId` in
     *   {@link listMessages}
     * @throws {NativeError} when the message does not exist or the user lacks
     *   the required rights
     */
    async deleteMessage(messageId: string): Promise<void> {
        return this.native.deleteMessage(this.servicePtr, [messageId]);
    }

    /**
     * Replaces the content and metadata of an existing message.
     *
     * The new `data` and `privateMeta` are encrypted client-side with the
     * thread key and re-signed before upload, exactly as in
     * {@link sendMessage}; the previous content is overwritten on the server.
     *
     * Use it for edit functionality — the message keeps its ID, so existing
     * references from {@link listMessages} or events remain valid.
     *
     * @param {string} messageId ID of the message to update, returned by
     *   {@link sendMessage} or from `Message.info.messageId` in
     *   {@link listMessages}
     * @param {Uint8Array} publicMeta new message metadata stored unencrypted
     *   on the server — never place secrets here
     * @param {Uint8Array} privateMeta new message metadata encrypted
     *   client-side with the thread key
     * @param {Uint8Array} data new message payload, encrypted client-side
     *   with the thread key before upload
     * @throws {NativeError} when the message does not exist or the user lacks
     *   the rights to modify it
     */
    async updateMessage(
        messageId: string,
        publicMeta: Uint8Array,
        privateMeta: Uint8Array,
        data: Uint8Array,
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
    //  * @param {string} threadId ID of the Thread to watch, returned by {@link createThread}
    //  */
    // async subscribeForMessageEvents(threadId: string): Promise<void> {
    //   return this.native.subscribeForMessageEvents(this.servicePtr, [threadId]);
    // }

    // /**
    //  * Unsubscribes from events in given Thread.
    //  * @param {string} threadId ID of the watched Thread, returned by {@link createThread}
    //  */
    // async unsubscribeFromMessageEvents(threadId: string): Promise<void> {
    //   return this.native.unsubscribeFromMessageEvents(this.servicePtr, [
    //     threadId,
    //   ]);
    // }

    /**
     * Subscribes this connection to Thread events matching the given
     * subscription queries.
     *
     * Registers the subscriptions on the Bridge over the connection's event
     * channel; matching events are then pushed by the server and surface
     * through {@link EventQueue.waitEvent}.
     *
     * Required order: {@link buildSubscriptionQuery} (one query per
     * event-type/selector pair) → `subscribeFor(queries)` → consume events
     * from the {@link EventQueue} → {@link unsubscribeFrom} when no longer
     * needed.
     *
     * @param {string[]} subscriptionQueries query strings produced by
     *   {@link buildSubscriptionQuery}; hand-written strings are not supported
     * @return {string[]} subscription IDs, index-aligned with
     *   `subscriptionQueries` — keep them to {@link unsubscribeFrom} later
     */
    async subscribeFor(subscriptionQueries: string[]): Promise<string[]> {
        return this.native.subscribeFor(this.servicePtr, [subscriptionQueries]);
    }

    /**
     * Cancels Thread event subscriptions previously created on this
     * connection, so the server stops pushing the matching events.
     *
     * Subscriptions also end implicitly when the connection is closed; call
     * this only to stop receiving a subset of events while keeping the
     * connection alive.
     *
     * @param {string[]} subscriptionIds IDs returned by {@link subscribeFor};
     *   unknown IDs cause a `NativeError` rejection
     */
    async unsubscribeFrom(subscriptionIds: string[]): Promise<void> {
        return this.native.unsubscribeFrom(this.servicePtr, [subscriptionIds]);
    }

    /**
     * Builds a subscription-query string describing one class of Thread
     * events (e.g. "all message events in Thread X").
     *
     * The query is assembled locally by the WASM core in the server's
     * expected format — nothing is sent yet; pass the result to
     * {@link subscribeFor} to activate it.
     *
     * @param {ThreadEventType} eventType which Thread event class to listen
     *   for (Thread create/update/delete, message events, …)
     * @param {ThreadEventSelectorType} selectorType what `selectorId` refers
     *   to (e.g. a whole Context or a single Thread), narrowing the event
     *   scope
     * @param {string} selectorId ID of the selected scope — a Thread ID
     *   returned by {@link createThread} or a Context ID from
     *   {@link Connection.listContexts}, depending on `selectorType`
     * @returns {string} query string consumed by {@link subscribeFor}
     */
    async buildSubscriptionQuery(
        eventType: ThreadEventType,
        selectorType: ThreadEventSelectorType,
        selectorId: string,
    ): Promise<string> {
        return this.native.buildSubscriptionQuery(this.servicePtr, [
            eventType,
            selectorType,
            selectorId,
        ]);
    }
}
