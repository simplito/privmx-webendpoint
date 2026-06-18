/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { BaseApi } from "./BaseApi.js";
import { StoreApiNative } from "../native/StoreApiNative.js";
import {
    PagingQuery,
    PagingList,
    UserWithPubKey,
    Store,
    File,
    ContainerPolicy,
    StoreEventSelectorType,
    StoreEventType,
} from "../Types.js";

/**
 * Encrypted file-storage API: manages Stores (file containers shared by a
 * fixed set of users within a Context) and the end-to-end encrypted files
 * inside them. File content and private metadata are encrypted in the browser
 * before upload — the Bridge server only ever stores ciphertext (plus the
 * deliberately public `publicMeta`).
 *
 * Obtain an instance via {@link EndpointFactory.createStoreApi}; do not
 * construct it directly.
 *
 * ## Workflows
 * Upload: {@link createFile} → {@link writeToFile} (repeat per chunk) →
 * {@link closeFile} — the file becomes visible to other members only after
 * {@link closeFile} commits it.
 *
 * Download: {@link openFile} → {@link readFromFile} (repeat per chunk) →
 * {@link closeFile}; reposition the cursor with {@link seekInFile}.
 *
 * Replace a file's content with {@link updateFile} (returns a fresh write
 * handle); change only its metadata with {@link updateFileMeta}.
 *
 * Events: {@link buildSubscriptionQuery} → {@link subscribeFor} → consume via
 * {@link EventQueue.waitEvent} → {@link unsubscribeFrom}.
 *
 * All methods reject with `NativeError` on server/crypto errors and throw
 * `Error` when the underlying connection has been closed.
 */
export class StoreApi extends BaseApi {
    /**
     * Created by EndpointFactory — never constructed by SDK users.
     * @internal
     */
    constructor(
        private native: StoreApiNative,
        ptr: number,
    ) {
        super(ptr);
    }

    /**
     * Creates a new Store in the given Context and returns the new Store's ID.
     *
     * A random container key is generated client-side and encrypted separately
     * for each listed user with ECIES using their public key — the server
     * stores only the encrypted per-user key entries and cannot read the key.
     * `privateMeta` is encrypted client-side with the container key;
     * `publicMeta` is stored unencrypted on the server.
     *
     * Entry point of the file workflow: follow with {@link createFile} to
     * upload files and {@link listFiles} to enumerate them. Adjust members or
     * metadata later with {@link updateStore}.
     *
     * @param {string} contextId ID of the Context to create the Store in,
     *   from `Context.contextId` returned by {@link Connection.listContexts}
     * @param {UserWithPubKey[]} users members allowed to access files in the
     *   Store; build the entries from {@link Connection.listContextUsers}
     * @param {UserWithPubKey[]} managers members who can additionally update
     *   or delete the Store; build the entries from
     *   {@link Connection.listContextUsers}
     * @param {Uint8Array} publicMeta metadata stored unencrypted on the
     *   server — readable by the Bridge, so never place secrets here
     * @param {Uint8Array} privateMeta metadata encrypted client-side with the
     *   container key; only Store members can decrypt it
     * @param {ContainerPolicy} [policies] fine-grained access rules (who may
     *   create, update or delete files) overriding the Context defaults
     * @returns {string} ID of the new Store — pass to {@link createFile},
     *   {@link listFiles}, {@link getStore} or {@link updateStore}
     * @throws {NativeError} when the Context does not exist or a listed user
     *   is not registered in it
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
            policies,
        ]);
    }

    /**
     * Replaces the member lists, metadata and (optionally) the encryption key
     * of an existing Store.
     *
     * The container key list is re-encrypted for the new user set (ECIES on
     * each user's public key). With `forceGenerateNewKey` a fresh container
     * key is generated, so removed users cannot decrypt content added after
     * the update.
     *
     * The update is a full replacement, not a diff — fetch the current state
     * with {@link getStore}, modify it, and pass the Store's `version` back so
     * concurrent modifications are detected. Set `forceGenerateNewKey`
     * whenever you remove users.
     *
     * @param {string} storeId ID of the Store to update, returned by
     *   {@link createStore} or from `Store.storeId` in {@link listStores}
     * @param {UserWithPubKey[]} users full replacement list of members allowed
     *   to access files; users missing from this list lose access
     * @param {UserWithPubKey[]} managers full replacement list of members with
     *   management rights (update / delete the Store)
     * @param {Uint8Array} publicMeta new metadata stored unencrypted on the
     *   server — never place secrets here
     * @param {Uint8Array} privateMeta new metadata encrypted client-side with
     *   the container key
     * @param {number} version current Store version, from `Store.version`
     *   returned by {@link getStore} — lets the server reject stale updates
     * @param {boolean} force `true` skips the `version` check and overwrites
     *   any concurrent modification
     * @param {boolean} forceGenerateNewKey when `true`, a fresh container key
     *   is generated by the WASM core and redistributed, so users removed by
     *   this update cannot decrypt content added afterwards — set it whenever
     *   you revoke access
     * @param {ContainerPolicy} [policies] new access policies; omit to keep
     *   the current ones
     * @returns {Promise<void>} resolves when the Store membership and metadata have been replaced
     * @throws {NativeError} when the Store does not exist, the user lacks
     *   management rights, or `version` does not match the server state
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
            policies,
        ]);
    }

    /**
     * Permanently deletes a Store together with all the files it contains.
     *
     * The server removes the Store record, its encrypted per-user key entries
     * and every stored file ciphertext — there is no undo.
     *
     * Requires management rights to the Store (see the `managers` list of
     * {@link createStore} / {@link updateStore}). To merely revoke access,
     * keep the Store and remove users with {@link updateStore} instead.
     *
     * @param {string} storeId ID of the Store to delete, returned by
     *   {@link createStore} or from `Store.storeId` in {@link listStores}
     * @returns {Promise<void>} resolves when the Store and all its files have been deleted
     * @throws {NativeError} when the Store does not exist or the user lacks
     *   management rights
     */
    async deleteStore(storeId: string): Promise<void> {
        return this.native.deleteStore(this.servicePtr, [storeId]);
    }

