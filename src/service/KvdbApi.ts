/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { BaseApi } from "./BaseApi.js";
import { KvdbApiNative } from "../native/KvdbApiNative.js";
import {
    PagingQuery,
    PagingList,
    UserWithPubKey,
    Kvdb,
    ContainerPolicy,
    KvdbEntry,
    DeleteEntriesResult,
    KvdbEventSelectorType,
    KvdbEventType,
} from "../Types.js";

/**
 * Manages KVDBs — end-to-end encrypted key-value databases shared between
 * Context members. Entry values and private metadata are encrypted client-side
 * with the KVDB's container key (distributed per-user with ECIES) and signed
 * with the author's secp256k1 key. IMPORTANT: entry KEY NAMES are stored in
 * PLAINTEXT on the server (they index and list entries), and entry
 * `publicMeta` is signed but NOT encrypted — never put secrets in either.
 *
 * Obtain via {@link EndpointFactory.createKvdbApi}; do not construct directly.
 *
 * ## Workflow
 * {@link createKvdb} (or pick one from {@link listKvdbs}) → {@link setEntry} /
 * {@link getEntry} / {@link listEntriesKeys} / {@link listEntries} →
 * {@link deleteEntry} / {@link deleteEntries}.
 *
 * Events: {@link buildSubscriptionQuery} (or
 * {@link buildSubscriptionQueryForSelectedEntry}) → {@link subscribeFor} →
 * consume via `EventQueue.waitEvent` → {@link unsubscribeFrom}.
 *
 * All methods reject with `NativeError` on server/crypto errors and throw
 * `Error` when the underlying connection has been closed.
 */
export class KvdbApi extends BaseApi {
    /**
     * Resolved from the connection's IoC container by
     * {@link EndpointFactory.createKvdbApi} — do not call directly.
     * @internal
     */
    constructor(
        private native: KvdbApiNative,
        ptr: number,
    ) {
        super(ptr);
    }

