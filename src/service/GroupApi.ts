/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { BaseApi } from "./BaseApi.js";
import { GroupApiNative } from "../native/GroupApiNative.js";
import {
    PagingQuery,
    PagingList,
    UserWithPubKey,
    Group,
    GroupSummary,
    GroupMemberToAdd,
    ContainerPolicy,
    DecryptedEnvelope,
    DecryptedFileInfo,
    GroupEventType,
    GroupEventSelectorType,
} from "../Types.js";

/**
 * Group API: manages Groups - named sets of Context users that can be granted
 * access to containers (Threads, Stores, KVDBs, Inboxes, Stream Rooms) as a
 * unit, instead of listing every member on every container.
 *
 * Key distribution is backed by a hidden key tree, so removing a member costs
 * work proportional to the logarithm of the group size, and adding one does not
 * advance the Group's key epoch (no container the Group can read has to be
 * re-keyed).
 *
 * Obtain an instance via {@link EndpointFactory.createGroupApi}; do not
 * construct it directly.
 *
 * ## Workflow
 * {@link createGroup} → {@link getGroup} (for `groupPubKey` and
 * `keyVersion`) → grant it to a container by passing a `GroupGrantWithKey` to
 * e.g. `ThreadApi.createThread`. Change membership with
 * {@link addGroupMembers} / {@link removeGroupMembers}; after a removal the
 * Group's epoch advances and every granted container must be re-keyed with its
 * `rotate*Keys` method.
 *
 * ## Sealing content for a Group
 * A Group is also a standalone encryption target: {@link encrypt} /
 * {@link decrypt} for a value, {@link beginFileEncryption} and friends for a
 * file of any size, {@link encryptAnonymously} to seal for a Group you are not
 * a member of. None of it touches your storage - the envelope and the
 * ciphertext are handed back for you to keep wherever you like.
 *
 * Events: {@link buildSubscriptionQuery} (or
 * {@link buildCustomEventSubscriptionQuery} for notifications sent with
 * {@link sendCustomEvent}) → {@link subscribeFor} → consume via
 * {@link EventQueue.waitEvent} → {@link unsubscribeFrom}.
 *
 * All methods reject with `NativeError` on server/crypto errors and throw
 * `Error` when the underlying connection has been closed.
 */
export class GroupApi extends BaseApi {
    /**
     * Created by EndpointFactory - never constructed by SDK users.
     * @internal
     */
    constructor(
        private native: GroupApiNative,
        ptr: number,
    ) {
        super(ptr);
    }

    /**
     * Creates a new Group whose key distribution is backed by a hidden key tree
     * and returns the new Group's ID.
     *
     * The Group's own metadata key is wrapped once to the Group itself rather
     * than once per member, which is what keeps a removal off the linear path.
     *
     * @param {string} contextId ID of the Context to create the Group in, from
     *   `Context.contextId` returned by {@link Connection.listContexts}
     * @param {UserWithPubKey[]} users members of the Group; build the entries
     *   from {@link Connection.listContextUsers}
     * @param {UserWithPubKey[]} managers members who can additionally update the
     *   Group or change its membership
     * @param {Uint8Array} publicMeta metadata stored unencrypted on the server -
     *   never place secrets here
     * @param {Uint8Array} privateMeta metadata encrypted client-side; only Group
     *   members can decrypt it
     * @param {ContainerPolicy} [policies] fine-grained access rules overriding
     *   the Context defaults
     * @returns {string} ID of the new Group
     * @throws {NativeError} when the Context does not exist or a listed user is
     *   not registered in it
     */
    async createGroup(
        contextId: string,
        users: UserWithPubKey[],
        managers: UserWithPubKey[],
        publicMeta: Uint8Array,
        privateMeta: Uint8Array,
        policies?: ContainerPolicy,
    ): Promise<string> {
        return this.native.createGroup(this.servicePtr, [
            contextId,
            users,
            managers,
            publicMeta,
            privateMeta,
            policies,
        ]);
    }