    /**
     * Fetches a single Store with its metadata, member lists and version.
     *
     * Downloads the Store record from the Bridge and decrypts `privateMeta`
     * client-side with the user's copy of the container key; `publicMeta`
     * arrives as stored, unencrypted.
     *
     * Use it to display Store details or to obtain the current `version`
     * required by {@link updateStore}.
     *
     * @param {string} storeId ID of the Store to fetch, returned by
     *   {@link createStore} or from `Store.storeId` in {@link listStores}
     * @returns {Store} decrypted Store data — `version` feeds
     *   {@link updateStore}; `storeId` feeds {@link createFile} and
     *   {@link listFiles}
     * @throws {NativeError} when the Store does not exist or the user is not
     *   a member of it
     */
    async getStore(storeId: string): Promise<Store> {
        return this.native.getStore(this.servicePtr, [storeId]);
    }

    /**
     * Lists the Stores of a Context that the user is a member of, one page at
     * a time.
     *
     * Downloads the Store records from the Bridge and decrypts each
     * `privateMeta` client-side with the corresponding container key.
     *
     * Typically the first StoreApi call after connecting — pick a Store from
     * the result and enumerate its files with {@link listFiles}.
     *
     * @param {string} contextId ID of the Context to enumerate, from
     *   `Context.contextId` returned by {@link Connection.listContexts}
     * @param {PagingQuery} pagingQuery pagination and sorting; start with
     *   `{ skip: 0, limit: 100, sortOrder: "desc" }` and page using `skip`
     *   or `lastId`
     * @returns {PagingList<Store>} one page of Stores plus `totalAvailable`;
     *   use `Store.storeId` with {@link createFile} or {@link listFiles}
     */
    async listStores(contextId: string, pagingQuery: PagingQuery): Promise<PagingList<Store>> {
        return this.native.listStores(this.servicePtr, [contextId, pagingQuery]);
    }

