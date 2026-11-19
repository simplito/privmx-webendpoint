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
import { groupGrant } from "./groupGrant.js";
import {
    openGroupFile,
    sealGroupFile,
    type FileRange,
    type GroupFileReader,
    type GroupFileSealer,
} from "./fileStreams.js";
import {
    PagingQuery,
    PagingList,
    UserWithPubKey,
    Group,
    GroupGrantWithKey,
    GroupSummary,
    GroupMemberToAdd,
    ContainerPolicy,
    DecryptedEnvelope,
    DecryptedOutsiderEnvelope,
    DecryptedAnonymousEnvelope,
    DecryptedSharedEnvelope,
    DecryptOutcome,
    EncryptOptions,
    EnvelopeHeader,
    GroupErrorDetails,
    GroupOutcome,
    GroupPublicKey,
    GroupRoleChange,
    GroupRulesUpdate,
    GroupLogEntry,
    DecryptedFileInfo,
    CipherRange,
    SequenceAppendResult,
    SequenceItem,
    SequenceItemHeader,
    SequenceMarkInfo,
    GroupEventType,
    GroupEventSelectorType,
} from "../Types.js";
import { ANY_AUTHOR, toNativePath, type LocationOrNone } from "./groupPaths.js";
import type {
    NativeDecryptedEnvelope,
    NativeDecryptOptions,
    NativeDecryptResult,
    NativeEncryptOptions,
} from "../native/GroupApiNative.js";

/** Every read says whose writing it expects; there is no way to leave the question out. */
export interface DecryptOptions {
    /**
     * The author you are about to show: usually the one your server names next
     * to the envelope. A different author fails with
     * `GroupErrorCode.ENVELOPE_WRONG_AUTHOR`. Pass {@link ANY_AUTHOR} only if
     * you display `author.userId` from the result.
     */
    expectedAuthor: string | typeof ANY_AUTHOR;
    /** For content that reached you as new: it must be from the current epoch. */
    currentEpochOnly?: boolean;
}

function toNativeDecryptOptions(options: DecryptOptions): NativeDecryptOptions {
    // Checked here as well as in the core: a caller in plain JavaScript gets the reason, not a bare native error.
    if (options === undefined || options === null || options.expectedAuthor === undefined) {
        throw new TypeError("a read names its expectedAuthor, or passes ANY_AUTHOR");
    }
    if (options.expectedAuthor === ANY_AUTHOR) {
        return {
            anyAuthor: true,
            currentEpochOnly: options.currentEpochOnly === true,
        };
    }
    if (typeof options.expectedAuthor !== "string" || options.expectedAuthor.length === 0) {
        throw new TypeError("expectedAuthor is a user ID, or ANY_AUTHOR");
    }
    return {
        expectedAuthor: options.expectedAuthor,
        currentEpochOnly: options.currentEpochOnly === true,
    };
}

function toNativeEncryptOptions(options?: EncryptOptions): NativeEncryptOptions {
    return {
        alsoFor: (options?.alsoFor ?? []).map((recipient) =>
            "group" in recipient ? { groupId: recipient.group } : { user: recipient.user },
        ),
    };
}

function fromNativeEnvelope(native: NativeDecryptedEnvelope): DecryptedEnvelope {
    return {
        data: native.data,
        author: {
            userId: native.author.userId,
            pubKey: native.author.pubKey,
            role: native.author.role === "manager" ? "manager" : "user",
        },
        epoch: native.keyVersion,
        encryptedAt: native.encryptedAt,
        sharedWith: native.sharedWith,
    };
}

function fromNativeDetails(native: NativeDecryptResult["details"]): GroupErrorDetails {
    const details: GroupErrorDetails = {};
    if (native?.userId) details.userId = native.userId;
    if (native?.pubKey) details.pubKey = native.pubKey;
    if (
        native?.envelopeKind === "member" ||
        native?.envelopeKind === "outsider" ||
        native?.envelopeKind === "anonymous" ||
        native?.envelopeKind === "shared"
    ) {
        details.envelopeKind = native.envelopeKind;
    }
    return details;
}

