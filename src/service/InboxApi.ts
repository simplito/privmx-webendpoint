/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { BaseApi } from "./BaseApi.js";
import { InboxApiNative } from "../native/InboxApiNative.js";
import {
    PagingQuery,
    PagingList,
    UserWithPubKey,
    Inbox,
    InboxPublicView,
    InboxEntry,
    FilesConfig,
    ContainerWithoutItemPolicy,
    InboxEventType,
    InboxEventSelectorType,
} from "../Types.js";

/**
 * Manages Inboxes - one-way encrypted drop boxes. Anyone who knows an Inbox ID
 * (including anonymous guests on an {@link EndpointFactory.connectPublic}
 * connection) can submit entries; only Inbox members holding the container's
 * private key material can read them. Entries are encrypted client-side with
 * the Inbox's public key (ECIES), so the Bridge server only ever stores
 * ciphertext.
 *
 * Obtain via {@link EndpointFactory.createInboxApi}; do not construct directly.
 *
 * ## Workflow
 * Sending an entry (works on a guest {@link EndpointFactory.connectPublic}
 * connection):
 * {@link createFileHandle} (per attachment) → {@link prepareEntry} →
 * {@link writeToFile} (per attachment, repeat per chunk) → {@link sendEntry}.
 *
 * Reading entries (Inbox members, authenticated connection):
 * {@link listEntries} / {@link readEntry} → for attachments {@link openFile} →
 * {@link readFromFile} → {@link closeFile}.
 *
 * All methods reject with `NativeError` on server/crypto errors and throw
 * `Error` when the underlying connection has been closed.
 */
export class InboxApi extends BaseApi {
    /**
     * Resolved from the connection's IoC container by
     * {@link EndpointFactory.createInboxApi} - do not call directly.
     * @internal
     */
    constructor(
        private native: InboxApiNative,
        ptr: number,
    ) {
        super(ptr);
    }