    /**
     * Starts the upload of a new file into a Store and returns a write handle.
     *
     * A random 256-bit file key is generated client-side; each chunk written
     * through the handle is encrypted with AES-256-CBC (PKCS#7) under a
     * per-chunk key derived as SHA-256(fileKey || chunkIndex), with a random
     * IV and an HMAC-SHA-256 tag per chunk — the server stores only
     * ciphertext.
     *
     * First step of the upload workflow: `createFile` →
     * {@link writeToFile} (repeat per chunk) → {@link closeFile}. The file is
     * not visible to other members until {@link closeFile} commits it.
     *
     * @param {string} storeId ID of the Store to create the file in, returned
     *   by {@link createStore} or from `Store.storeId` in {@link listStores}
     * @param {Uint8Array} publicMeta file metadata stored unencrypted on the
     *   server — readable by the Bridge, so never place secrets here
     * @param {Uint8Array} privateMeta file metadata encrypted client-side;
     *   only Store members can decrypt it
     * @param {number} size declared total file size in bytes — the sum of all
     *   chunks subsequently passed to {@link writeToFile}
     * @param {boolean} [randomWriteSupport] `true` lays the file out so that
     *   later arbitrary-position writes via {@link seekInFile} +
     *   {@link writeToFile} are possible; defaults to sequential-only
     * @returns {number} write handle consumed by {@link writeToFile},
     *   {@link seekInFile} and finally {@link closeFile}
     * @throws {NativeError} when the Store does not exist or the user is not
     *   a member of it
     * @example
     * const handle = await storeApi.createFile(
     *     storeId,
     *     new TextEncoder().encode("{}"),                   // publicMeta (server-readable)
     *     new TextEncoder().encode('{"name":"a.txt"}'),     // privateMeta (encrypted)
     *     data.length);
     * await storeApi.writeToFile(handle, data);             // repeat per chunk
     * const fileId = await storeApi.closeFile(handle);      // commit — file now visible
     */
    async createFile(
        storeId: string,
        publicMeta: Uint8Array,
        privateMeta: Uint8Array,
        size: number,
        randomWriteSupport: boolean = false,
    ): Promise<number> {
        return this.native.createFile(this.servicePtr, [
            storeId,
            publicMeta,
            privateMeta,
            size,
            randomWriteSupport,
        ]);
    }

    /**
     * Starts replacing the content and metadata of an existing file and
     * returns a write handle.
     *
     * Works like {@link createFile} for an existing file: chunks written
     * through the handle are encrypted client-side (AES-256-CBC with
     * per-chunk keys derived from the file key and per-chunk HMAC-SHA-256
     * tags) and the server keeps only ciphertext.
     *
     * Use it to overwrite a file in place while keeping its ID stable for
     * other members; follow with {@link writeToFile} (repeat per chunk) and
     * {@link closeFile} to commit. To change only metadata, use the cheaper
     * {@link updateFileMeta}.
     *
     * @param {string} fileId ID of the file to replace, returned by
     *   {@link closeFile} or from `File.info.fileId` in {@link listFiles}
     * @param {Uint8Array} publicMeta new file metadata stored unencrypted on
     *   the server — never place secrets here
     * @param {Uint8Array} privateMeta new file metadata encrypted client-side
     *   with the Store's container key
     * @param {number} size declared total size in bytes of the replacement
     *   content written via {@link writeToFile}
     * @returns {number} write handle consumed by {@link writeToFile} and
     *   finally {@link closeFile}
     * @throws {NativeError} when the file does not exist or the user is not a
     *   member of its Store
     */
    async updateFile(
        fileId: string,
        publicMeta: Uint8Array,
        privateMeta: Uint8Array,
        size: number,
    ): Promise<number> {
        return this.native.updateFile(this.servicePtr, [fileId, publicMeta, privateMeta, size]);
    }