    /**
     * Adds members to a Group without advancing its key epoch.
     *
     * Not `k` separate additions bundled: the newcomers' key-tree paths overlap,
     * so this re-keys their union once and lands under a single
     * compare-and-swap. Because the epoch does not move, every container the
     * Group can read stays valid and nobody else re-keys anything.
     *
     * Incremental - only the newcomers are named. The resulting roster is
     * derived from the Group's own verified history, and its metadata carries
     * through untouched: seating a member is not a metadata edit, which is what
     * {@link updateGroupPublicMeta} / {@link updateGroupPrivateMeta} are for.
     *
     * @param {string} groupId ID of the Group, returned by {@link createGroup}
     * @param {GroupMemberToAdd[]} newMembers members to add, each with their
     *   public key and the role they take ("user" or "manager")
     * @returns {Promise<void>} resolves when the members have been added
     * @throws {NativeError} when the Group does not exist or the user lacks
     *   management rights
     */
    async addGroupMembers(groupId: string, newMembers: GroupMemberToAdd[]): Promise<void> {
        return this.native.addGroupMembers(this.servicePtr, [groupId, newMembers]);
    }

    /**
     * Removes members from a Group, advancing its key epoch **once**.
     *
     * This is why the batch exists: removing members one at a time advances the
     * epoch per member, so every container the Group can read goes stale once
     * per removal. A batch costs one epoch and one metadata re-wrap however many
     * members leave. Containers the Group can read must be re-keyed afterwards
     * with their `rotate*Keys` method; the Bridge refuses new content written
     * under the superseded epoch until they are (see `Thread.staleGroups` and
     * friends).
     *
     * Incremental - only the leavers are named; the roster that remains is
     * derived from the Group's own verified history, and metadata carries
     * through untouched.
     *
     * @param {string} groupId ID of the Group, returned by {@link createGroup}
     * @param {string[]} userIds IDs of the members to remove
     * @returns {Promise<void>} resolves when the members have been removed and
     *   the Group's key epoch advanced
     * @throws {NativeError} when the Group does not exist or the user lacks
     *   management rights
     */
    async removeGroupMembers(groupId: string, userIds: string[]): Promise<void> {
        return this.native.removeGroupMembers(this.servicePtr, [groupId, userIds]);
    }

    /**
     * Updates a Group's public (unencrypted) metadata, and nothing else.
     *
     * Public metadata, private metadata and policies are three separate calls,
     * each with its own permission on the Bridge. This one cannot touch the
     * other two - the request it sends has no field to carry them in.
     *
     * There is no way to skip the version check: an update computed against a
     * head that has since moved cannot produce a tag any reader will accept, so
     * a caller who loses the check has to re-read the Group and build the update
     * again. The version checked is `Group.publicMetaVersion` alone, so a
     * concurrent private-metadata write cannot make this one lose.
     *
     * @param {string} groupId ID of the Group to update
     * @param {Uint8Array} publicMeta new metadata stored unencrypted
     * @param {number} version current `Group.publicMetaVersion`, from
     *   {@link getGroup}
     * @returns {Promise<void>} resolves when the metadata has been updated
     * @throws {NativeError} when the Group does not exist, the user lacks
     *   management rights, or `version` does not match the server state
     */
    async updateGroupPublicMeta(
        groupId: string,
        publicMeta: Uint8Array,
        version: number,
    ): Promise<void> {
        return this.native.updateGroupPublicMeta(this.servicePtr, [groupId, publicMeta, version]);
    }

    /**
     * Updates a Group's private (encrypted) metadata, and nothing else.
     *
     * The counterpart of {@link updateGroupPublicMeta}, with its own permission
     * on the Bridge and its own version counter: the version checked is
     * `Group.privateMetaVersion` alone.
     *
     * @param {string} groupId ID of the Group to update
     * @param {Uint8Array} privateMeta new metadata encrypted client-side
     * @param {number} version current `Group.privateMetaVersion`, from
     *   {@link getGroup}
     * @returns {Promise<void>} resolves when the metadata has been updated
     * @throws {NativeError} when the Group does not exist, the user lacks
     *   management rights, or `version` does not match the server state
     */
    async updateGroupPrivateMeta(
        groupId: string,
        privateMeta: Uint8Array,
        version: number,
    ): Promise<void> {
        return this.native.updateGroupPrivateMeta(this.servicePtr, [groupId, privateMeta, version]);
    }