    /**
     * Creates a new Inbox in the given Context and returns its ID.
     *
     * A container key is generated client-side and distributed to each listed
     * user encrypted with ECIES on that user's public key; `privateMeta` is
     * encrypted client-side before upload, while `publicMeta` is stored
     * UNENCRYPTED on the Bridge server - never put secrets in it.
     *
     * Requires an authenticated {@link EndpointFactory.connect} connection
     * whose user has Inbox-creation rights in the Context. Membership can be
     * changed later with {@link updateInbox}.
     *
     * @param {string} contextId Context to create the Inbox in, from
     *   `Context.contextId` returned by `Connection.listContexts`
     * @param {UserWithPubKey[]} users members allowed to read submitted
     *   entries; build the `userId`/`pubKey` pairs from
     *   `Connection.listContextUsers`
     * @param {UserWithPubKey[]} managers members who can additionally update
     *   and delete the Inbox; same `UserWithPubKey` format as `users`
     * @param {Uint8Array} publicMeta metadata stored UNENCRYPTED on the server
     *   and visible to anyone via {@link getInboxPublicView} - no secrets here
     * @param {Uint8Array} privateMeta metadata encrypted client-side; readable
     *   only by Inbox members, the server sees ciphertext
     * @param {FilesConfig} [filesConfig] limits for entry attachments (count
     *   and size); omit to accept the server defaults
     * @param {ContainerWithoutItemPolicy} [policies] access policy overrides
     *   for the new Inbox; omit to inherit the Context defaults
     * @returns {string} ID of the created Inbox - share it with submitters and
     *   pass it to {@link prepareEntry}, {@link getInbox} or {@link listEntries}
     * @throws {NativeError} when the Context does not exist or the user lacks
     *   creation rights
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
     * Replaces an existing Inbox's membership, metadata, files configuration
     * and policies.
     *
     * Re-runs the container-key distribution client-side: the key (a fresh one
     * when `forceGenerateNewKey` is set) is encrypted per-user with ECIES on
     * each member's public key; `privateMeta` is encrypted client-side,
     * `publicMeta` is stored unencrypted on the server.
     *
     * This is a full overwrite, not a patch - fetch the current state with
     * {@link getInbox} first and resend every field. Set `forceGenerateNewKey`
     * when removing users so they cannot decrypt future entries.
     *
     * @param {string} inboxId Inbox to update - value returned by
     *   {@link createInbox} or found in `Inbox.inboxId` from {@link listInboxes}
     * @param {UserWithPubKey[]} users complete new list of members allowed to
     *   read entries; users left out lose access
     * @param {UserWithPubKey[]} managers complete new list of members with
     *   update/delete rights over the Inbox
     * @param {Uint8Array} publicMeta metadata stored UNENCRYPTED on the server
     *   and visible to anyone via {@link getInboxPublicView} - no secrets here
     * @param {Uint8Array} privateMeta metadata encrypted client-side; readable
     *   only by Inbox members, the server sees ciphertext
     * @param {FilesConfig | undefined} filesConfig new attachment limits, or
     *   `undefined` to keep the server defaults
     * @param {number} version current Inbox version, found in `Inbox.version`
     *   from {@link getInbox} - protects against concurrent updates
     * @param {boolean} force `true` skips the `version` check and overwrites
     *   unconditionally (last write wins)
     * @param {boolean} forceGenerateNewKey when `true`, a fresh container key
     *   is generated by the WASM core and redistributed, so members removed by
     *   this update cannot decrypt entries submitted afterwards - set it
     *   whenever you revoke access
     * @param {ContainerWithoutItemPolicy} [policies] new access policy
     *   overrides; omit to keep the current policy
     * @returns {Promise<void>} resolves when the Inbox membership and metadata have been replaced
     * @throws {NativeError} when `version` does not match the server state
     *   (and `force` is `false`) or the user is not a manager
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
     * Fetches a single Inbox with its decrypted metadata and membership.
     *
     * Downloads the Inbox record from the Bridge and decrypts `privateMeta`
     * locally with the member's container key; non-members cannot decrypt it.
     *
     * Use it to read the current `version` before {@link updateInbox}, or to
     * display Inbox details to a member. Guests should use
     * {@link getInboxPublicView} instead.
     *
     * @param {string} inboxId Inbox to fetch - value returned by
     *   {@link createInbox} or found in `Inbox.inboxId` from {@link listInboxes}
     * @returns {Inbox} full Inbox data; pass `Inbox.version` to
     *   {@link updateInbox} and `Inbox.inboxId` to entry methods
     * @throws {NativeError} when the Inbox does not exist or the user has no
     *   access to it
     */
    async getInbox(inboxId: string): Promise<Inbox> {
        return this.native.getInbox(this.servicePtr, [inboxId]);
    }

    /**
     * Lists the Inboxes in a Context that the connected user is a member of.
     *
     * Fetches one page of Inbox records from the Bridge and decrypts each
     * `privateMeta` locally with the member's keys; the server only ever
     * serves ciphertext.
     *
     * Typically the first Inbox call on an authenticated connection - pick an
     * `inboxId` from the result for {@link listEntries} or {@link updateInbox}.
     *
     * @param {string} contextId Context to enumerate, from `Context.contextId`
     *   returned by `Connection.listContexts`
     * @param {PagingQuery} pagingQuery pagination and sorting; start with
     *   `{ skip: 0, limit: 100, sortOrder: "desc" }` and page using `skip`
     * @returns {PagingList<Inbox>} one page of Inboxes plus `totalAvailable`;
     *   use `Inbox.inboxId` in subsequent calls
     */
    async listInboxes(contextId: string, pagingQuery: PagingQuery): Promise<PagingList<Inbox>> {
        return this.native.listInboxes(this.servicePtr, [contextId, pagingQuery]);
    }

    /**
     * Fetches the public, unauthenticated view of an Inbox: its ID, version
     * and `publicMeta`.
     *
     * Returns only data the server stores unencrypted - no container key or
     * decryption is involved, which is why it also works on a guest
     * {@link EndpointFactory.connectPublic} connection.
     *
     * Use it in submission UIs (e.g. a public contact form) to show form
     * configuration stored in `publicMeta` before calling {@link prepareEntry}.
     *
     * @param {string} inboxId Inbox to inspect - value returned by
     *   {@link createInbox}, typically shared with submitters out of band
     * @returns {InboxPublicView} `inboxId`, `version` and the unencrypted
     *   `publicMeta`; the `inboxId` feeds {@link prepareEntry}
     * @throws {NativeError} when no Inbox with the given ID exists
     */
    async getInboxPublicView(inboxId: string): Promise<InboxPublicView> {
        return this.native.getInboxPublicView(this.servicePtr, [inboxId]);
    }