    /**
     * Creates a new KVDB in the given Context and returns its ID.
     *
     * A container key is generated client-side and distributed to each listed
     * user encrypted with ECIES on that user's public key; `privateMeta` is
     * encrypted client-side before upload, while `publicMeta` is stored
     * UNENCRYPTED on the Bridge server — never put secrets in it.
     *
     * First step of the KVDB workflow — write entries to the returned database
     * with {@link setEntry} and adjust membership later with {@link updateKvdb}.
     *
     * @param {string} contextId Context to create the KVDB in, from
     *   `Context.contextId` returned by `Connection.listContexts`
     * @param {UserWithPubKey[]} users members allowed to read and write
     *   entries; build the `userId`/`pubKey` pairs from
     *   `Connection.listContextUsers`
     * @param {UserWithPubKey[]} managers members who can additionally update
     *   and delete the KVDB; same `UserWithPubKey` format as `users`
     * @param {Uint8Array} publicMeta metadata stored UNENCRYPTED on the
     *   server — no secrets here
     * @param {Uint8Array} privateMeta metadata encrypted client-side; readable
     *   only by KVDB members, the server sees ciphertext
     * @param {ContainerPolicy} [policies] access policy overrides for the new
     *   KVDB; omit to inherit the Context defaults
     * @returns {string} ID of the created KVDB — pass it to {@link setEntry},
     *   {@link getEntry}, {@link listEntries} and {@link updateKvdb}
     * @throws {NativeError} when the Context does not exist or the user lacks
     *   creation rights
     * @example
     * const users = [{ userId: "alice", pubKey: alicePubKey }];
     * const kvdbId = await kvdbApi.createKvdb(
     *     contextId, users, users,
     *     new TextEncoder().encode(JSON.stringify({ name: "settings" })),
     *     new Uint8Array());
     * // Key name "theme" is plaintext on the server; the value is encrypted:
     * await kvdbApi.setEntry(kvdbId, "theme", new Uint8Array(),
     *     new Uint8Array(), new TextEncoder().encode("dark"));
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
     * Replaces an existing KVDB's membership, metadata and policies.
     *
     * Re-runs the container-key distribution client-side: the key (a fresh one
     * when `forceGenerateNewKey` is set) is encrypted per-user with ECIES on
     * each member's public key; `privateMeta` is encrypted client-side,
     * `publicMeta` is stored unencrypted on the server.
     *
     * This is a full overwrite, not a patch — fetch the current state with
     * {@link getKvdb} first and resend every field. Set `forceGenerateNewKey`
     * when removing users so they cannot decrypt future entries.
     *
     * @param {string} kvdbId KVDB to update — value returned by
     *   {@link createKvdb} or found in `Kvdb.kvdbId` from {@link listKvdbs}
     * @param {UserWithPubKey[]} users complete new list of members with access
     *   to the KVDB; users left out lose access
     * @param {UserWithPubKey[]} managers complete new list of members with
     *   update/delete rights over the KVDB
     * @param {Uint8Array} publicMeta metadata stored UNENCRYPTED on the
     *   server — no secrets here
     * @param {Uint8Array} privateMeta metadata encrypted client-side; readable
     *   only by KVDB members, the server sees ciphertext
     * @param {number} version current KVDB version, found in `Kvdb.version`
     *   from {@link getKvdb} — protects against concurrent updates
     * @param {boolean} force `true` skips the `version` check and overwrites
     *   unconditionally (last write wins)
     * @param {boolean} forceGenerateNewKey when `true`, a fresh container key
     *   is generated by the WASM core and redistributed, so members removed by
     *   this update cannot decrypt entries written afterwards — set it
     *   whenever you revoke access
     * @param {ContainerPolicy} [policies] new access policy overrides; omit to
     *   keep the current policy
     * @returns {Promise<void>} resolves when the KVDB membership and metadata have been replaced
     * @throws {NativeError} when `version` does not match the server state
     *   (and `force` is `false`) or the user is not a manager
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
     * Permanently deletes a KVDB together with all its entries.
     *
     * Sends a delete request to the Bridge; this is a server-side removal with
     * no client-side crypto involved and it cannot be undone.
     *
     * Restricted to KVDB managers (see the `managers` list of
     * {@link createKvdb} / {@link updateKvdb}). To remove individual entries
     * instead, use {@link deleteEntry} or {@link deleteEntries}.
     *
     * @param {string} kvdbId KVDB to delete — value returned by
     *   {@link createKvdb} or found in `Kvdb.kvdbId` from {@link listKvdbs}
     * @returns {Promise<void>} resolves when the KVDB and all its entries have been deleted
     * @throws {NativeError} when the KVDB does not exist or the user lacks
     *   management rights
     */
    async deleteKvdb(kvdbId: string): Promise<void> {
        return this.native.deleteKvdb(this.servicePtr, [kvdbId]);
    }

    /**
     * Fetches a single KVDB with its decrypted metadata, membership and entry
     * count.
     *
     * Downloads the KVDB record from the Bridge and decrypts `privateMeta`
     * locally with the member's container key; non-members cannot decrypt it.
     *
     * Use it to read the current `version` before {@link updateKvdb}, or to
     * display database details to a member.
     *
     * @param {string} kvdbId KVDB to fetch — value returned by
     *   {@link createKvdb} or found in `Kvdb.kvdbId` from {@link listKvdbs}
     * @returns {Kvdb} full KVDB data; pass `Kvdb.version` to {@link updateKvdb}
     *   and `Kvdb.kvdbId` to the entry methods
     * @throws {NativeError} when the KVDB does not exist or the user has no
     *   access to it
     */
    async getKvdb(kvdbId: string): Promise<Kvdb> {
        return this.native.getKvdb(this.servicePtr, [kvdbId]);
    }