    /**
     * Sets a Group's policies, and nothing else.
     *
     * Takes no version and performs no version check, unlike the two metadata
     * calls: the policies live outside the Group's encrypted, signed metadata,
     * so there is no counter for a caller to know and nothing for a reader to
     * re-verify. Neither metadata version moves, and two callers racing here
     * means the later write wins.
     *
     * Having a call of its own does **not** make the policy authenticated - it
     * is held and enforced by the Bridge, covered by no signature.
     *
     * @param {string} groupId ID of the Group to update
     * @param {ContainerPolicy} policies the Group's new policies; required, an
     *   omitted policy would ask for nothing rather than leave the current one
     *   alone
     * @returns {Promise<void>} resolves when the policies have been set
     * @throws {NativeError} when the Group does not exist or the user lacks
     *   rights to update its policy
     */
    async updateGroupPolicy(groupId: string, policies: ContainerPolicy): Promise<void> {
        return this.native.updateGroupPolicy(this.servicePtr, [groupId, policies]);
    }

    /**
     * Permanently deletes a Group. Containers it was granted access to keep
     * existing; the grant simply stops resolving.
     *
     * @param {string} groupId ID of the Group to delete
     * @returns {Promise<void>} resolves when the Group has been deleted
     * @throws {NativeError} when the Group does not exist or the user lacks
     *   management rights
     */
    async deleteGroup(groupId: string): Promise<void> {
        return this.native.deleteGroup(this.servicePtr, [groupId]);
    }

    /**
     * Fetches a single Group with its metadata, roster, epoch and policies.
     *
     * This is where a container grant comes from: `Group.groupPubKey` and
     * `Group.keyVersion` are the `groupPubKey` / `groupEpoch` of a
     * `GroupGrantWithKey`.
     *
     * @param {string} groupId ID of the Group to fetch
     * @returns {Group} decrypted and verified Group data
     * @throws {NativeError} when the Group does not exist or the user is not a
     *   member of it
     */
    async getGroup(groupId: string): Promise<Group> {
        return this.native.getGroup(this.servicePtr, [groupId]);
    }

    /**
     * Lists the Groups of a Context that the user is a member of, one page at a
     * time.
     *
     * A page carries identity, roster, epoch and policies only - no
     * `publicMeta`/`privateMeta` and no verification status. Call
     * {@link getGroup} for those.
     *
     * @param {string} contextId ID of the Context to enumerate
     * @param {PagingQuery} pagingQuery pagination and sorting; start with
     *   `{ skip: 0, limit: 100, sortOrder: "desc" }`
     * @returns {PagingList<GroupSummary>} one page of Group summaries plus
     *   `totalAvailable`
     */
    async listGroups(
        contextId: string,
        pagingQuery: PagingQuery,
    ): Promise<PagingList<GroupSummary>> {
        return this.native.listGroups(this.servicePtr, [contextId, pagingQuery]);
    }

    /**
     * Seals content for a Group, as one of its members.
     *
     * The returned envelope is self-contained: it names the Group and the key
     * version it was sealed under, so any member can {@link decrypt} it later -
     * including after the Group's key has rotated - without being told anything
     * alongside it. It is signed with your own key, so a reader also learns that
     * you wrote it.
     *
     * Requires membership. To seal for a Group you are not in, use
     * {@link encryptAnonymously}.
     *
     * @param {string} groupId ID of the Group to seal for
     * @param {Uint8Array} content data to encrypt
     * @returns {Uint8Array} the envelope
     * @throws {NativeError} when the Group does not exist or the user is not a
     *   member of it
     */
    async encrypt(groupId: string, content: Uint8Array): Promise<Uint8Array> {
        return this.native.encrypt(this.servicePtr, [groupId, content]);
    }