    /**
     * Replaces only the metadata of an existing file, leaving its content
     * untouched.
     *
     * The metadata is re-encrypted client-side with the Store's current
     * container key and committed in a single call — content chunks are not
     * touched, so this is much cheaper than {@link updateFile}.
     *
     * Use it to rename a file or update application-level attributes without
     * re-uploading content. To replace the content too, use
     * {@link updateFile}.
     *
     * @param {string} fileId ID of the file to update, returned by
     *   {@link closeFile} or from `File.info.fileId` in {@link listFiles}
     * @param {Uint8Array} publicMeta new file metadata stored unencrypted on
     *   the server — never place secrets here
     * @param {Uint8Array} privateMeta new file metadata encrypted client-side
     *   with the Store's container key
     * @returns {Promise<void>} resolves when the file metadata has been updated on the server
     * @throws {NativeError} when the file does not exist or the user is not a
     *   member of its Store
     */
    async updateFileMeta(
        fileId: string,
        publicMeta: Uint8Array,
        privateMeta: Uint8Array,
    ): Promise<void> {
        return this.native.updateFileMeta(this.servicePtr, [fileId, publicMeta, privateMeta]);
    }

    /**
     * Writes the next chunk of data to a file opened for writing.
     *
     * The chunk is encrypted client-side with AES-256-CBC under a per-chunk
     * key derived as SHA-256(fileKey || chunkIndex), with a random IV and an
     * HMAC-SHA-256 tag — only ciphertext leaves the browser.
     *
     * Call repeatedly between {@link createFile} (or {@link updateFile}) and
     * {@link closeFile} until the declared `size` has been written; nothing is
     * visible to other members until {@link closeFile} commits. Writing at an
     * arbitrary position (after {@link seekInFile}) requires the file to have
     * been created with `randomWriteSupport = true`.
     *
     * @param {number} fileHandle write handle returned by {@link createFile}
     *   or {@link updateFile}
     * @param {Uint8Array} dataChunk next slice of the file content, appended
     *   at the handle's current cursor position
     * @param {boolean} [truncate] `true` cuts the file off at current
     *   position + `dataChunk` length, discarding any data beyond it
     * @returns {Promise<void>} resolves when the chunk has been encrypted and sent to the server
     * @throws {NativeError} when the handle is unknown or the write exceeds
     *   what the handle allows
     */
    async writeToFile(
        fileHandle: number,
        dataChunk: Uint8Array,
        truncate: boolean = false,
    ): Promise<void> {
        return this.native.writeToFile(this.servicePtr, [fileHandle, dataChunk, truncate]);
    }

    /**
     * Permanently deletes a file from its Store.
     *
     * The server removes the file record and all its ciphertext chunks —
     * there is no undo.
     *
     * Requires sufficient rights in the Store (see {@link createStore}
     * policies). To replace content instead of deleting, use
     * {@link updateFile}.
     *
     * @param {string} fileId ID of the file to delete, returned by
     *   {@link closeFile} or from `File.info.fileId` in {@link listFiles}
     * @returns {Promise<void>} resolves when the file and all its ciphertext chunks have been deleted
     * @throws {NativeError} when the file does not exist or the user lacks
     *   the required rights
     */
    async deleteFile(fileId: string): Promise<void> {
        return this.native.deleteFile(this.servicePtr, [fileId]);
    }

    /**
     * Fetches a single file's metadata (not its content).
     *
     * Downloads the encrypted file record from the Bridge and decrypts
     * `privateMeta` client-side with the Store's container key; `publicMeta`
     * and size information arrive as stored.
     *
     * Use it to display file details or to resolve a file ID delivered by an
     * event subscription ({@link subscribeFor}); to read the content, follow
     * with {@link openFile} and {@link readFromFile}.
     *
     * @param {string} fileId ID of the file to fetch, returned by
     *   {@link closeFile} or from `File.info.fileId` in {@link listFiles}
     * @returns {File} decrypted file record — `info.fileId` feeds
     *   {@link openFile}, {@link updateFile} and {@link updateFileMeta}
     * @throws {NativeError} when the file does not exist or the user is not a
     *   member of its Store
     */
    async getFile(fileId: string): Promise<File> {
        return this.native.getFile(this.servicePtr, [fileId]);
    }