    /**
     * Permanently deletes an Inbox together with all its entries and
     * attachments.
     *
     * Sends a delete request to the Bridge; this is a server-side removal with
     * no client-side crypto involved and it cannot be undone.
     *
     * Restricted to Inbox managers (see the `managers` list of
     * {@link createInbox} / {@link updateInbox}).
     *
     * @param {string} inboxId Inbox to delete - value returned by
     *   {@link createInbox} or found in `Inbox.inboxId` from {@link listInboxes}
     * @returns {Promise<void>} resolves when the Inbox and all its entries have been deleted
     * @throws {NativeError} when the Inbox does not exist or the user lacks
     *   management rights
     */
    async deleteInbox(inboxId: string): Promise<void> {
        return this.native.deleteInbox(this.servicePtr, [inboxId]);
    }

    /**
     * Stages a new Inbox entry locally and returns the entry handle used to
     * upload attachments and finally send it.
     *
     * Binds the previously created file handles ({@link createFileHandle}) to
     * the entry; nothing is committed yet - the payload is encrypted
     * client-side with the Inbox's public key (ECIES) so that only Inbox
     * members can decrypt it, and the server sees only ciphertext once
     * {@link sendEntry} runs.
     *
     * Works on a guest {@link EndpointFactory.connectPublic} connection.
     * Required order: {@link createFileHandle} (per attachment) →
     * `prepareEntry` → {@link writeToFile} (per attachment, repeat per chunk) →
     * {@link sendEntry}.
     *
     * @param {string} inboxId target Inbox - value returned by
     *   {@link createInbox} or obtained from {@link getInboxPublicView}
     * @param {Uint8Array} data entry payload; encrypted client-side so only
     *   Inbox members can read it
     * @param {number[]} inboxFileHandles handles returned by
     *   {@link createFileHandle}, one per attachment; pass `[]` for none
     * @param {string} [userPrivKey] optional sender's secp256k1 private key
     *   (WIF) - generate with `CryptoApi.generatePrivateKey()`; identifies the
     *   sender to readers and lets them encrypt replies for that sender. When
     *   omitted an ephemeral key is used; either way the sender's PUBLIC key is
     *   stored in plaintext with the entry
     * @returns {number} entry handle consumed by {@link writeToFile} and
     *   {@link sendEntry}
     * @throws {NativeError} when the Inbox does not exist or the attachments
     *   violate its `FilesConfig` limits
     * @example
     * // Anonymous guest submission with one attachment:
     * const connection = await EndpointFactory.connectPublic(solutionId, bridgeUrl);
     * const inboxApi = await EndpointFactory.createInboxApi(connection);
     * const fileBytes = new TextEncoder().encode("attachment content");
     * const fileHandle = await inboxApi.createFileHandle(
     *     new Uint8Array(), new Uint8Array(), fileBytes.length);
     * const entryHandle = await inboxApi.prepareEntry(
     *     inboxId, new TextEncoder().encode("hello"), [fileHandle]);
     * await inboxApi.writeToFile(entryHandle, fileHandle, fileBytes);
     * await inboxApi.sendEntry(entryHandle);
     */
    async prepareEntry(
        inboxId: string,
        data: Uint8Array,
        inboxFileHandles: number[],
        userPrivKey?: string,
    ): Promise<number> {
        return this.native.prepareEntry(this.servicePtr, [
            inboxId,
            data,
            inboxFileHandles,
            userPrivKey,
        ]);
    }

    /**
     * Commits a prepared entry - payload plus all uploaded attachments - to
     * the Inbox in one atomic operation.
     *
     * The payload travels ECIES-encrypted with the Inbox's public key and each
     * attachment's metadata is encrypted with a random 256-bit per-entry
     * files-meta key, so the server stores only ciphertext; only Inbox members
     * holding the corresponding private material can decrypt.
     *
     * Works on a guest {@link EndpointFactory.connectPublic} connection. Last
     * step of the submission workflow - call it after every attachment has
     * been fully uploaded with {@link writeToFile}.
     *
     * @param {number} inboxHandle entry handle returned by {@link prepareEntry}
     *   (not an Inbox ID); invalid after this call completes
     * @returns {Promise<void>} resolves when the entry and all its attachments have been committed to the Inbox
     * @throws {NativeError} when attachments declared in {@link prepareEntry}
     *   were not fully written or the handle is unknown
     */
    async sendEntry(inboxHandle: number): Promise<void> {
        return this.native.sendEntry(this.servicePtr, [inboxHandle]);
    }