    /**
     * Seals content for a Group without revealing, or proving, who sent it.
     *
     * Needs only public information - the Group's ID and its identity public key
     * (`Group.groupPubKey`) - so it works whether or not you are a member, and
     * makes no server call. A throwaway keypair is generated per call and
     * discarded, which is what makes the result unattributable: members open it
     * with {@link decrypt}, which reports `ENVELOPE_ANONYMOUS` and no author.
     *
     * You cannot read back what you sealed here. Only the Group can.
     *
     * @param {string} groupId ID of the Group to seal for
     * @param {string} groupPubKey the Group's identity public key (base58-DER
     *   encoded), from `Group.groupPubKey`
     * @param {Uint8Array} content data to encrypt
     * @returns {Uint8Array} the envelope
     * @throws {NativeError} when `groupPubKey` is not a valid public key
     */
    async encryptAnonymously(
        groupId: string,
        groupPubKey: string,
        content: Uint8Array,
    ): Promise<Uint8Array> {
        return this.native.encryptAnonymously(this.servicePtr, [groupId, groupPubKey, content]);
    }

    /**
     * Opens an envelope sealed by {@link encrypt} or {@link encryptAnonymously}.
     *
     * Which of the two it was is reported as `DecryptedEnvelope.type`, and that
     * decides what `authorPubKey` is worth: `ENVELOPE_FROM_MEMBER` means the
     * signature was verified and the author is who it says;
     * `ENVELOPE_ANONYMOUS` means the sender is unknown and `authorPubKey` is
     * empty. Branch on the type, not on the field being non-empty.
     *
     * A file envelope is not accepted here - open one with
     * {@link beginFileDecryption}.
     *
     * @param {Uint8Array} envelope envelope to open
     * @returns {DecryptedEnvelope} the content, and what could be established
     *   about its author
     * @throws {NativeError} when the envelope does not decrypt or does not
     *   verify
     */
    async decrypt(envelope: Uint8Array): Promise<DecryptedEnvelope> {
        return this.native.decrypt(this.servicePtr, [envelope]);
    }

    /**
     * Begins sealing a file for a Group, as one of its members.
     *
     * Nothing is read or written for you - the library converts bytes and hands
     * them straight back. Drive it in three steps: `beginFileEncryption` →
     * {@link encryptFileChunk} (as many times as you like) →
     * {@link finishFileEncryption}.
     *
     * Keep **both** outputs. The ciphertext is the file; the envelope is a small
     * header naming the Group, the key version, the author and the size, and
     * without it nobody can open the ciphertext - not even a member of the
     * Group.
     *
     * ```ts
     * const handle = await groupApi.beginFileEncryption(groupId, plaintext.length);
     * for (const block of blocks) {
     *     sink.write(await groupApi.encryptFileChunk(handle, block));
     * }
     * const envelope = await groupApi.finishFileEncryption(handle); // keep alongside the ciphertext
     * ```
     *
     * Memory stays flat no matter how large the file, but only if each
     * {@link encryptFileChunk} result is written out as it arrives - collecting
     * the ciphertext in a buffer will exhaust the WASM heap.
     *
     * The size is declared up front and enforced at
     * {@link finishFileEncryption}: supplying less than promised is an error,
     * because it cannot be told apart from a file cut short.
     *
     * @param {string} groupId ID of the Group to seal for
     * @param {number} size total size of the plaintext file, in bytes
     * @returns {number} handle to seal file data with
     * @throws {NativeError} when the Group does not exist or the user is not a
     *   member of it
     */
    async beginFileEncryption(groupId: string, size: number): Promise<number> {
        return this.native.beginFileEncryption(this.servicePtr, [groupId, size]);
    }