    /**
     * Lists the KVDBs in a Context that the connected user is a member of.
     *
     * Fetches one page of KVDB records from the Bridge and decrypts each
     * `privateMeta` locally with the member's keys; the server only ever
     * serves ciphertext.
     *
     * Typically the first KVDB call on a connection — pick a `kvdbId` from the
     * result for {@link getEntry}, {@link setEntry} or {@link listEntries}.
     *
     * @param {string} contextId Context to enumerate, from `Context.contextId`
     *   returned by `Connection.listContexts`
     * @param {PagingQuery} pagingQuery pagination and sorting; start with
     *   `{ skip: 0, limit: 100, sortOrder: "desc" }` and page using `skip`
     * @returns {PagingList<Kvdb>} one page of KVDBs plus `totalAvailable`; use
     *   `Kvdb.kvdbId` in subsequent calls
     */
    async listKvdbs(contextId: string, pagingQuery: PagingQuery): Promise<PagingList<Kvdb>> {
        return this.native.listKvdbs(this.servicePtr, [contextId, pagingQuery]);
    }

    /**
     * Fetches one entry by its key and returns it decrypted.
     *
     * The server looks the entry up by its plaintext key name; the value and
     * `privateMeta` arrive as ciphertext and are decrypted locally with the
     * KVDB's container key, and the author's secp256k1 ECDSA signature is
     * verified.
     *
     * Use {@link hasEntry} to probe for existence without fetching, or
     * {@link listEntries} to read many entries at once.
     *
     * @param {string} kvdbId KVDB holding the entry — value returned by
     *   {@link createKvdb} or found in `Kvdb.kvdbId` from {@link listKvdbs}
     * @param {string} key plaintext key name the entry was written under by
     *   {@link setEntry}; also discoverable via {@link listEntriesKeys}
     * @returns {KvdbEntry} decrypted `data`, metadata, `authorPubKey` and the
     *   `version` to pass back to {@link setEntry} when updating
     * @throws {NativeError} when no entry with the given key exists or the
     *   user is not a KVDB member
     */
    async getEntry(kvdbId: string, key: string): Promise<KvdbEntry> {
        return this.native.getEntry(this.servicePtr, [kvdbId, key]);
    }

    /**
     * Checks whether an entry with the given key exists in a KVDB.
     *
     * A pure server-side lookup on the plaintext key name — no entry data is
     * downloaded and no decryption happens.
     *
     * Cheaper than {@link getEntry} when only existence matters, e.g. before
     * deciding between inserting and updating with {@link setEntry}.
     *
     * @param {string} kvdbId KVDB to probe — value returned by
     *   {@link createKvdb} or found in `Kvdb.kvdbId` from {@link listKvdbs}
     * @param {string} key plaintext key name to test, as written by
     *   {@link setEntry}
     * @returns {boolean} `true` if an entry with that key exists — follow up
     *   with {@link getEntry} to read it
     */
    async hasEntry(kvdbId: string, key: string): Promise<boolean> {
        return this.native.hasEntry(this.servicePtr, [kvdbId, key]);
    }
    /**
     * Lists the key names of the entries stored in a KVDB.
     *
     * Key names live in plaintext on the server (that is what makes this
     * listing possible without decryption) — only the keys travel back, no
     * entry values are downloaded.
     *
     * Use it to enumerate a large database cheaply and fetch selected values
     * with {@link getEntry}; use {@link listEntries} to get full entries
     * directly.
     *
     * @param {string} kvdbId KVDB to enumerate — value returned by
     *   {@link createKvdb} or found in `Kvdb.kvdbId` from {@link listKvdbs}
     * @param {PagingQuery} pagingQuery pagination and sorting; start with
     *   `{ skip: 0, limit: 100, sortOrder: "desc" }` and page using `skip`
     * @returns {PagingList<string>} one page of plaintext key names plus
     *   `totalAvailable`; feed each key to {@link getEntry} or
     *   {@link deleteEntry}
     */
    async listEntriesKeys(kvdbId: string, pagingQuery: PagingQuery): Promise<PagingList<string>> {
        return this.native.listEntriesKeys(this.servicePtr, [kvdbId, pagingQuery]);
    }