    /**
     * Fetches a single Inbox entry with its decrypted payload and attachment
     * list.
     *
     * Downloads the ciphertext from the Bridge and decrypts it locally with
     * the member's container keys - requires an authenticated Inbox-member
     * connection; the server never sees the plaintext.
     *
     * Get entry IDs from {@link listEntries} or from `ENTRY_CREATE` events
     * subscribed via {@link subscribeFor}. Download attachments listed in
     * `InboxEntry.files` with {@link openFile} → {@link readFromFile}.
     *
     * @param {string} inboxEntryId entry to read, found in
     *   `InboxEntry.entryId` from {@link listEntries} or in Inbox events
     * @returns {InboxEntry} decrypted `data`, the sender's `authorPubKey` and
     *   the `files` array whose IDs feed {@link openFile}
     * @throws {NativeError} when the entry does not exist or the user is not
     *   an Inbox member
     */
    async readEntry(inboxEntryId: string): Promise<InboxEntry> {
        return this.native.readEntry(this.servicePtr, [inboxEntryId]);
    }

    /**
     * Lists the entries submitted to an Inbox, decrypted for the member.
     *
     * Fetches one page of ciphertext entries from the Bridge and decrypts each
     * locally with the member's keys; per-entry decryption problems are
     * reported in `InboxEntry.statusCode` rather than rejecting the whole page.
     *
     * Requires an authenticated Inbox-member connection - this is the read
     * side of the workflow, paired with {@link readEntry} for single entries
     * and {@link openFile} for attachments.
     *
     * @param {string} inboxId Inbox to read - value returned by
     *   {@link createInbox} or found in `Inbox.inboxId` from {@link listInboxes}
     * @param {PagingQuery} pagingQuery pagination and sorting; start with
     *   `{ skip: 0, limit: 100, sortOrder: "desc" }` and page using `skip`
     * @returns {PagingList<InboxEntry>} one page of decrypted entries plus
     *   `totalAvailable`; use `entryId` with {@link deleteEntry} and the
     *   `files` IDs with {@link openFile}
     * @throws {NativeError} when the Inbox does not exist or the user is not
     *   a member
     */
    async listEntries(inboxId: string, pagingQuery: PagingQuery): Promise<PagingList<InboxEntry>> {
        return this.native.listEntries(this.servicePtr, [inboxId, pagingQuery]);
    }

    /**
     * Permanently deletes a single entry (with its attachments) from an Inbox.
     *
     * Sends a delete request to the Bridge; a server-side removal with no
     * client-side crypto involved, and it cannot be undone.
     *
     * Available to Inbox members on an authenticated connection - typically
     * called after an entry has been processed.
     *
     * @param {string} inboxEntryId entry to delete, found in
     *   `InboxEntry.entryId` from {@link listEntries} or {@link readEntry}
     * @returns {Promise<void>} resolves when the entry and its attachments have been deleted
     * @throws {NativeError} when the entry does not exist or the user lacks
     *   the rights to delete it
     */
    async deleteEntry(inboxEntryId: string): Promise<void> {
        return this.native.deleteEntry(this.servicePtr, [inboxEntryId]);
    }

    /**
     * Declares an attachment for a future entry and returns its file handle.
     *
     * Purely local: registers the file's metadata and declared size in the
     * WASM module - nothing is sent to the server yet. On commit the file's
     * metadata is encrypted with a random 256-bit per-entry files-meta key and
     * its content goes through the encrypted Store chunk pipeline (AES-256-CBC
     * with per-chunk HMAC-SHA-256).
     *
     * Works on a guest {@link EndpointFactory.connectPublic} connection. First
     * step of the submission workflow: `createFileHandle` →
     * {@link prepareEntry} → {@link writeToFile} → {@link sendEntry}.
     *
     * @param {Uint8Array} publicMeta file metadata stored unencrypted on the
     *   server - do not put secrets here
     * @param {Uint8Array} privateMeta file metadata encrypted client-side with
     *   the per-entry files-meta key; readable only by Inbox members
     * @param {number} fileSize exact total size in bytes you will upload via
     *   {@link writeToFile}; the upload must match this declaration
     * @returns {number} file handle to pass in the `inboxFileHandles` array of
     *   {@link prepareEntry} and to each {@link writeToFile} call
     */
    async createFileHandle(
        publicMeta: Uint8Array,
        privateMeta: Uint8Array,
        fileSize: number,
    ): Promise<number> {
        return this.native.createFileHandle(this.servicePtr, [publicMeta, privateMeta, fileSize]);
    }