    /**
     * Lists the files of a Store, one page at a time.
     *
     * Downloads the file records from the Bridge and decrypts each
     * `privateMeta` client-side with the Store's container key — content is
     * not downloaded.
     *
     * Use it to render a file browser; read a chosen file with
     * {@link openFile} + {@link readFromFile}.
     *
     * @param {string} storeId ID of the Store to enumerate, returned by
     *   {@link createStore} or from `Store.storeId` in {@link listStores}
     * @param {PagingQuery} pagingQuery pagination and sorting; start with
     *   `{ skip: 0, limit: 100, sortOrder: "desc" }` and page using `skip`
     *   or `lastId`
     * @returns {PagingList<File>} one page of files plus `totalAvailable`;
     *   use `File.info.fileId` with {@link openFile} or {@link updateFile}
     */
    async listFiles(storeId: string, pagingQuery: PagingQuery): Promise<PagingList<File>> {
        return this.native.listFiles(this.servicePtr, [storeId, pagingQuery]);
    }

    /**
     * Opens a file for reading and returns a read handle.
     *
     * Fetches the encrypted file metadata and decrypts it locally with the
     * Store's container key to recover the file key — content chunks are then
     * fetched and decrypted on demand by {@link readFromFile}.
     *
     * First step of the download workflow: `openFile` →
     * {@link readFromFile} (repeat per chunk) → {@link closeFile}; reposition
     * with {@link seekInFile} if needed.
     *
     * @param {string} fileId ID of the file to read, returned by
     *   {@link closeFile} or from `File.info.fileId` in {@link listFiles}
     * @returns {number} read handle consumed by {@link readFromFile},
     *   {@link seekInFile}, {@link syncFile} and finally {@link closeFile}
     * @throws {NativeError} when the file does not exist or the user is not a
     *   member of its Store
     * @example
     * const handle = await storeApi.openFile(fileId);
     * const chunks: Uint8Array[] = [];
     * let chunk: Uint8Array;
     * do {
     *     chunk = await storeApi.readFromFile(handle, 1024 * 1024);
     *     chunks.push(chunk);
     * } while (chunk.length > 0);
     * await storeApi.closeFile(handle);
     */
    async openFile(fileId: string): Promise<number> {
        return this.native.openFile(this.servicePtr, [fileId]);
    }

    /**
     * Reads and decrypts the next portion of an opened file.
     *
     * Verify-then-decrypt: each chunk's HMAC-SHA-256 tag is checked before
     * AES decryption, so tampered ciphertext is rejected instead of being
     * returned. The handle's cursor advances by the read length, or stops at
     * the end of the file.
     *
     * Call repeatedly after {@link openFile} until fewer bytes than `length`
     * are returned; jump to another offset with {@link seekInFile}.
     *
     * @param {number} fileHandle read handle returned by {@link openFile}
     * @param {number} length number of bytes to read from the current cursor
     *   position; the result may be shorter near the end of the file
     * @returns {Uint8Array} decrypted file content starting at the cursor —
     *   concatenate successive reads to reconstruct the file
     * @throws {NativeError} when the handle is unknown or a chunk fails its
     *   integrity check
     */
    async readFromFile(fileHandle: number, length: number): Promise<Uint8Array> {
        return this.native.readFromFile(this.servicePtr, [fileHandle, length]);
    }

    /**
     * Moves the cursor of an opened file handle to an absolute position.
     *
     * Only the local cursor changes — no data is transferred until the next
     * {@link readFromFile} or {@link writeToFile}.
     *
     * Use it for range reads (e.g. resuming a download). Seeking a write
     * handle to perform arbitrary-position writes requires the file to have
     * been created with `randomWriteSupport = true` in {@link createFile}.
     *
     * @param {number} fileHandle handle returned by {@link openFile},
     *   {@link createFile} or {@link updateFile}
     * @param {number} position absolute offset in bytes from the start of the
     *   file where the next read/write begins
     * @throws {NativeError} when the handle is unknown or the position is
     *   outside the file
     * @returns {Promise<void>} resolves once the handle's position has been updated
     */
    async seekInFile(fileHandle: number, position: number): Promise<void> {
        return this.native.seekInFile(this.servicePtr, [fileHandle, position]);
    }