    /**
     * Lists full entries of a KVDB, decrypted for the member.
     *
     * Fetches one page of ciphertext entries from the Bridge and decrypts each
     * value and `privateMeta` locally with the KVDB's container key, verifying
     * the authors' signatures; per-entry problems are reported in
     * `KvdbEntry.statusCode` rather than rejecting the whole page.
     *
     * Use it to read many values at once; for key names only, the lighter
     * {@link listEntriesKeys} avoids downloading the values.
     *
     * @param {string} kvdbId KVDB to read — value returned by
     *   {@link createKvdb} or found in `Kvdb.kvdbId` from {@link listKvdbs}
     * @param {PagingQuery} pagingQuery pagination and sorting; start with
     *   `{ skip: 0, limit: 100, sortOrder: "desc" }` and page using `skip`
     * @returns {PagingList<KvdbEntry>} one page of decrypted entries plus
     *   `totalAvailable`; each entry's `info.key` and `version` feed
     *   {@link setEntry} updates
     * @throws {NativeError} when the KVDB does not exist or the user is not a
     *   member
     */
    async listEntries(kvdbId: string, pagingQuery: PagingQuery): Promise<PagingList<KvdbEntry>> {
        return this.native.listEntries(this.servicePtr, [kvdbId, pagingQuery]);
    }

    /**
     * Writes an entry under the given key — inserting it, or updating it when
     * a `version` is supplied.
     *
     * The value (`data`) and `privateMeta` are encrypted client-side with the
     * KVDB's container key and signed with the author's secp256k1 ECDSA key;
     * `publicMeta` is signed but NOT encrypted, and the KEY NAME itself is
     * stored in PLAINTEXT on the server for indexing — never put secrets in
     * the key name or `publicMeta`.
     *
     * To update an existing entry, pass the current `KvdbEntry.version` from
     * {@link getEntry} as `version`; readers retrieve the value with
     * {@link getEntry} or {@link listEntries}.
     *
     * @param {string} kvdbId target KVDB — value returned by
     *   {@link createKvdb} or found in `Kvdb.kvdbId` from {@link listKvdbs}
     * @param {string} key name to store the entry under; PLAINTEXT on the
     *   server and visible in {@link listEntriesKeys} — no secrets here
     * @param {Uint8Array} publicMeta entry metadata signed but stored
     *   UNENCRYPTED on the server — no secrets here
     * @param {Uint8Array} privateMeta entry metadata encrypted client-side;
     *   readable only by KVDB members, the server sees ciphertext
     * @param {Uint8Array} data entry value, encrypted client-side with the
     *   KVDB's container key before upload
     * @param {number} [version] current entry version from
     *   `KvdbEntry.version` returned by {@link getEntry} — required when
     *   overwriting an existing entry; omit when inserting a new one
     * @returns {Promise<void>} resolves when the entry has been written to the server
     * @throws {NativeError} when the version does not match the server state
     *   or the user has no write access
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
            version || 0,
        ]);
    }

    /**
     * Permanently deletes a single entry from a KVDB.
     *
     * A server-side removal addressed by the plaintext key name — no
     * decryption is involved and the operation cannot be undone.
     *
     * For removing several entries in one round-trip use
     * {@link deleteEntries}.
     *
     * @param {string} kvdbId KVDB holding the entry — value returned by
     *   {@link createKvdb} or found in `Kvdb.kvdbId` from {@link listKvdbs}
     * @param {string} key plaintext key name of the entry, as written by
     *   {@link setEntry} or listed by {@link listEntriesKeys}
     * @returns {Promise<void>} resolves when the entry has been removed from the server
     * @throws {NativeError} when no entry with the given key exists or the
     *   user lacks delete rights
     */
    async deleteEntry(kvdbId: string, key: string): Promise<void> {
        return this.native.deleteEntry(this.servicePtr, [kvdbId, key]);
    }

    /**
     * Deletes several entries of one KVDB in a single request and reports the
     * outcome per key.
     *
     * A server-side batch removal addressed by plaintext key names — no
     * decryption is involved; keys that fail (e.g. nonexistent) do not abort
     * the rest of the batch.
     *
     * Prefer it over looping {@link deleteEntry} when clearing many keys, e.g.
     * after {@link listEntriesKeys}.
     *
     * @param {string} kvdbId KVDB to delete from — value returned by
     *   {@link createKvdb} or found in `Kvdb.kvdbId` from {@link listKvdbs}
     * @param {string[]} keys plaintext key names to remove, as written by
     *   {@link setEntry} or listed by {@link listEntriesKeys}
     * @returns {DeleteEntriesResult} map from each key to `true`/`false`
     *   deletion success — inspect it to retry or report failed keys
     */
    async deleteEntries(kvdbId: string, keys: string[]): Promise<DeleteEntriesResult> {
        return this.native.deleteEntries(this.servicePtr, [kvdbId, keys]);
    }