    /**
     * Uploads one chunk of an attachment belonging to a prepared entry; call
     * repeatedly until the declared file size is written.
     *
     * Each chunk is encrypted client-side and streamed through the Store chunk
     * pipeline (AES-256-CBC with per-chunk HMAC-SHA-256), so the server stores
     * only ciphertext. The data is committed atomically with the entry by
     * {@link sendEntry}.
     *
     * Works on a guest {@link EndpointFactory.connectPublic} connection.
     * Required order: {@link createFileHandle} → {@link prepareEntry} →
     * `writeToFile` (repeat per chunk and per attachment) → {@link sendEntry}.
     *
     * @param {number} inboxHandle entry handle returned by
     *   {@link prepareEntry} - not an Inbox ID and not a file handle
     * @param {number} inboxFileHandle handle returned by
     *   {@link createFileHandle} for the attachment this chunk belongs to; it
     *   must have been listed in {@link prepareEntry}
     * @param {Uint8Array} dataChunk next slice of the file's content; chunks
     *   are appended in call order until `fileSize` bytes are written
     * @returns {Promise<void>} resolves when the chunk has been encrypted and queued for upload
     * @throws {NativeError} when a handle is unknown, the file was not bound
     *   to the entry, or the write exceeds the declared `fileSize`
     */
    async writeToFile(
        inboxHandle: number,
        inboxFileHandle: number,
        dataChunk: Uint8Array,
    ): Promise<void> {
        return this.native.writeToFile(this.servicePtr, [inboxHandle, inboxFileHandle, dataChunk]);
    }

    /**
     * Opens an entry attachment for reading and returns a read handle.
     *
     * Resolves the file's encrypted metadata from the Bridge and prepares
     * local decryption with the member's keys; content chunks are then fetched
     * and decrypted by {@link readFromFile}.
     *
     * Read side of the attachment workflow (Inbox members only): `openFile` →
     * {@link readFromFile} (repeat) → {@link closeFile}, with optional
     * {@link seekInFile} for random access.
     *
     * @param {string} fileId attachment to download, taken from the `files`
     *   array of an entry returned by {@link readEntry} or {@link listEntries}
     * @returns {number} read handle consumed by {@link readFromFile},
     *   {@link seekInFile} and {@link closeFile}
     * @throws {NativeError} when the file does not exist or the user cannot
     *   decrypt it
     */
    async openFile(fileId: string): Promise<number> {
        return this.native.openFile(this.servicePtr, [fileId]);
    }

    /**
     * Reads and decrypts the next portion of an opened attachment.
     *
     * Downloads the ciphertext chunks covering the requested range, verifies
     * the per-chunk HMAC-SHA-256 and decrypts them (AES-256-CBC) locally -
     * plaintext never exists server-side. Each call advances the file cursor
     * by the returned length, or to the end of the file.
     *
     * Loop until the returned buffer is shorter than `length` (end of file),
     * then call {@link closeFile}. Use {@link seekInFile} to reposition first
     * if random access is needed.
     *
     * @param {number} fileHandle read handle returned by {@link openFile}
     * @param {number} length maximum number of plaintext bytes to read in this
     *   call; the last read may return fewer
     * @returns {Uint8Array} decrypted chunk of file content; shorter than
     *   `length` signals the end - finish with {@link closeFile}
     * @throws {NativeError} when the handle is unknown or a chunk fails
     *   integrity verification
     */
    async readFromFile(fileHandle: number, length: number): Promise<Uint8Array> {
        return this.native.readFromFile(this.servicePtr, [fileHandle, length]);
    }