    /**
     * Closes a file handle and, for write handles, commits the upload.
     *
     * For a write handle this finalizes pending writes, computes the file
     * checksum, encrypts the file metadata (including the file key and chunk
     * layout) with the Store's container key and commits — only then does the
     * file become visible to other Store members. For a read handle it simply
     * releases the native resources.
     *
     * Always the last step of both workflows: {@link createFile} /
     * {@link updateFile} → {@link writeToFile} → `closeFile`, and
     * {@link openFile} → {@link readFromFile} → `closeFile`.
     *
     * @param {number} fileHandle handle returned by {@link createFile},
     *   {@link updateFile} or {@link openFile}
     * @returns {string} ID of the closed file — pass to {@link getFile},
     *   {@link openFile} or {@link updateFileMeta}
     * @throws {NativeError} when the handle is unknown or the commit is
     *   rejected by the server
     */
    async closeFile(fileHandle: number): Promise<string> {
        return this.native.closeFile(this.servicePtr, [fileHandle]);
    }

    /**
     * Refreshes an open file handle with the newest file state from the
     * server.
     *
     * Refetches the server-side file record so the handle sees updates
     * committed concurrently by other members (e.g. a finished
     * {@link updateFile} from another session).
     *
     * Use it on long-lived read handles before continuing to read when the
     * file may have changed; without it the handle keeps the state from
     * {@link openFile} time.
     *
     * @param {number} fileHandle handle returned by {@link openFile},
     *   {@link createFile} or {@link updateFile}
     * @returns {Promise<void>} resolves when the handle has been refreshed with the latest server state
     * @throws {NativeError} when the handle is unknown or the file no longer
     *   exists on the server
     */
    async syncFile(fileHandle: number): Promise<void> {
        return this.native.syncFile(this.servicePtr, [fileHandle]);
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
    //  * @param {string} storeId ID of the Store to watch, returned by {@link createStore}
    //  */
    // async subscribeForFileEvents(storeId: string): Promise<void> {
    //   return this.native.subscribeForFileEvents(this.servicePtr, [storeId]);
    // }

    // /**
    //  * Unsubscribes from events in given Store.
    //  * @param {string} storeId ID of the watched Store, returned by {@link createStore}
    //  */
    // async unsubscribeFromFileEvents(storeId: string): Promise<void> {
    //   return this.native.unsubscribeFromFileEvents(this.servicePtr, [storeId]);
    // }

    /**
     * Subscribes this connection to Store events matching the given
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
     * @returns {string[]} subscription IDs, index-aligned with
     *   `subscriptionQueries` — keep them to {@link unsubscribeFrom} later
     */
    async subscribeFor(subscriptionQueries: string[]): Promise<string[]> {
        return this.native.subscribeFor(this.servicePtr, [subscriptionQueries]);
    }

    /**
     * Cancels Store event subscriptions previously created on this
     * connection, so the server stops pushing the matching events.
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
     * Builds a subscription-query string describing one class of Store events
     * (e.g. "all file events in Store X").
     *
     * The query is assembled locally by the WASM core in the server's
     * expected format — nothing is sent yet; pass the result to
     * {@link subscribeFor} to activate it.
     *
     * @param {StoreEventType} eventType which Store event class to listen for
     *   (Store create/update/delete, file events, …)
     * @param {StoreEventSelectorType} selectorType what `selectorId` refers to
     *   (e.g. a whole Context or a single Store), narrowing the event scope
     * @param {string} selectorId ID of the selected scope — a Store ID
     *   returned by {@link createStore} or a Context ID from
     *   {@link Connection.listContexts}, depending on `selectorType`
     * @returns {string} query string consumed by {@link subscribeFor}
     */
    async buildSubscriptionQuery(
        eventType: StoreEventType,
        selectorType: StoreEventSelectorType,
        selectorId: string,
    ): Promise<string> {
        return this.native.buildSubscriptionQuery(this.servicePtr, [
            eventType,
            selectorType,
            selectorId,
        ]);
    }
}