    /**
     * Begins sealing a file for a Group without revealing, or proving, who sent
     * it.
     *
     * The file counterpart of {@link encryptAnonymously}, driven exactly like
     * {@link beginFileEncryption} - same {@link encryptFileChunk}, same
     * {@link finishFileEncryption}. Needs public information only, makes no
     * server call, and the result is unattributable and therefore unreadable to
     * you afterwards. Only the Group can open it.
     *
     * Because nothing about it is attributable, nothing about it is authorised
     * or metered either: if you accept these from the open internet, bound the
     * size and the volume in your own transport.
     *
     * @param {string} groupId ID of the Group to seal for
     * @param {string} groupPubKey the Group's identity public key (base58-DER
     *   encoded), from `Group.groupPubKey`
     * @param {number} size total size of the plaintext file, in bytes
     * @returns {number} handle to seal file data with
     * @throws {NativeError} when `groupPubKey` is not a valid public key
     */
    async beginFileEncryptionAnonymously(
        groupId: string,
        groupPubKey: string,
        size: number,
    ): Promise<number> {
        return this.native.beginFileEncryptionAnonymously(this.servicePtr, [
            groupId,
            groupPubKey,
            size,
        ]);
    }

    /**
     * Seals the next piece of a file: takes plaintext, returns ciphertext.
     *
     * Blocks may be any size up to 4 MiB and need not align with anything. The
     * return covers whichever internal chunks this call completed, so it is
     * **empty whenever your block did not finish one**, and larger than your
     * block when it finished several. Neither is an error - write whatever comes
     * back straight out, in the order it comes back.
     *
     * @param {number} fileHandle handle from {@link beginFileEncryption} or
     *   {@link beginFileEncryptionAnonymously}
     * @param {Uint8Array} plainChunk plaintext to append, at most 4 MiB
     * @returns {Uint8Array} ciphertext to store, possibly empty
     * @throws {NativeError} when the handle is unknown or the block exceeds
     *   4 MiB
     */
    async encryptFileChunk(fileHandle: number, plainChunk: Uint8Array): Promise<Uint8Array> {
        return this.native.encryptFileChunk(this.servicePtr, [fileHandle, plainChunk]);
    }

    /**
     * Finishes sealing a file and releases its handle.
     *
     * Returns the envelope - the one piece without which the ciphertext is
     * unopenable. Store it.
     *
     * @param {number} fileHandle handle from {@link beginFileEncryption} or
     *   {@link beginFileEncryptionAnonymously}
     * @returns {Uint8Array} the envelope, needed to read the file back
     * @throws {NativeError} when less plaintext arrived than was declared; the
     *   handle is released either way
     */
    async finishFileEncryption(fileHandle: number): Promise<Uint8Array> {
        return this.native.finishFileEncryption(this.servicePtr, [fileHandle]);
    }

    /**
     * Begins opening a sealed file.
     *
     * The mirror of sealing: you fetch the ciphertext from wherever you put it,
     * push it through {@link decryptFileChunk}, and finish with
     * {@link finishFileDecryption}.
     *
     * ```ts
     * const handle = await groupApi.beginFileDecryption(envelope);
     * for (const block of storedBlocks) {
     *     sink.write(await groupApi.decryptFileChunk(handle, block));
     * }
     * const info = await groupApi.finishFileDecryption(handle); // who sent it, and was it whole
     * ```
     *
     * Feed the ciphertext in the order it was produced; block sizes need not
     * match the ones used when sealing. To read only part of a file, see
     * {@link seekInEncryptedFile}.
     *
     * Accepts envelopes from both {@link beginFileEncryption} and
     * {@link beginFileEncryptionAnonymously}; which one it was is reported by
     * {@link finishFileDecryption}.
     *
     * @param {Uint8Array} envelope envelope returned by
     *   {@link finishFileEncryption}
     * @returns {number} handle to open file data with
     * @throws {NativeError} when the envelope does not verify or its key cannot
     *   be resolved
     */
    async beginFileDecryption(envelope: Uint8Array): Promise<number> {
        return this.native.beginFileDecryption(this.servicePtr, [envelope]);
    }