    /**
     * Moves the read cursor of an opened attachment to an absolute position.
     *
     * Only updates the local cursor inside the WASM module - no data is
     * fetched until the next {@link readFromFile} call.
     *
     * Use it for random access, e.g. resuming an interrupted download or
     * reading a footer without downloading the whole file.
     *
     * @param {number} fileHandle read handle returned by {@link openFile}
     * @param {number} position new absolute cursor offset in bytes from the
     *   start of the (plaintext) file
     * @returns {Promise<void>} resolves when the cursor has been moved to the specified position
     * @throws {NativeError} when the handle is unknown or the position is out
     *   of range
     */
    async seekInFile(fileHandle: number, position: number): Promise<void> {
        return this.native.seekInFile(this.servicePtr, [fileHandle, position]);
    }

    /**
     * Closes an attachment read handle and releases its native resources.
     *
     * Purely local: frees the file state held in the WASM module; nothing is
     * sent to the server.
     *
     * Always call it when done reading - handles are a finite native resource.
     * Last step of the attachment read workflow after {@link readFromFile}.
     *
     * @param {number} fileHandle read handle returned by {@link openFile};
     *   invalid after this call
     * @returns {string} ID of the closed file - the same value that was passed
     *   to {@link openFile}, reusable there to reopen the file
     * @throws {NativeError} when the handle is unknown or already closed
     */
    async closeFile(fileHandle: number): Promise<string> {
        return this.native.closeFile(this.servicePtr, [fileHandle]);
    }

    /**
     * Subscribes this connection to Inbox events matching the given
     * subscription queries.
     *
     * Registers the subscriptions on the Bridge over the connection's event
     * channel; matching events (entry created/deleted, Inbox updated, …) are
     * then pushed by the server and surface through `EventQueue.waitEvent`.
     *
     * Required order: {@link buildSubscriptionQuery} (one query per
     * event-type/selector pair) → `subscribeFor(queries)` → consume events from
     * the `EventQueue` → {@link unsubscribeFrom} when no longer needed.
     *
     * @param {string[]} subscriptionQueries query strings produced by
     *   {@link buildSubscriptionQuery}; hand-written strings are not supported
     * @returns {string[]} subscription IDs, index-aligned with
     *   `subscriptionQueries` - keep them to {@link unsubscribeFrom} later
     */
    async subscribeFor(subscriptionQueries: string[]): Promise<string[]> {
        return this.native.subscribeFor(this.servicePtr, [subscriptionQueries]);
    }

    /**
     * Cancels Inbox event subscriptions previously created on this connection,
     * so the server stops pushing the matching events.
     *
     * Subscriptions also end implicitly when the connection is closed; call
     * this only to stop receiving a subset of events while keeping the
     * connection alive.
     *
     * @param {string[]} subscriptionIds IDs returned by {@link subscribeFor};
     *   unknown IDs cause a `NativeError` rejection
     * @returns {Promise<void>} resolves when all listed subscriptions have been cancelled
     */
    async unsubscribeFrom(subscriptionIds: string[]): Promise<void> {
        return this.native.unsubscribeFrom(this.servicePtr, [subscriptionIds]);
    }

    /**
     * Builds a subscription-query string describing one class of Inbox events
     * (e.g. "entry created in Inbox X").
     *
     * The query is assembled locally by the WASM core in the server's expected
     * format - nothing is sent yet; pass the result to {@link subscribeFor} to
     * activate it.
     *
     * @param {InboxEventType} eventType which Inbox event class to listen for
     *   (Inbox create/update/delete, entry create/delete, …)
     * @param {InboxEventSelectorType} selectorType what `selectorId` refers to
     *   (a Context, an Inbox or a single entry), narrowing the event scope
     * @param {string} selectorId ID of the selected scope - e.g. an Inbox ID
     *   returned by {@link createInbox} or a Context ID from
     *   `Connection.listContexts`
     * @returns {string} query string consumed by {@link subscribeFor}
     */
    async buildSubscriptionQuery(
        eventType: InboxEventType,
        selectorType: InboxEventSelectorType,
        selectorId: string,
    ): Promise<string> {
        return this.native.buildSubscriptionQuery(this.servicePtr, [
            eventType,
            selectorType,
            selectorId,
        ]);
    }
}