    /**
     * Subscribes this connection to KVDB events matching the given
     * subscription queries.
     *
     * Registers the subscriptions on the Bridge over the connection's event
     * channel; matching events (entry created/updated/deleted, KVDB updated, …)
     * are then pushed by the server and surface through `EventQueue.waitEvent`.
     *
     * Required order: {@link buildSubscriptionQuery} or
     * {@link buildSubscriptionQueryForSelectedEntry} (one query per scope) →
     * `subscribeFor(queries)` → consume events from the `EventQueue` →
     * {@link unsubscribeFrom} when no longer needed.
     *
     * @param {string[]} subscriptionQueries query strings produced by
     *   {@link buildSubscriptionQuery} or
     *   {@link buildSubscriptionQueryForSelectedEntry}; hand-written strings
     *   are not supported
     * @returns {string[]} subscription IDs, index-aligned with
     *   `subscriptionQueries` — keep them to {@link unsubscribeFrom} later
     */
    async subscribeFor(subscriptionQueries: string[]): Promise<string[]> {
        return this.native.subscribeFor(this.servicePtr, [subscriptionQueries]);
    }

    /**
     * Cancels KVDB event subscriptions previously created on this connection,
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
     * Builds a subscription-query string describing one class of KVDB events
     * (e.g. "entry created in KVDB X").
     *
     * The query is assembled locally by the WASM core in the server's expected
     * format — nothing is sent yet; pass the result to {@link subscribeFor} to
     * activate it.
     *
     * @param {KvdbEventType} eventType which KVDB event class to listen for
     *   (KVDB create/update/delete, entry create/update/delete, …)
     * @param {KvdbEventSelectorType} selectorType what `selectorId` refers to
     *   (a Context, a KVDB or a single entry), narrowing the event scope
     * @param {string} selectorId ID of the selected scope — e.g. a KVDB ID
     *   returned by {@link createKvdb} or a Context ID from
     *   `Connection.listContexts`
     * @returns {string} query string consumed by {@link subscribeFor}
     */
    async buildSubscriptionQuery(
        eventType: KvdbEventType,
        selectorType: KvdbEventSelectorType,
        selectorId: string,
    ): Promise<string> {
        return this.native.buildSubscriptionQuery(this.servicePtr, [
            eventType,
            selectorType,
            selectorId,
        ]);
    }

    /**
     * Builds a subscription-query string scoped to a single KVDB entry,
     * identified by its key.
     *
     * The query is assembled locally by the WASM core — the entry key is
     * usable as a selector because key names are stored in plaintext on the
     * server; nothing is sent until {@link subscribeFor} activates the query.
     *
     * Use it to watch one specific entry (e.g. a shared settings record)
     * instead of every entry of the database via {@link buildSubscriptionQuery}.
     *
     * @param {KvdbEventType} eventType which KVDB event class to listen for —
     *   entry-level types such as entry update/delete are the useful ones here
     * @param {string} kvdbId KVDB holding the entry — value returned by
     *   {@link createKvdb} or found in `Kvdb.kvdbId` from {@link listKvdbs}
     * @param {string} kvdbEntryKey plaintext entry key name chosen by the
     *   application when calling {@link setEntry} (stored unencrypted
     *   server-side) — also found in {@link listEntriesKeys} results
     * @returns {string} query string consumed by {@link subscribeFor}
     */
    async buildSubscriptionQueryForSelectedEntry(
        eventType: KvdbEventType,
        kvdbId: string,
        kvdbEntryKey: string,
    ): Promise<string> {
        return this.native.buildSubscriptionQueryForSelectedEntry(this.servicePtr, [
            eventType,
            kvdbId,
            kvdbEntryKey,
        ]);
    }
}