    /**
     * Opens the next piece of a file: takes ciphertext, returns plaintext.
     *
     * Note the difference from `StoreApi.readFromFile`, which fetches for you
     * and takes a *length* - here the second argument is the data itself, and
     * nothing is fetched. As on the sealing side, the return covers whichever
     * internal chunks this call completed, so it may be empty or cover several.
     *
     * @param {number} fileHandle handle from {@link beginFileDecryption}
     * @param {Uint8Array} cipherChunk ciphertext to append, at most 4 MiB
     * @returns {Uint8Array} plaintext, possibly empty
     * @throws {NativeError} when the handle is unknown, the block exceeds 4 MiB,
     *   or a chunk fails to verify
     */
    async decryptFileChunk(fileHandle: number, cipherChunk: Uint8Array): Promise<Uint8Array> {
        return this.native.decryptFileChunk(this.servicePtr, [fileHandle, cipherChunk]);
    }

    /**
     * Moves the read cursor to `position` in the plaintext, and returns where to
     * resume feeding ciphertext.
     *
     * It returns an offset rather than just moving a cursor because you are the
     * source of the bytes: the file is sealed in chunks slightly larger than the
     * plaintext they carry, so plaintext byte N does not sit at ciphertext byte
     * N, and only the library knows that mapping. A chunk is the smallest thing
     * that can be opened, so the offset points at the start of the chunk
     * *containing* `position`; the head of that chunk is discarded for you, so
     * the next {@link decryptFileChunk} still begins exactly at `position`.
     *
     * ```ts
     * const handle = await groupApi.beginFileDecryption(envelope);
     * let at = await groupApi.seekInEncryptedFile(handle, from);
     * const out: Uint8Array[] = [];
     * let got = 0;
     * while (got < length) {
     *     const block = await storage.read(at, 1 << 20); // your storage, your transport
     *     if (block.length === 0) break;                 // ran off the end of the ciphertext
     *     at += block.length;
     *     const plain = await groupApi.decryptFileChunk(handle, block);
     *     out.push(plain);
     *     got += plain.length;
     * }
     * await groupApi.finishFileDecryption(handle);
     * ```
     *
     * The output starts exactly where you asked and may run past where you
     * stopped asking - trim the tail yourself. Seek as often as you like on one
     * handle, forwards or backwards; anything buffered from the previous
     * position is discarded.
     *
     * Seeking gives up the truncation guarantee for this handle, so
     * `DecryptedFileInfo.complete` comes back `false`. Everything you do read
     * stays fully authenticated - a chunk cannot be forged, reordered, or lifted
     * from another file; only "is the rest of it present" becomes unanswerable.
     *
     * @param {number} fileHandle handle from {@link beginFileDecryption}
     * @param {number} position new cursor position in the plaintext, from 0 to
     *   the file size
     * @returns {number} ciphertext byte offset to resume feeding from
     * @throws {NativeError} when the handle is unknown or `position` is out of
     *   range
     */
    async seekInEncryptedFile(fileHandle: number, position: number): Promise<number> {
        return this.native.seekInEncryptedFile(this.servicePtr, [fileHandle, position]);
    }

    /**
     * Finishes opening a file, reports where it came from, and releases its
     * handle.
     *
     * Call it even when you are sure you are done: each chunk verifies on its
     * own, so a missing tail is detectable here and nowhere else - this is the
     * only point at which "the file ended early" can be distinguished from "the
     * file ended".
     *
     * Check `DecryptedFileInfo.type` before trusting `authorPubKey`, and
     * `DecryptedFileInfo.complete` before treating the file as whole.
     *
     * @param {number} fileHandle handle from {@link beginFileDecryption}
     * @returns {DecryptedFileInfo} which Group the file was sealed for, who - if
     *   anyone - is provably its author, and whether all of it arrived
     * @throws {NativeError} when less ciphertext arrived than the envelope
     *   declares and the handle was never seeked; the handle is released either
     *   way
     */
    async finishFileDecryption(fileHandle: number): Promise<DecryptedFileInfo> {
        return this.native.finishFileDecryption(this.servicePtr, [fileHandle]);
    }