/**
 * Groups: who your app shares things with.
 *
 * A Group is a named set of Context users with a key of its own. Grant the
 * Group to a Thread, Store, KVDB, Inbox, Search Index or Stream Room and
 * membership stops being a property of each container: you edit the Group, and
 * every container it was granted to follows. That is the difference between
 * "add Dana to the project" and "add Dana to eleven containers, and remember
 * the twelfth next week".
 *
 * A Group is also an encryption target in its own right - see *Working without
 * a container* below - so you can use one long before you decide which module
 * fits your data.
 *
 * Get one from a connection: `await connection.getGroupApi()` (or
 * {@link EndpointFactory.createGroupApi}). Never construct it directly.
 *
 * ## Grant a Group instead of a user list
 *
 * Create the Group, read back its verified key, then hand that to any container
 * as a `GroupGrantWithKey`. The container's own `users`/`managers` lists stay
 * available for one-off guests; the Group covers everyone else.
 *
 * ```ts
 * const groups = await connection.getGroupApi();
 * const threads = await connection.getThreadApi();
 *
 * const groupId = await groups.createGroup(
 *     contextId,
 *     [alice, bob],                                  // UserWithPubKey[]
 *     [alice],                                       // managers
 *     new TextEncoder().encode(JSON.stringify({ name: "Design" })),
 *     new Uint8Array(),
 * );
 *
 * // `groupPubKey` + `keyVersion` are what a container verifies the grant against.
 * const group = await groups.getGroup(groupId);
 * const grant = {
 *     groupId,
 *     role: "user",
 *     groupPubKey: group.groupPubKey,
 *     groupEpoch: group.keyVersion,
 * };
 *
 * const threadId = await threads.createThread(
 *     contextId, [alice], [alice], publicMeta, privateMeta, undefined, [grant],
 * );
 * ```
 *
 * ## Changing membership
 *
 * {@link addGroupMembers} is cheap and invisible to your containers: the epoch
 * does not move, so nothing has to be re-keyed and the newcomer can read what
 * was written before they arrived.
 *
 * {@link removeGroupMembers} advances the epoch, which is what cuts the leaver
 * off. Containers granted to the Group then hold a key wrapped to the old epoch
 * and list the Group in `staleGroups`.
 *
 * You do not have to re-key them yourself. The next write to a container
 * re-keys it and retries the write, so a chat that keeps chatting repairs
 * itself. Call `rotate*Keys` when you want the container current before anyone
 * writes, or when a write comes back saying the automatic re-key was refused,
 * which happens when that container's `rotateKeys` policy does not let the
 * writer do it.
 *
 * Remove people in one batch rather than one call per person: the epoch moves
 * once either way.
 *
 * A removal also changes the Group's identity key. `removeGroupMembers` mints a
 * new `keyVersion` and a new `groupPubKey` together, and it is the only call
 * that does: {@link addGroupMembers}, {@link updateGroupPublicMeta},
 * {@link updateGroupPrivateMeta} and {@link updateGroupPolicy} leave both
 * alone, while {@link createGroup} mints the first. Anything that copied
 * `groupPubKey` - a grant, a link an outsider seals with - is holding a
 * superseded key afterwards, so re-read it from {@link getGroup} or let
 * {@link grantFor} do it.
 *
 * ```ts
 * await groups.removeGroupMembers(groupId, ["bob", "carol"]); // one epoch bump
 *
 * // Nothing else is required. The next sendMessage re-keys the Thread on the
 * // way through. To re-key on the spot instead:
 * const thread = await threads.getThread(threadId);
 * const g = await groups.getGroup(groupId);                   // current epoch key
 * // `thread.users` holds ids, while rotate*Keys re-wraps to public keys -
 * // resolve them from `connection.listContextUsers` or your own roster.
 * await threads.rotateThreadKeys(
 *     threadId, withKeys(thread.users), withKeys(thread.managers), thread.version, false,
 *     [{ groupId, role: "user", groupPubKey: g.groupPubKey, groupEpoch: g.keyVersion }],
 * );
 * ```
 *
 * ## Working without a container
 *
 * {@link encrypt} seals a value for the Group and signs it, so a reader learns
 * who wrote it; {@link decrypt} reports which of the two kinds it got, and that
 * - not a non-empty author field - is what to branch on.
 * {@link encryptAnonymously} needs only the Group's ID and public key, works
 * without membership and without a server call, and is unattributable by
 * construction. {@link beginFileEncryption} and friends do the same for a file
 * of any size, in chunks, with ranged reads via {@link seekInEncryptedFile}.
 *
 * Nothing here touches storage: you get an envelope and, for files, ciphertext,
 * and you keep them wherever you like - your bucket, your database, a file the
 * user downloads. Neither reveals anything to whoever holds it.
 *
 * ```ts
 * const sealed = await groups.encrypt(groupId, new TextEncoder().encode("ship it"));
 * await myBucket.put(key, sealed);                    // your storage, your rules
 *
 * const opened = await groups.decrypt(await myBucket.get(key));
 * if (opened.type === Types.EnvelopeType.ENVELOPE_FROM_MEMBER) {
 *     console.log("signed by", opened.authorPubKey);
 * }
 * ```
 *
 * ## Live notifications
 *
 * {@link sendCustomEvent} fans a small sealed payload out to the Group's
 * members - one request however large the Group - and is the right tool for
 * "someone is typing", "a new object landed". It is a notification, not a
 * record: whoever is offline misses it. Subscribe with
 * {@link buildCustomEventSubscriptionQuery} → {@link subscribeFor}, or use the
 * `createGroupCustomEventSubscription` helper with an event manager. Group
 * lifecycle events (created / updated / deleted) come from
 * {@link buildSubscriptionQuery} the same way.
 *
 * ## Cost, in one line
 *
 * Adding members is a single delta over their shared key-tree paths, and
 * removing one costs work proportional to the *logarithm* of the Group size -
 * so Groups of thousands are a normal thing to build on, and a removal does not
 * become slower as the Group grows.
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
        options?: { idSeed?: Uint8Array; visibleTo?: "members" | "context" },
    ): Promise<string> {
        return this.native.createGroup(this.servicePtr, [
            contextId,
            users,
            managers,
            publicMeta,
            privateMeta,
            policies,
            options?.idSeed,
            options?.visibleTo ?? "members",
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
     * ```ts
     * await groups.addGroupMembers(groupId, [
     *     { user: { userId: "dana", pubKey: danaPubKey }, role: "user" },
     *     { user: { userId: "erin", pubKey: erinPubKey }, role: "manager" },
     * ]);
     * ```
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
     * members leave.
     *
     * The new epoch comes with a new `groupPubKey`, so anything that copied the
     * old one is holding a superseded key.
     *
     * Containers granted to the Group list it in `staleGroups` until they carry
     * the new epoch. The next write to a container re-keys it and goes through,
     * so this call needs no follow-up. `rotate*Keys` is there for when you want
     * a container current before anyone writes, or when a write reports that
     * the automatic re-key was refused.
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
    async removeGroupMembers(groupId: string, userIds: string[]): Promise<number> {
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
     * Reads the Group and returns the grant that gives it access to a
     * container, in one call.
     *
     * Saves the two steps every container creation otherwise repeats: fetch the
     * Group for its current key, then copy four fields into a grant. Reach for
     * {@link groupGrant} instead when you already hold the Group and want no
     * round trip.
     *
     * @param {string} groupId ID of the Group to grant
     * @param {"user" | "manager"} [role] what the Group may do in the
     *   container: read and write as a user, or also change the container as a
     *   manager. Defaults to `"user"`
     * @returns {GroupGrantWithKey} the grant to pass in a container's `groups`
     *   list
     * @throws {NativeError} when the Group does not exist or the user cannot
     *   read it
     * @example
     * const grant = await groups.grantFor(groupId);
     * const threadId = await threads.createThread(
     *     contextId, [me], [me], publicMeta, privateMeta, undefined, [grant],
     * );
     */
    async grantFor(groupId: string, role: "user" | "manager" = "user"): Promise<GroupGrantWithKey> {
        return groupGrant(await this.getGroup(groupId), role);
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
     * Seals content for a Group, as one of its members, bound to a location in
     * your data.
     *
     * The envelope opens only with the same `location`: a server that stores it
     * under another record gets `ENVELOPE_WRONG_LOCATION` on every reader. It is
     * signed with your key and names you. `options.alsoFor` adds readers beside
     * the Group: other Groups, single users.
     *
     * ```ts
     * const body = await api.encrypt(groupId, ["chat", id(chatId), "message", id(messageId), "body"], data);
     * ```
     *
     * @param {string} groupId ID of the Group to seal for; you must be a member
     * @param {LocationOrNone} location where the value lives, or {@link NO_LOCATION}
     * @param {Uint8Array} content data to encrypt
     * @param {EncryptOptions} [options] further recipients
     * @returns {Uint8Array} the envelope
     * @throws {NativeError} when the Group does not exist or you are not a member of it
     */
    async encrypt(
        groupId: string,
        location: LocationOrNone,
        content: Uint8Array,
        options?: EncryptOptions,
    ): Promise<Uint8Array> {
        return this.native.encrypt(this.servicePtr, [
            groupId,
            toNativePath(location),
            content,
            toNativeEncryptOptions(options),
        ]);
    }

    /**
     * Opens an envelope written by a member of `groupId` with {@link encrypt}.
     *
     * Each of the four reading calls takes exactly one kind of envelope and
     * throws `ENVELOPE_WRONG_KIND` for the others: {@link decrypt} (a member's),
     * {@link decryptFromOutsider} (signed by a non-member),
     * {@link decryptAnonymous} (unsigned), {@link decryptShared} (written in
     * another Group). So what a non-member wrote is never shown as a member's,
     * and what nobody signed is never shown as somebody's.
     *
     * Every read says whose writing it expects: the author your server names
     * next to the envelope, or {@link ANY_AUTHOR} if you show the author from
     * the result and from nowhere else.
     *
     * A removed member keeps the keys of the epochs they were in. For content
     * that arrived as new, set `currentEpochOnly`, and have your server refuse
     * envelopes that are not from the current epoch ({@link peekEnvelope}).
     *
     * @throws {NativeError} `GroupErrorCode.ENVELOPE_WRONG_LOCATION`, `ENVELOPE_WRONG_GROUP`,
     *   `ENVELOPE_WRONG_AUTHOR`, `ENVELOPE_UNVERIFIED_AUTHOR`, `ENVELOPE_AUTHOR_NOT_MEMBER`,
     *   `ENVELOPE_STALE_EPOCH`, `ENVELOPE_WRONG_KIND`
     */
    async decrypt(
        groupId: string,
        location: LocationOrNone,
        envelope: Uint8Array,
        options: DecryptOptions,
    ): Promise<DecryptedEnvelope> {
        return fromNativeEnvelope(
            await this.native.decrypt(this.servicePtr, [
                groupId,
                toNativePath(location),
                envelope,
                toNativeDecryptOptions(options),
            ]),
        );
    }

    /**
     * {@link decrypt} for a page of envelopes of one Group. Never throws for a
     * bad item: each reports on its own, so one moved or forged message becomes
     * a warning and the rest still show.
     */
    async decryptMany(
        groupId: string,
        items: ReadonlyArray<{
            location: LocationOrNone;
            envelope: Uint8Array;
            options: DecryptOptions;
        }>,
    ): Promise<DecryptOutcome[]> {
        const results = await this.native.decryptMany(this.servicePtr, [
            groupId,
            items.map((item) => ({
                envelope: item.envelope,
                location: toNativePath(item.location),
                options: toNativeDecryptOptions(item.options),
            })),
        ]);
        return results.map((result) =>
            result.statusCode === 0
                ? { ok: true as const, ...fromNativeEnvelope(result.envelope) }
                : {
                      ok: false as const,
                      code: result.statusCode,
                      details: fromNativeDetails(result.details),
                  },
        );
    }

    /**
     * Seals content for a Group you are not a member of, signed by you: you can
     * write and prove it was you, and cannot read it back. The Group opens it
     * with {@link decryptFromOutsider}.
     *
     * The Group's current key is read and verified here; none is passed in. The
     * Group has to be visible to the Context ({@link setGroupVisibility}).
     */
    async encryptAsOutsider(
        contextId: string,
        groupId: string,
        location: LocationOrNone,
        content: Uint8Array,
        options?: EncryptOptions,
    ): Promise<Uint8Array> {
        return this.native.encryptAsOutsider(this.servicePtr, [
            contextId,
            groupId,
            toNativePath(location),
            content,
            toNativeEncryptOptions(options),
        ]);
    }

    /**
     * Seals content for a Group without revealing, or proving, who sent it.
     * Needs only public information - the Group's ID and its identity public
     * key - and makes no server call. The Group opens it with
     * {@link decryptAnonymous}, which reports no sender.
     *
     * @param {string} groupPubKey the Group's identity public key (base58-DER encoded)
     */
    async encryptAnonymously(
        groupId: string,
        groupPubKey: string,
        location: LocationOrNone,
        content: Uint8Array,
    ): Promise<Uint8Array> {
        return this.native.encryptAnonymously(this.servicePtr, [
            groupId,
            groupPubKey,
            toNativePath(location),
            content,
        ]);
    }

    /**
     * Opens an envelope written to `groupId`, and signed, by someone who is not
     * a member ({@link encryptAsOutsider}). The sender is who they say; whether
     * they may write here is your question to answer.
     */
    async decryptFromOutsider(
        groupId: string,
        location: LocationOrNone,
        envelope: Uint8Array,
        options: DecryptOptions,
    ): Promise<DecryptedOutsiderEnvelope> {
        const result = await this.native.decryptFromOutsider(this.servicePtr, [
            groupId,
            toNativePath(location),
            envelope,
            toNativeDecryptOptions(options),
        ]);
        return {
            data: result.data,
            epoch: result.keyVersion,
            sender: result.sender,
            encryptedAt: result.encryptedAt,
            sharedWith: result.sharedWith,
        };
    }

    /** Opens an unsigned envelope written to `groupId` ({@link encryptAnonymously}). There is no sender to report. */
    async decryptAnonymous(
        groupId: string,
        location: LocationOrNone,
        envelope: Uint8Array,
    ): Promise<DecryptedAnonymousEnvelope> {
        const result = await this.native.decryptAnonymous(this.servicePtr, [
            groupId,
            toNativePath(location),
            envelope,
        ]);
        return { data: result.data, epoch: result.keyVersion };
    }

    /**
     * Opens an envelope written in another Group and shared with you through
     * `alsoFor`: as a user, or as a member of one of the recipient Groups. You
     * need not know which. `location` is the one the author wrote it at.
     *
     * The result has a sender, not an author. Check `senderIsMember`: anyone in
     * the Context can address an envelope to you and name any Group as its
     * origin.
     *
     * @throws {NativeError} `GroupErrorCode.ENVELOPE_NOT_A_RECIPIENT` when you are not among the recipients
     */
    async decryptShared(
        contextId: string,
        location: LocationOrNone,
        envelope: Uint8Array,
        options: DecryptOptions,
    ): Promise<DecryptedSharedEnvelope> {
        const result = await this.native.decryptShared(this.servicePtr, [
            contextId,
            toNativePath(location),
            envelope,
            toNativeDecryptOptions(options),
        ]);
        return {
            data: result.data,
            sender: result.sender,
            homeGroupId: result.homeGroupId,
            // Anything the core does not positively call a member or a non-member stays unknown.
            senderIsMember:
                result.senderMembership === "member"
                    ? true
                    : result.senderMembership === "notMember"
                      ? false
                      : "unknown",
            via: result.via,
            encryptedAt: result.encryptedAt,
            sharedWith: result.sharedWith,
        };
    }

    /**
     * The part of an envelope (a message's or a file's) readable without any
     * key: for a server that refuses writes early, such as one from a stale
     * epoch. Nothing in it is authenticated.
     */
    async peekEnvelope(envelope: Uint8Array): Promise<EnvelopeHeader> {
        const header = await this.native.peekEnvelope(this.servicePtr, [envelope]);
        return {
            version: header.version,
            groupId: header.groupId,
            epoch: header.keyVersion,
            fromOutsider: header.fromOutsider,
            isSigned: header.isSigned,
            isFile: header.isFile,
            hasLocation: header.hasLocation,
            authorUserId: header.authorUserId,
            ...(header.sequenceId ? { sequenceId: header.sequenceId } : {}),
            alsoForGroups: header.alsoForGroups.map((g) => ({
                groupId: g.groupId,
                epoch: g.keyVersion,
            })),
            alsoForUsers: header.alsoForUsers,
        };
    }

    /**
     * The ID of a Group created with `idSeed`: every client computes the same
     * one from the Context and the seed, so no server has to be asked which
     * Group belongs to an entity.
     *
     * A seed anybody can compute is a name anybody can take first. Creating a
     * Group under a seed fails when one exists or ever existed; when you find a
     * Group under a derived ID, check `Group.creator` against who owns the
     * entity before you trust it.
     */
    async deriveGroupId(contextId: string, idSeed: Uint8Array): Promise<string> {
        return this.native.deriveGroupId(this.servicePtr, [contextId, idSeed]);
    }

    /** {@link getGroup} for several Groups. One result per ID, in order; a Group that fails reports its own code. */
    async getGroups(groupIds: string[]): Promise<GroupOutcome[]> {
        const results = await this.native.getGroups(this.servicePtr, [groupIds]);
        return results.map((result) =>
            result.statusCode === 0
                ? { ok: true as const, group: result.group }
                : { ok: false as const, code: result.statusCode },
        );
    }

    /**
     * The Group's current identity key, read and verified against the Group's
     * latest statement. For a member, and for any user of the Context when the
     * Group is visible to the Context.
     */
    async getGroupPublicKey(contextId: string, groupId: string): Promise<GroupPublicKey> {
        const key = await this.native.getGroupPublicKey(this.servicePtr, [contextId, groupId]);
        return { groupId: key.groupId, epoch: key.keyVersion, pubKey: key.pubKey };
    }

    /**
     * Sets who beside the members may read the Group's identity key, roster and
     * statements. A manager's call. Making a Group visible to the Context is
     * what lets someone outside it write to it with {@link encryptAsOutsider};
     * it also shows the roster to every user of the Context.
     */
    async setGroupVisibility(groupId: string, visibleTo: "members" | "context"): Promise<void> {
        return this.native.setGroupVisibility(this.servicePtr, [groupId, visibleTo]);
    }

    /**
     * Lets members back in after their identity key was replaced and they
     * cannot renew their own leaf (that needs the previous key,
     * {@link Connection.renewIdentity}). Everything they could open is re-keyed
     * and the key epoch advances once; they keep their seats, their roles and
     * their place on the roster. Whoever still holds a previous key reads
     * nothing written from here on.
     *
     * The members' current keys go through the Connection's UserVerifier like
     * any key this client wraps to. With key continuity on
     * ({@link Connection.useKeyContinuity}), accept the change first
     * ({@link Connection.acceptKeyChange}), after checking it is genuine.
     *
     * Allowed by the `removeMembers` rule. The caller cannot be among `userIds`.
     *
     * @param {string} groupId ID of the Group
     * @param {string[]} userIds IDs of the members to reseat
     * @returns {Promise<number>} the Group's key epoch after the call
     */
    async reseatGroupMembers(groupId: string, userIds: string[]): Promise<number> {
        return this.native.reseatGroupMembers(this.servicePtr, [groupId, userIds]);
    }

    /**
     * Changes the role of members already in the Group. No key moves: a role
     * decides what the Bridge and the other members accept from somebody, not
     * what they can read.
     *
     * Allowed by the `updatePolicy` rule (managers, by default). Refused when it
     * would leave a Group that has managers with none.
     *
     * @param {string} groupId ID of the Group
     * @param {GroupRoleChange[]} changes the members and the role each takes
     */
    async setGroupRoles(groupId: string, changes: GroupRoleChange[]): Promise<void> {
        return this.native.setGroupRoles(this.servicePtr, [groupId, changes]);
    }

    /**
     * Changes who may add members, remove members and rewrite the Group's
     * metadata, leaving the rest of the policy as it is. A signed commit like
     * {@link updateGroupPolicy}, under the same rule.
     *
     * @param {string} groupId ID of the Group
     * @param {GroupRulesUpdate} rules the rules to change; one left out stays
     */
    async updateGroupRules(groupId: string, rules: GroupRulesUpdate): Promise<void> {
        return this.native.updateGroupRules(this.servicePtr, [groupId, rules]);
    }

    /**
     * The Group's history: every signed statement since its creation, verified
     * from the first to the one the Group is at now. Reads the whole chain on
     * every call, so its cost grows with the Group's age, not with `limit`.
     *
     * @param {string} groupId ID of the Group
     * @param {PagingQuery} pagingQuery `skip`, `limit` and `sortOrder`
     *   ("asc": oldest first)
     * @returns {Promise<PagingList<GroupLogEntry>>} the statements in the
     *   window, and how many there are in all
     */
    async getGroupLog(
        groupId: string,
        pagingQuery: PagingQuery,
    ): Promise<PagingList<GroupLogEntry>> {
        const page = await this.native.getGroupLog(this.servicePtr, [groupId, pagingQuery]);
        return {
            totalAvailable: page.totalAvailable,
            readItems: page.readItems.map(({ keyVersion, ...entry }) => ({
                ...entry,
                epoch: keyVersion,
            })),
        };
    }

    /**
     * Replaces the Group's key without changing its members.
     * @returns {number} the Group's epoch after the call
     */
    async rotateGroupKey(groupId: string): Promise<number> {
        return this.native.rotateGroupKey(this.servicePtr, [groupId]);
    }

    // ── Files ──────────────────────────────────────────────────────────────
    //
    // A file comes out as two things: the ciphertext, which `encryptFileChunk`
    // hands back call by call, and the envelope, which `finishFileEncryption`
    // returns. Store both. The envelope is made when the file ends and lists the
    // size and a digest of every chunk, signed by the writer: the size need not
    // be known up front, a file cut short is detected, and a chunk another
    // member rewrote is caught at that chunk. Most apps want the stream forms,
    // {@link sealFile} and {@link openFile}.

    /**
     * Begins encrypting a file for a Group, as one of its members.
     *
     * @param {string} groupId ID of the Group
     * @param {LocationOrNone} location where the file lives in your data; its envelope opens nowhere else
     * @param {EncryptOptions} [options] further readers, as for {@link encrypt}
     * @returns {number} handle for {@link encryptFileChunk} and {@link finishFileEncryption}
     */
    async beginFileEncryption(
        groupId: string,
        location: LocationOrNone,
        options?: EncryptOptions,
    ): Promise<number> {
        return this.native.beginFileEncryption(this.servicePtr, [
            groupId,
            toNativePath(location),
            toNativeEncryptOptions(options),
        ]);
    }

    /** As {@link beginFileEncryption}, for a writer who is not a member. The file form of {@link encryptAsOutsider}. */
    async beginFileEncryptionAsOutsider(
        contextId: string,
        groupId: string,
        location: LocationOrNone,
        options?: EncryptOptions,
    ): Promise<number> {
        return this.native.beginFileEncryptionAsOutsider(this.servicePtr, [
            contextId,
            groupId,
            toNativePath(location),
            toNativeEncryptOptions(options),
        ]);
    }

    /** The file form of {@link encryptAnonymously}: nobody signs the file, and no server call is made. */
    async beginFileEncryptionAnonymously(
        groupId: string,
        groupPubKey: string,
        location: LocationOrNone,
    ): Promise<number> {
        return this.native.beginFileEncryptionAnonymously(this.servicePtr, [
            groupId,
            groupPubKey,
            toNativePath(location),
        ]);
    }

    /**
     * Encrypts the next piece of a file and returns all of its ciphertext:
     * nothing is held back for the finish. Each call makes one chunk (more above
     * 128 KiB) and a chunk costs 36 bytes of envelope, so pass blocks of tens of
     * kilobytes or more.
     */
    async encryptFileChunk(fileHandle: number, plainChunk: Uint8Array): Promise<Uint8Array> {
        return this.native.encryptFileChunk(this.servicePtr, [fileHandle, plainChunk]);
    }

    /** Ends the file, releases the handle and returns the file envelope. */
    async finishFileEncryption(fileHandle: number): Promise<Uint8Array> {
        return this.native.finishFileEncryption(this.servicePtr, [fileHandle]);
    }

    /**
     * Begins decrypting a file a member of the Group wrote. The envelope is
     * checked exactly as {@link decrypt} checks a message's: location, Group,
     * kind and author.
     */
    async beginFileDecryption(
        groupId: string,
        location: LocationOrNone,
        envelope: Uint8Array,
        options: DecryptOptions,
    ): Promise<number> {
        return this.native.beginFileDecryption(this.servicePtr, [
            groupId,
            toNativePath(location),
            envelope,
            toNativeDecryptOptions(options),
        ]);
    }

    /** The file form of {@link decryptFromOutsider}. */
    async beginFileDecryptionFromOutsider(
        groupId: string,
        location: LocationOrNone,
        envelope: Uint8Array,
        options: DecryptOptions,
    ): Promise<number> {
        return this.native.beginFileDecryptionFromOutsider(this.servicePtr, [
            groupId,
            toNativePath(location),
            envelope,
            toNativeDecryptOptions(options),
        ]);
    }

    /** The file form of {@link decryptAnonymous}. */
    async beginAnonymousFileDecryption(
        groupId: string,
        location: LocationOrNone,
        envelope: Uint8Array,
    ): Promise<number> {
        return this.native.beginAnonymousFileDecryption(this.servicePtr, [
            groupId,
            toNativePath(location),
            envelope,
        ]);
    }

    /** The file form of {@link decryptShared}. */
    async beginSharedFileDecryption(
        contextId: string,
        location: LocationOrNone,
        envelope: Uint8Array,
        options: DecryptOptions,
    ): Promise<number> {
        return this.native.beginSharedFileDecryption(this.servicePtr, [
            contextId,
            toNativePath(location),
            envelope,
            toNativeDecryptOptions(options),
        ]);
    }

    /**
     * Decrypts the next piece of a file. The ciphertext may be cut any way;
     * bytes that do not yet make a whole chunk wait, so a call may return
     * nothing. Every chunk is checked against the writer's digest before it is
     * returned.
     *
     * @throws {NativeError} `GroupErrorCode.ENVELOPE_FILE_CORRUPTED` at a chunk that was changed, moved or swapped
     */
    async decryptFileChunk(fileHandle: number, cipherChunk: Uint8Array): Promise<Uint8Array> {
        return this.native.decryptFileChunk(this.servicePtr, [fileHandle, cipherChunk]);
    }

    /** Which ciphertext bytes hold plaintext bytes `[from, to)`: for an HTTP Range request. */
    async getFileCipherRange(fileHandle: number, from: number, to: number): Promise<CipherRange> {
        return this.native.getFileCipherRange(this.servicePtr, [fileHandle, from, to]);
    }

    /**
     * Moves reading to `position` in the plaintext and returns where in the
     * ciphertext to continue from. What the next {@link decryptFileChunk}
     * returns begins exactly at `position`.
     */
    async seekInEncryptedFile(fileHandle: number, position: number): Promise<number> {
        return this.native.seekInEncryptedFile(this.servicePtr, [fileHandle, position]);
    }

    /**
     * Ends reading and releases the handle.
     *
     * @throws {NativeError} `GroupErrorCode.ENVELOPE_TRUNCATED_FILE` when listed chunks never arrived
     *   (after a seek `complete` is `false` instead)
     */
    async finishFileDecryption(fileHandle: number): Promise<DecryptedFileInfo> {
        const info = await this.native.finishFileDecryption(this.servicePtr, [fileHandle]);
        const result: DecryptedFileInfo = {
            epoch: info.keyVersion,
            size: info.size,
            complete: info.complete,
            sharedWith: info.sharedWith,
        };
        if (info.author) {
            result.author = { ...info.author, role: info.author.role === "manager" ? "manager" : "user" };
        }
        if (info.sender) result.sender = info.sender;
        if (info.via) {
            result.via = info.via;
            result.homeGroupId = info.homeGroupId;
            result.senderIsMember =
                info.senderMembership === "member"
                    ? true
                    : info.senderMembership === "notMember"
                      ? false
                      : "unknown";
        }
        return result;
    }

    // ── Sequences: many small items from one author, in order ──────────────
    //
    // For what is too frequent to sign one by one: edits of a shared document,
    // live captions, cursors. The author signs once, in the header. An item is
    // then sealed under the sequence's own key with its position. A reader
    // knows at once that a holder of the Group's key made the item and where it
    // belongs; that the *author* made it, only after the next checkpoint or the
    // close verifies. A sequence belongs to one epoch: after a removal or a
    // rotation {@link appendToSequence} fails with `ENVELOPE_STALE_EPOCH`.

    /**
     * @param {number} [checkpointEvery] a checkpoint is made by itself after this many items (default 64);
     *   0 turns that off, for a writer that calls {@link checkpointSequence} on its own schedule
     */
    async beginSequence(
        groupId: string,
        location: LocationOrNone,
        checkpointEvery = 64,
    ): Promise<number> {
        return this.native.beginSequence(this.servicePtr, [
            groupId,
            toNativePath(location),
            checkpointEvery,
        ]);
    }

    /** The signed header. Send or store it before the items. */
    async getSequenceHeader(sequence: number): Promise<Uint8Array> {
        return this.native.getSequenceHeader(this.servicePtr, [sequence]);
    }

    /** Send `item`, then `mark` when there is one. */
    async appendToSequence(sequence: number, data: Uint8Array): Promise<SequenceAppendResult> {
        const result = await this.native.appendToSequence(this.servicePtr, [sequence, data]);
        return result.mark ? { item: result.item, mark: result.mark } : { item: result.item };
    }

    /** A signature over everything appended so far. Send it like an item. */
    async checkpointSequence(sequence: number): Promise<Uint8Array> {
        return this.native.checkpointSequence(this.servicePtr, [sequence]);
    }

    /** A final checkpoint that also says nothing follows. Frees the handle. */
    async finishSequence(sequence: number): Promise<Uint8Array> {
        return this.native.finishSequence(this.servicePtr, [sequence]);
    }

    /**
     * Opens a sequence for reading; the header is checked as {@link decrypt}
     * checks an envelope.
     *
     * @param {Uint8Array} [resumeFrom] a checkpoint of this sequence to start after
     */
    async openSequence(
        groupId: string,
        location: LocationOrNone,
        header: Uint8Array,
        options: DecryptOptions,
        resumeFrom?: Uint8Array,
    ): Promise<number> {
        return this.native.openSequence(this.servicePtr, [
            groupId,
            toNativePath(location),
            header,
            toNativeDecryptOptions(options),
            resumeFrom,
        ]);
    }

    /**
     * Items arrive in order. A skipped one is reported in `missing`.
     *
     * @throws {NativeError} `GroupErrorCode.ENVELOPE_SEQUENCE_ORDER` for an earlier or repeated item
     */
    async readSequenceItem(sequence: number, item: Uint8Array): Promise<SequenceItem> {
        return this.native.readSequenceItem(this.servicePtr, [sequence, item]);
    }

    /**
     * Checks a checkpoint or a close against the items read.
     *
     * @throws {NativeError} `GroupErrorCode.ENVELOPE_SEQUENCE_ORDER` when an item was missing or forged;
     *   reading may go on, and the next mark attests what follows this one
     */
    async verifySequenceMark(sequence: number, mark: Uint8Array): Promise<SequenceMarkInfo> {
        return this.native.verifySequenceMark(this.servicePtr, [sequence, mark]);
    }

    /** Frees a handle from {@link openSequence}, or from {@link beginSequence} without finishing it. */
    async closeSequence(sequence: number): Promise<void> {
        return this.native.closeSequence(this.servicePtr, [sequence]);
    }

    /** The plain part of a sequence item or mark. Not authenticated: for a server that refuses stale writes. */
    async peekSequenceItem(itemOrMark: Uint8Array): Promise<SequenceItemHeader> {
        return this.native.peekSequenceItem(this.servicePtr, [itemOrMark]);
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
     * Sending, and receiving on the other side:
     *
     * ```ts
     * await groups.sendCustomEvent(groupId, "presence", enc(JSON.stringify({ typing: true })));
     *
     * // recipients, once per connection
     * const events = await connection.getEventManager();
     * await events.subscribe([
     *     createGroupCustomEventSubscription({
     *         channel: "presence",
     *         selector: Types.GroupEventSelectorType.GROUP_ID,
     *         id: groupId,
     *         callbacks: [
     *             (e) => {
     *                 if (e.data.statusCode !== 0) return;   // could not be opened
     *                 const { typing } = JSON.parse(dec(e.data.payload));
     *                 showTyping(e.data.authorPubKey, typing); // verified sender
     *             },
     *         ],
     *     }),
     * ]);
     * ```
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

    // --- files, as streams ------------------------------------------------

    /**
     * Encrypts a file for a Group as a stream: plaintext in, ciphertext out.
     * The envelope settles once the stream has been read to the end. No size is
     * needed up front.
     *
     * @example
     * const sealer = groupApi.sealFile({ groupId, location: ["scan", id(scanId)] });
     * await file.stream().pipeThrough(sealer).pipeTo(bucketWritable);
     * const envelope = await sealer.envelope; // keep it next to the ciphertext
     */
    sealFile(opts: {
        groupId: string;
        location: LocationOrNone;
        alsoFor?: EncryptOptions["alsoFor"];
    }): GroupFileSealer {
        return sealGroupFile(
            this,
            this.beginFileEncryption(opts.groupId, opts.location, { alsoFor: opts.alsoFor }),
        );
    }

    /** {@link sealFile} for a writer who is not a member of the Group. */
    sealFileAsOutsider(opts: {
        contextId: string;
        groupId: string;
        location: LocationOrNone;
        alsoFor?: EncryptOptions["alsoFor"];
    }): GroupFileSealer {
        return sealGroupFile(
            this,
            this.beginFileEncryptionAsOutsider(opts.contextId, opts.groupId, opts.location, {
                alsoFor: opts.alsoFor,
            }),
        );
    }

    /** {@link sealFile} without a signature: needs public information only, and no server call. */
    sealFileAnonymously(opts: {
        groupId: string;
        groupPubKey: string;
        location: LocationOrNone;
    }): GroupFileSealer {
        return sealGroupFile(
            this,
            this.beginFileEncryptionAnonymously(opts.groupId, opts.groupPubKey, opts.location),
        );
    }

    /**
     * Opens a member's file for reading as a stream: ciphertext in, plaintext
     * out. With `from`/`length`, fetch `cipherRange` (an HTTP Range request) and
     * pipe only that; `info` then reports `complete: false`.
     *
     * @example
     * const reader = await groupApi.openFile(groupId, ["scan", id(scanId)], envelope, { expectedAuthor });
     * await response.body.pipeThrough(reader.stream).pipeTo(sink);
     * const info = await reader.info;
     */
    async openFile(
        groupId: string,
        location: LocationOrNone,
        envelope: Uint8Array,
        options: DecryptOptions & FileRange,
    ): Promise<GroupFileReader> {
        return openGroupFile(
            this,
            await this.beginFileDecryption(groupId, location, envelope, options),
            options,
        );
    }

    /** {@link openFile} for a file written with {@link sealFileAsOutsider}. */
    async openFileFromOutsider(
        groupId: string,
        location: LocationOrNone,
        envelope: Uint8Array,
        options: DecryptOptions & FileRange,
    ): Promise<GroupFileReader> {
        return openGroupFile(
            this,
            await this.beginFileDecryptionFromOutsider(groupId, location, envelope, options),
            options,
        );
    }

    /** {@link openFile} for a file written with {@link sealFileAnonymously}. */
    async openAnonymousFile(
        groupId: string,
        location: LocationOrNone,
        envelope: Uint8Array,
        range: FileRange = {},
    ): Promise<GroupFileReader> {
        return openGroupFile(
            this,
            await this.beginAnonymousFileDecryption(groupId, location, envelope),
            range,
        );
    }

    /** {@link openFile} for a file shared with the caller through `alsoFor`. */
    async openSharedFile(
        contextId: string,
        location: LocationOrNone,
        envelope: Uint8Array,
        options: DecryptOptions & FileRange,
    ): Promise<GroupFileReader> {
        return openGroupFile(
            this,
            await this.beginSharedFileDecryption(contextId, location, envelope, options),
            options,
        );
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