    /**
     * Sends an ephemeral notification to a Group's members - "I am typing", "the
     * call has started".
     *
     * The content is sealed with the Group's own key, exactly as {@link encrypt}
     * would seal it, and recipients open it with the key they already hold. So
     * one call sends one request no matter how large the Group is, and members
     * receive it as a Group custom event carrying
     * {@link GroupCustomEventData} with the payload already opened and the
     * sender's signature already verified.
     *
     * A notification is not a record: whoever is not connected and subscribed at
     * the time misses it. Anything that has to survive belongs in a Store or a
     * Thread.
     *
     * @param {string} groupId ID of the Group to notify
     * @param {string} channelName name of the channel, chosen by you; recipients
     *   subscribe to it with {@link buildCustomEventSubscriptionQuery}. Must not
     *   contain `/`, `|`, `,` or `=`
     * @param {Uint8Array} eventData payload to send, capped at about 11 KB after
     *   sealing and encoding
     * @param {string[]} [users] IDs of the members to reach; empty (the default)
     *   means every member
     * @returns {Promise<void>} resolves when the notification has been handed to
     *   the server
     * @throws {NativeError} when the user is not a member of the Group, the
     *   channel name is invalid, or the payload is too large
     */
    async sendCustomEvent(
        groupId: string,
        channelName: string,
        eventData: Uint8Array,
        users: string[] = [],
    ): Promise<void> {
        return this.native.sendCustomEvent(this.servicePtr, [
            groupId,
            channelName,
            eventData,
            users,
        ]);
    }

    /**
     * Subscribes this connection to Group events matching the given
     * subscription queries.
     *
     * Required order: {@link buildSubscriptionQuery} (or
     * {@link buildCustomEventSubscriptionQuery}) → `subscribeFor(queries)` →
     * consume events from the {@link EventQueue} → {@link unsubscribeFrom}.
     *
     * @param {string[]} subscriptionQueries query strings produced by
     *   {@link buildSubscriptionQuery} or
     *   {@link buildCustomEventSubscriptionQuery}; hand-written strings are not
     *   supported
     * @returns {string[]} subscription IDs, index-aligned with
     *   `subscriptionQueries`
     */
    async subscribeFor(subscriptionQueries: string[]): Promise<string[]> {
        return this.native.subscribeFor(this.servicePtr, [subscriptionQueries]);
    }

    /**
     * Cancels Group event subscriptions previously created on this connection.
     *
     * @param {string[]} subscriptionIds IDs returned by {@link subscribeFor};
     *   unknown IDs cause a `NativeError` rejection
     * @returns {Promise<void>} resolves when all listed subscriptions have been cancelled
     */
    async unsubscribeFrom(subscriptionIds: string[]): Promise<void> {
        return this.native.unsubscribeFrom(this.servicePtr, [subscriptionIds]);
    }

    /**
     * Builds a subscription-query string describing one class of Group events.
     *
     * The query is assembled locally by the WASM core - nothing is sent yet;
     * pass the result to {@link subscribeFor} to activate it.
     *
     * @param {GroupEventType} eventType which Group event class to listen for
     * @param {GroupEventSelectorType} selectorType what `selectorId` refers to
     *   (a whole Context or a single Group)
     * @param {string} selectorId ID of the selected scope
     * @returns {string} query string consumed by {@link subscribeFor}
     */
    async buildSubscriptionQuery(
        eventType: GroupEventType,
        selectorType: GroupEventSelectorType,
        selectorId: string,
    ): Promise<string> {
        return this.native.buildSubscriptionQuery(this.servicePtr, [
            eventType,
            selectorType,
            selectorId,
        ]);
    }

    /**
     * Builds a subscription-query string for the custom notifications sent with
     * {@link sendCustomEvent}.
     *
     * @param {string} channelName name of the channel to listen on - the same
     *   name the sender passed
     * @param {GroupEventSelectorType} selectorType what `selectorId` refers to
     *   (a whole Context or a single Group)
     * @param {string} selectorId ID of the selected scope
     * @returns {string} query string consumed by {@link subscribeFor}
     */
    async buildCustomEventSubscriptionQuery(
        channelName: string,
        selectorType: GroupEventSelectorType,
        selectorId: string,
    ): Promise<string> {
        return this.native.buildCustomEventSubscriptionQuery(this.servicePtr, [
            channelName,
            selectorType,
            selectorId,
        ]);
    }
}
