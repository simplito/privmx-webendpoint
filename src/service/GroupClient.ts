/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

/**
 * Groups and Spaces named by the entity of your app they serve.
 *
 * Everything here is built on the public methods of {@link GroupApi} and adds
 * no cryptography. A Group is addressed by its **subject** - the path of the
 * entity it belongs to, `["chat-app", "chat", id(chatId)]` - and every value is
 * bound to `subject + place`. The Group's ID follows from the subject, so
 * nothing your server stores decides which Group a device encrypts for.
 *
 * Whoever knows a subject before its Group exists can create that Group first.
 * The ways to create and open a Group differ in who can do that to you:
 *
 * - `create` + `open` - the Group of an entity. When you make the entity's
 *   identifier yourself, at random, right before `create`
 *   (`id(crypto.randomUUID())`), nobody knew the subject before the Group
 *   existed and a plain `open(subject)` is enough.
 *   When the identifier existed earlier or came from somewhere else (a row
 *   your server numbered), another user is caught instead: `create` fails with
 *   `GROUP_ALREADY_EXISTS`, and `open(subject, { createdBy })` fails when the
 *   Group's creator is not the one expected.
 * - `openPinned` - a Group that already exists under an ID of its own. The
 *   first time the ID is taken on trust; from then on `openPinned` on this
 *   device refuses any other Group for that subject. `open(subject)` does not
 *   consult the pin: it opens the Group the subject derives.
 * - `createImmutable` + `open({ immutableMembers })` - a subject you chose and a roster
 *   frozen for good; opening checks that the Group holds exactly the users
 *   you expect.
 * - `createUnbound` + `openUnbound` - no entity at all. The ID is trusted.
 *
 * Never "open it, and create it if it is not there": that is how a Group
 * someone else made under your subject gets used.
 */
import type { GroupApi, DecryptOptions } from "./GroupApi.js";
import type { EventManager } from "../events/EventManager.js";
import {
    createGroupCustomEventSubscription,
    createGroupSubscription,
    type GenericEvent,
} from "../events/subscriptions.js";
import { openGroupFile, sealGroupFile, type FileRange, type GroupFileReader, type GroupFileSealer } from "./fileStreams.js";
import { NO_LOCATION, type Location, type LocationOrNone, type PathSegment } from "./groupPaths.js";
import { GroupErrorCode } from "../native/NativeErrorCodes.js";
import {
    GroupEventSelectorType,
    GroupEventType,
    type ContainerPolicy,
    type DecryptedAnonymousEnvelope,
    type DecryptedEnvelope,
    type DecryptedOutsiderEnvelope,
    type DecryptedSharedEnvelope,
    type DecryptedSpaceEnvelope,
    type DecryptOutcome,
    type Group as GroupState,
    type GroupLogEntry,
    type GroupMemberToAdd,
    type GroupPublicKey,
    type GroupRoleChange,
    type GroupRules,
    type GroupRulesUpdate,
    type PagingList,
    type PagingQuery,
    type SpaceChangedEventData,
    type SpaceDecryptOutcome,
    type SpaceLogEntry,
    type SpaceOrigin,
    type SpaceState,
    type UserWithPubKey,
} from "../Types.js";

/** The path of the entity a Group or Space serves. */
export type Subject = Location;
/** A path under a subject: at least one segment. */
export type Place = readonly [PathSegment, ...PathSegment[]];

/**
 * A check of this layer that failed. `code` is a `GroupErrorCode`, as on the
 * `NativeError` the core throws for its own checks, so one `switch` handles both.
 */
export class GroupClientError extends Error {
    constructor(
        public readonly code: number,
        message: string,
    ) {
        super(message);
        this.name = "GroupClientError";
    }
}

/** A Group named by its subject, with the user who created it. */
export interface GroupBySubject {
    subject: Subject;
    /**
     * Who created that Group. Anyone who knows a subject can make a Group under
     * it first; this is what keeps a value from being wrapped for theirs.
     */
    createdBy: string;
}

/** A further reader of a value: a Group by its subject, a Group by its ID, or one user. */
export type ClientRecipient = GroupBySubject | { group: string } | { user: UserWithPubKey };

/** A recipient of a Space, with its role. */
export type ClientSpaceRecipient = ClientRecipient & { role: "user" | "manager" };

/** How {@link GroupClient.open} checks the Group: by its creator, or by its frozen roster. Not both. */
export type OpenOptions =
    | {
          /**
           * The user who created the entity. The Group's first, signed statement
           * names who created the Group; someone else's fails with
           * `GROUP_WRONG_CREATOR`. For a Space it is the signer of the Space's
           * first statement.
           */
          createdBy?: string;
          immutableMembers?: undefined;
      }
    | {
          /**
           * For a Group made with `createImmutable`: the users it must hold, exactly.
           * Anything else fails with `GROUP_MEMBERSHIP_MISMATCH`.
           */
          immutableMembers: string[];
          createdBy?: undefined;
      };

/**
 * One Group to open with {@link GroupClient.openMany}. `immutableMembers` stands
 * alone; `createdBy` may go with `pinnedGroupId`.
 */
export interface OpenItem {
    subject: Subject;
    createdBy?: string;
    /** As in {@link GroupClient.open} with `immutableMembers`. */
    immutableMembers?: string[];
    /** As in {@link GroupClient.openPinned}. */
    pinnedGroupId?: string;
}

export type OpenOutcome = { ok: true; group: Group } | { ok: false; code: number };

export interface CreateOptions {
    publicMeta?: Uint8Array;
    privateMeta?: Uint8Array;
    rules?: GroupRules;
    visibleTo?: "members" | "context";
}

const EMPTY = new Uint8Array(0);
const DUPLICATE_RESOURCE_ID = 0x6138;

function join(subject: Subject | undefined, place: LocationOrNone | Place): LocationOrNone {
    if (subject === undefined) {
        // No entity: a full location, or NO_LOCATION said out loud.
        return place as LocationOrNone;
    }
    if (place === NO_LOCATION || !Array.isArray(place) || place.length === 0) {
        throw new TypeError("a place under a subject needs at least one segment");
    }
    return [...subject, ...(place as Place)] as unknown as Location;
}

function isImmutable(state: GroupState): boolean {
    return (
        state.users.length === 0 &&
        state.policy.addMembers === "none" &&
        state.policy.removeMembers === "none" &&
        state.policy.updatePolicy === "none"
    );
}

function isDuplicate(e: unknown): boolean {
    const error = e as { name?: string; code?: number };
    return (
        error?.name === "DuplicateResourceIdException" ||
        (typeof error?.code === "number" && (error.code & 0xffff) === DUPLICATE_RESOURCE_ID)
    );
}

// Frees a sequence handle when the step that follows its opening fails.
async function closeOnError<T>(api: GroupApi, handle: number, step: () => Promise<T>): Promise<T> {
    try {
        return await step();
    } catch (e) {
        await api.closeSequence(handle).catch(() => {});
        throw e;
    }
}

function codeOf(e: unknown): number {
    const code = (e as { code?: unknown })?.code;
    return typeof code === "number" && code !== 0 ? code : -1;
}

/** Shared by Group, GroupOutsider, Space and GroupClient: the api, the Context, and how a subject becomes an ID. */
class Core {
    constructor(
        readonly api: GroupApi,
        readonly contextId: string,
        readonly events?: () => Promise<EventManager>,
    ) {}

    async groupIdOf(subject: Subject): Promise<string> {
        return this.api.deriveGroupId(this.contextId, await this.api.encodePath(subject));
    }

    /** The ID of the Group of `subject`, once its signed policy says `createdBy` made it. */
    async groupOfSubject(named: GroupBySubject): Promise<string> {
        if (typeof named.createdBy !== "string" || named.createdBy.length === 0) {
            throw new TypeError("a Group named by its subject is named with the user who created it");
        }
        const groupId = await this.groupIdOf(named.subject);
        const key = await this.api.getGroupPublicKey(this.contextId, groupId);
        if (key.creator !== named.createdBy) {
            throw new GroupClientError(
                GroupErrorCode.GROUP_WRONG_CREATOR,
                `the Group was created by ${key.creator}`,
            );
        }
        return groupId;
    }

    async recipient(recipient: ClientRecipient): Promise<{ group: string } | { user: UserWithPubKey }> {
        if ("subject" in recipient) return { group: await this.groupOfSubject(recipient) };
        return "group" in recipient ? { group: recipient.group } : { user: recipient.user };
    }

    async alsoFor(recipients?: ClientRecipient[]) {
        return { alsoFor: await Promise.all((recipients ?? []).map((r) => this.recipient(r))) };
    }
}

/**
 * A sequence being written, as a stream: data in, packets out. See
 * "Sequences" on {@link GroupApi} for what a reader can rely on, and when.
 *
 * Store or send {@link header} first, then every packet from `readable`, in
 * order: items, and the marks (checkpoints) that let a reader confirm the
 * author. Closing `writable` signs the end; aborting it, or an error such as
 * `ENVELOPE_STALE_EPOCH` after a removal, ends the sequence without that
 * signature.
 *
 * @example
 * const enc = await group.encryptSequence(["doc", id(docId), "ops"]);
 * await backend.saveHeader(enc.header);
 * enc.readable.pipeTo(socketSink);
 * const w = enc.writable.getWriter();
 * await w.write(op);
 * await w.close(); // nothing follows
 */
export class SequenceEncryptor extends TransformStream<Uint8Array, Uint8Array> {
    /** The signed header. A reader needs it before any packet. */
    readonly header: Uint8Array;
    /** Emits a mark now, after the items written so far. */
    readonly checkpoint: () => Promise<void>;

    /** @internal */
    constructor(api: GroupApi, handle: number, header: Uint8Array) {
        let out!: TransformStreamDefaultController<Uint8Array>;
        // One call at a time, so a checkpoint never lands between an item and its mark.
        let queue: Promise<unknown> = Promise.resolve();
        const serial = <T>(step: () => Promise<T>): Promise<T> => {
            const next = queue.then(step);
            queue = next.catch(() => {});
            return next;
        };
        const free = () => api.closeSequence(handle).catch(() => {});
        const failed = async (e: unknown) => {
            await free();
            throw e;
        };
        const transformer: Transformer<Uint8Array, Uint8Array> & { cancel?: () => Promise<void> } = {
            start: (controller) => {
                out = controller;
            },
            transform: (data) =>
                serial(async () => {
                    const { item, mark } = await api.appendToSequence(handle, data);
                    out.enqueue(item);
                    if (mark) out.enqueue(mark);
                }).catch(failed),
            flush: () => serial(async () => out.enqueue(await api.finishSequence(handle))).catch(failed),
            cancel: () => serial(free),
        };
        super(transformer);
        this.header = header;
        this.checkpoint = () => serial(async () => out.enqueue(await api.checkpointSequence(handle)));
    }
}

/** What a {@link SequenceDecryptor} emits, one per packet. */
export type SequenceEvent =
    /** Decrypted, in place, but not yet confirmed to be the author's: another member could have forged it. */
    | { kind: "item"; index: number; data: Uint8Array; missing: number }
    /** Items `0 .. verifiedUpTo-1` are exactly what the author wrote. `closed`: nothing follows. */
    | { kind: "verified"; verifiedUpTo: number; closed: boolean }
    /** A packet that was refused: earlier or repeated, forged, or a mark the items read do not match. */
    | { kind: "rejected"; error: unknown };

/**
 * A sequence being read, as a stream: packets in, {@link SequenceEvent}s out.
 * A bad packet does not end the stream; it comes out as `rejected`.
 *
 * @example
 * const dec = await group.decryptSequence(["doc", id(docId), "ops"], header, { expectedAuthor });
 * socketSource.pipeThrough(dec).pipeTo(new WritableStream({ write: (e) => apply(e) }));
 */
export class SequenceDecryptor extends TransformStream<Uint8Array, SequenceEvent> {
    /** Items below this index are confirmed to be the author's. */
    verifiedUpTo = 0;
    /** The author closed the sequence, and everything read up to the close is confirmed. */
    closed = false;
    /** For a sequence read from a Space: who wrote it, and how they had access. */
    readonly spaceOrigin?: SpaceOrigin;

    /** @internal */
    constructor(api: GroupApi, handle: number, spaceOrigin?: SpaceOrigin) {
        const free = () => api.closeSequence(handle).catch(() => {});
        const transformer: Transformer<Uint8Array, SequenceEvent> & { cancel?: () => Promise<void> } = {
            transform: async (packet, out) => {
                try {
                    if ((await api.peekSequenceItem(packet)).isMark) {
                        const { attestedItems, closed } = await api.verifySequenceMark(handle, packet);
                        this.verifiedUpTo = Math.max(this.verifiedUpTo, attestedItems);
                        this.closed ||= closed;
                        out.enqueue({ kind: "verified", verifiedUpTo: this.verifiedUpTo, closed: this.closed });
                    } else {
                        const { index, data, missing } = await api.readSequenceItem(handle, packet);
                        out.enqueue({ kind: "item", index, data, missing });
                    }
                } catch (error) {
                    out.enqueue({ kind: "rejected", error });
                }
            },
            flush: free,
            cancel: free,
        };
        super(transformer);
        this.spaceOrigin = spaceOrigin;
    }
}

/**
 * One opened Group. It holds the Group's ID and its subject and forwards to
 * {@link GroupApi} with `location = subject + place`. It is a name, not a
 * snapshot: every call works on the Group's current verified state.
 *
 * An unbound Group has no subject: a `place` is then a full location, or `NO_LOCATION`.
 */
export class Group<P = Place> {
    /** @internal */
    constructor(
        private readonly core: Core,
        /** For passing to other modules (a container's grant list). Never read one back in from a server. */
        readonly groupId: string,
        readonly subject: Subject | undefined,
    ) {}

    private at(place: P): LocationOrNone {
        return join(this.subject, place as unknown as Place);
    }

    state(): Promise<GroupState> {
        return this.core.api.getGroup(this.groupId);
    }
    log(query: PagingQuery): Promise<PagingList<GroupLogEntry>> {
        return this.core.api.getGroupLog(this.groupId, query);
    }

    // ── values ──
    async encrypt(place: P, data: Uint8Array, opts: { alsoFor?: ClientRecipient[] } = {}): Promise<Uint8Array> {
        return this.core.api.encrypt(this.groupId, this.at(place), data, await this.core.alsoFor(opts.alsoFor));
    }
    async decrypt(place: P, envelope: Uint8Array, opts: DecryptOptions): Promise<DecryptedEnvelope> {
        return this.core.api.decrypt(this.groupId, this.at(place), envelope, opts);
    }
    /** Never throws for a bad item: each reports on its own. */
    async decryptMany(
        items: ReadonlyArray<{ place: P; envelope: Uint8Array; options: DecryptOptions }>,
    ): Promise<DecryptOutcome[]> {
        return this.core.api.decryptMany(
            this.groupId,
            items.map((item) => ({ location: this.at(item.place), envelope: item.envelope, options: item.options })),
        );
    }
    /** Written to this Group, and signed, by someone who is not in it. */
    async decryptFromOutsider(place: P, envelope: Uint8Array, opts: DecryptOptions): Promise<DecryptedOutsiderEnvelope> {
        return this.core.api.decryptFromOutsider(this.groupId, this.at(place), envelope, opts);
    }
    /** Written to this Group, unsigned. */
    async decryptAnonymous(place: P, envelope: Uint8Array): Promise<DecryptedAnonymousEnvelope> {
        return this.core.api.decryptAnonymous(this.groupId, this.at(place), envelope);
    }

    // ── files, as streams ──
    async encryptFile(place: P, opts: { alsoFor?: ClientRecipient[] } = {}): Promise<GroupFileSealer> {
        const { alsoFor } = await this.core.alsoFor(opts.alsoFor);
        return this.core.api.sealFile({ groupId: this.groupId, location: this.at(place), alsoFor });
    }
    async openFile(place: P, envelope: Uint8Array, opts: DecryptOptions & FileRange): Promise<GroupFileReader> {
        return this.core.api.openFile(this.groupId, this.at(place), envelope, opts);
    }
    async openFileFromOutsider(place: P, envelope: Uint8Array, opts: DecryptOptions & FileRange): Promise<GroupFileReader> {
        return this.core.api.openFileFromOutsider(this.groupId, this.at(place), envelope, opts);
    }
    async openAnonymousFile(place: P, envelope: Uint8Array, range: FileRange = {}): Promise<GroupFileReader> {
        return this.core.api.openAnonymousFile(this.groupId, this.at(place), envelope, range);
    }

    // ── sequences, as streams ──
    /** @param opts.checkpointEvery a mark after this many items (default 64); 0: only on {@link SequenceEncryptor.checkpoint} */
    async encryptSequence(place: P, opts: { checkpointEvery?: number } = {}): Promise<SequenceEncryptor> {
        const api = this.core.api;
        const handle = await api.beginSequence(this.groupId, this.at(place), opts.checkpointEvery);
        return new SequenceEncryptor(api, handle, await closeOnError(api, handle, () => api.getSequenceHeader(handle)));
    }
    async decryptSequence(
        place: P,
        header: Uint8Array,
        opts: DecryptOptions & { resumeFrom?: Uint8Array },
    ): Promise<SequenceDecryptor> {
        const api = this.core.api;
        return new SequenceDecryptor(
            api,
            await api.openSequence(this.groupId, this.at(place), header, opts, opts.resumeFrom),
        );
    }

    // ── membership ──
    add(members: GroupMemberToAdd[]): Promise<void> {
        return this.core.api.addGroupMembers(this.groupId, members);
    }
    /** @returns the new epoch */
    remove(userIds: string[]): Promise<number> {
        return this.core.api.removeGroupMembers(this.groupId, userIds);
    }
    /** For members whose key was replaced and who no longer hold the old one. @returns the new epoch */
    replaceMemberKey(userIds: string[]): Promise<number> {
        return this.core.api.replaceGroupMemberKeys(this.groupId, userIds);
    }
    setRoles(changes: GroupRoleChange[]): Promise<void> {
        return this.core.api.setGroupRoles(this.groupId, changes);
    }
    rotateKey(): Promise<number> {
        return this.core.api.rotateGroupKey(this.groupId);
    }
    updatePublicMeta(meta: Uint8Array, version: number): Promise<void> {
        return this.core.api.updateGroupPublicMeta(this.groupId, meta, version);
    }
    updatePrivateMeta(meta: Uint8Array, version: number): Promise<void> {
        return this.core.api.updateGroupPrivateMeta(this.groupId, meta, version);
    }
    updateRules(rules: GroupRulesUpdate): Promise<void> {
        return this.core.api.updateGroupRules(this.groupId, rules);
    }
    setVisibility(visibleTo: "members" | "context"): Promise<void> {
        return this.core.api.setGroupVisibility(this.groupId, visibleTo);
    }
    delete(): Promise<void> {
        return this.core.api.deleteGroup(this.groupId);
    }

    // ── events ──
    /** Sends `data` to the members on `channel`, sealed under the current key. */
    signal(channel: string, data: Uint8Array, users: string[] = []): Promise<void> {
        return this.core.api.sendCustomEvent(this.groupId, channel, data, users);
    }
    /**
     * `"change"`: the Group was changed or deleted (read it again with `state()`).
     * `"signal"`: a custom event on `channel`.
     *
     * @returns a function that ends the subscription
     */
    async on(
        what: "change" | "signal",
        callback: (event: unknown) => void,
        channel?: string,
    ): Promise<() => Promise<void>> {
        if (!this.core.events) {
            throw new TypeError("this GroupClient was made without an event manager; use connection.groups()");
        }
        const events = await this.core.events();
        const selector = GroupEventSelectorType.GROUP_ID;
        let subscriptions;
        if (what === "signal") {
            if (!channel) throw new TypeError('on("signal") names the channel');
            subscriptions = [
                createGroupCustomEventSubscription({ channel, selector, id: this.groupId, callbacks: [callback] }),
            ];
        } else {
            subscriptions = [GroupEventType.GROUP_UPDATE, GroupEventType.GROUP_DELETE].map((type) =>
                createGroupSubscription({ type, selector, id: this.groupId, callbacks: [callback] }),
            );
        }
        const ids = await events.subscribe(subscriptions);
        return () => events.unsubscribe(ids);
    }
}

/**
 * A Group as seen by someone who is not in it: they can write to it and read
 * nothing, not even what they wrote. From {@link GroupClient.openForWriting}
 * (signed as the caller) or {@link GroupClient.anonymousWriter} (unsigned, from
 * a published key, with no request to the Bridge).
 */
export class GroupOutsider {
    /** @internal */
    constructor(
        private readonly core: Core,
        private readonly groupId: string,
        private readonly subject: Subject,
        private readonly groupPubKey?: string,
    ) {}

    async encrypt(place: Place, data: Uint8Array, opts: { alsoFor?: ClientRecipient[] } = {}): Promise<Uint8Array> {
        const location = join(this.subject, place);
        if (this.groupPubKey !== undefined) {
            if (opts.alsoFor?.length) throw new TypeError("an anonymous writer has no further recipients");
            return this.core.api.encryptAnonymously(this.groupId, this.groupPubKey, location, data);
        }
        return this.core.api.encryptAsOutsider(
            this.core.contextId,
            this.groupId,
            location,
            data,
            await this.core.alsoFor(opts.alsoFor),
        );
    }

    async encryptFile(place: Place, opts: { alsoFor?: ClientRecipient[] } = {}): Promise<GroupFileSealer> {
        const location = join(this.subject, place);
        if (this.groupPubKey !== undefined) {
            if (opts.alsoFor?.length) throw new TypeError("an anonymous writer has no further recipients");
            return this.core.api.sealFileAnonymously({
                groupId: this.groupId,
                groupPubKey: this.groupPubKey,
                location,
            });
        }
        const { alsoFor } = await this.core.alsoFor(opts.alsoFor);
        return this.core.api.sealFileAsOutsider({
            contextId: this.core.contextId,
            groupId: this.groupId,
            location,
            alsoFor,
        });
    }
}

/**
 * One opened Space: one key for several Groups. See "Spaces" on
 * {@link GroupApi} for what it is for and what a stale key means.
 */
export class Space<P = Place> {
    /** @internal */
    constructor(
        private readonly core: Core,
        readonly spaceId: string,
        readonly subject: Subject | undefined,
    ) {}

    private at(place: P): LocationOrNone {
        return join(this.subject, place as unknown as Place);
    }

    state(): Promise<SpaceState> {
        return this.core.api.getSpace(this.spaceId);
    }
    /** Every change of the recipients and the key, verified from the creation. */
    log(query: PagingQuery): Promise<PagingList<SpaceLogEntry>> {
        return this.core.api.getSpaceLog(this.spaceId, query);
    }
    async encrypt(place: P, data: Uint8Array): Promise<Uint8Array> {
        return this.core.api.encryptInSpace(this.spaceId, this.at(place), data);
    }
    /** Check `origin.authorAccess`: the key alone does not say the author still had access. */
    async decrypt(place: P, envelope: Uint8Array, opts: DecryptOptions): Promise<DecryptedSpaceEnvelope> {
        return this.core.api.decryptInSpace(this.spaceId, this.at(place), envelope, opts);
    }
    async decryptMany(
        items: ReadonlyArray<{ place: P; envelope: Uint8Array; options: DecryptOptions }>,
    ): Promise<SpaceDecryptOutcome[]> {
        return this.core.api.decryptManyInSpace(
            this.spaceId,
            items.map((item) => ({ location: this.at(item.place), envelope: item.envelope, options: item.options })),
        );
    }
    async encryptFile(place: P): Promise<GroupFileSealer> {
        return sealGroupFile(this.core.api, this.core.api.beginFileEncryptionInSpace(this.spaceId, this.at(place)));
    }
    async openFile(place: P, envelope: Uint8Array, opts: DecryptOptions & FileRange): Promise<GroupFileReader> {
        const api = this.core.api;
        return openGroupFile(api, await api.beginFileDecryptionInSpace(this.spaceId, this.at(place), envelope, opts), opts);
    }
    async encryptSequence(place: P, opts: { checkpointEvery?: number } = {}): Promise<SequenceEncryptor> {
        const api = this.core.api;
        const handle = await api.beginSequenceInSpace(this.spaceId, this.at(place), opts.checkpointEvery);
        return new SequenceEncryptor(api, handle, await closeOnError(api, handle, () => api.getSequenceHeader(handle)));
    }
    async decryptSequence(
        place: P,
        header: Uint8Array,
        opts: DecryptOptions & { resumeFrom?: Uint8Array },
    ): Promise<SequenceDecryptor> {
        const api = this.core.api;
        const handle = await api.openSequenceInSpace(this.spaceId, this.at(place), header, opts, opts.resumeFrom);
        return new SequenceDecryptor(api, handle, await closeOnError(api, handle, () => api.getSpaceSequenceOrigin(handle)));
    }

    // ── recipients: managers only ──
    async addRecipients(recipients: ClientSpaceRecipient[]): Promise<void> {
        return this.core.api.addSpaceRecipients(this.spaceId, await spaceRecipients(this.core, recipients));
    }
    /** Makes a new key the removed do not get. @returns the new key version */
    async removeRecipients(
        recipients: Array<{ subject: Subject } | { group: string } | { userId: string }>,
    ): Promise<number> {
        return this.core.api.removeSpaceRecipients(
            this.spaceId,
            await Promise.all(
                recipients.map(async (r) => ("subject" in r ? { group: await this.core.groupIdOf(r.subject) } : r)),
            ),
        );
    }
    rotateKey(): Promise<number> {
        return this.core.api.rotateSpaceKey(this.spaceId);
    }
    /**
     * Calls back when this Space changes or is deleted (`event.data.changeKind`
     * says which). The event is a hint from the Bridge; `state()` after it reads
     * and verifies. @returns a function that stops listening
     */
    async onChange(callback: (event: GenericEvent<SpaceChangedEventData>) => void): Promise<() => Promise<void>> {
        if (!this.core.events) {
            throw new TypeError("this GroupClient was made without an event manager; use connection.groups()");
        }
        const events = await this.core.events();
        const ids = await events.subscribe(
            ([GroupEventType.SPACE_UPDATE, GroupEventType.SPACE_DELETE] as const).map((type) =>
                createGroupSubscription({
                    type,
                    selector: GroupEventSelectorType.SPACE_ID,
                    id: this.spaceId,
                    callbacks: [callback],
                }),
            ),
        );
        return () => events.unsubscribe(ids);
    }
    updatePublicMeta(meta: Uint8Array, version: number): Promise<void> {
        return this.core.api.updateSpacePublicMeta(this.spaceId, meta, version);
    }
    updatePrivateMeta(meta: Uint8Array, version: number): Promise<void> {
        return this.core.api.updateSpacePrivateMeta(this.spaceId, meta, version);
    }
    delete(): Promise<void> {
        return this.core.api.deleteSpace(this.spaceId);
    }
}

async function spaceRecipients(core: Core, recipients: ClientSpaceRecipient[]) {
    return Promise.all(recipients.map(async (r) => ({ ...(await core.recipient(r)), role: r.role })));
}

/** The Groups and Spaces of one Context, addressed by subject. From `connection.groups(contextId)`. */
export class GroupClient {
    private readonly core: Core;

    constructor(api: GroupApi, contextId: string, events?: () => Promise<EventManager>) {
        this.core = new Core(api, contextId, events);
    }

    /** The ID of the Group `subject` names. */
    groupIdOf(subject: Subject): Promise<string> {
        return this.core.groupIdOf(subject);
    }

    private async make(
        subject: Subject | undefined,
        members: GroupMemberToAdd[],
        opts: CreateOptions,
        policy?: ContainerPolicy,
    ): Promise<string> {
        const users: UserWithPubKey[] = [];
        const managers: UserWithPubKey[] = [];
        for (const member of members) {
            if (member.role !== "user" && member.role !== "manager") {
                throw new TypeError('a member\'s role is "user" or "manager"');
            }
            (member.role === "manager" ? managers : users).push(member.user);
        }
        const rules: ContainerPolicy | undefined =
            policy ??
            (opts.rules && {
                addMembers: opts.rules.addMembers,
                removeMembers: opts.rules.removeMembers,
                update: opts.rules.updateMeta,
            });
        try {
            return await this.core.api.createGroup(
                this.core.contextId,
                users,
                managers,
                opts.publicMeta ?? EMPTY,
                opts.privateMeta ?? EMPTY,
                rules,
                {
                    idSeed: subject && (await this.core.api.encodePath(subject)),
                    visibleTo: opts.visibleTo ?? "members",
                },
            );
        } catch (e) {
            if (isDuplicate(e)) {
                // The subject has a Group already. If you did not make it, someone else did.
                throw new GroupClientError(
                    GroupErrorCode.GROUP_ALREADY_EXISTS,
                    "a Group already exists under this subject",
                );
            }
            throw e;
        }
    }

    /**
     * Creates the Group of the entity `subject` names. Call it once per entity.
     *
     * For a new entity, make its identifier at random right before the call;
     * nobody could have taken the subject first, and `open(subject)` is enough:
     *
     * ```ts
     * const chatId = crypto.randomUUID(); // what your row gets
     * const chat = await groups.create(["chat-app", "chat", id(chatId)], members);
     * ```
     *
     * For an identifier that was known before this call (your server numbered
     * the row, a slug, a user's name), always open with `createdBy`: whoever
     * knew the subject could have created a Group under it first.
     */
    async create(subject: Subject, members: GroupMemberToAdd[], opts: CreateOptions = {}): Promise<Group> {
        return new Group(this.core, await this.make(subject, members, opts), subject);
    }

    private async check(item: OpenItem, state: GroupState): Promise<void> {
        if (item.immutableMembers && (item.createdBy !== undefined || item.pinnedGroupId !== undefined)) {
            throw new TypeError("immutableMembers stands alone: not with createdBy or pinnedGroupId");
        }
        if (state.contextId !== this.core.contextId) {
            throw new TypeError("a Group of another Context");
        }
        if (item.immutableMembers) {
            const held = [...state.managers].sort().join("\0");
            const expected = [...new Set(item.immutableMembers)].sort().join("\0");
            if (!isImmutable(state) || held !== expected) {
                throw new GroupClientError(
                    GroupErrorCode.GROUP_MEMBERSHIP_MISMATCH,
                    "not the immutable Group of exactly the expected users",
                );
            }
            return;
        }
        if (isImmutable(state) && !item.pinnedGroupId) {
            // Anyone can make an immutable Group under a subject they chose; it opens only for someone who names its members.
            throw new GroupClientError(
                GroupErrorCode.GROUP_MEMBERSHIP_MISMATCH,
                "an immutable Group: open it with immutableMembers",
            );
        }
        if (item.createdBy !== undefined) {
            // The signer of the first statement, verified with the rest of the history - not the Bridge's `creator`.
            const first = await this.core.api.getGroupLog(state.groupId, { skip: 0, limit: 1, sortOrder: "asc" });
            const author = first.readItems[0]?.author;
            if (author !== item.createdBy) {
                throw new GroupClientError(
                    GroupErrorCode.GROUP_WRONG_CREATOR,
                    `the Group was created by ${author ?? "nobody known"}`,
                );
            }
        }
        if (item.pinnedGroupId) {
            await this.core.api.pinGroupToSubject(this.core.contextId, item.subject, item.pinnedGroupId);
        }
    }

    /**
     * Opens and verifies the Group of `subject`.
     *
     * A Group made by `createImmutable` opens only with `immutableMembers`, and then
     * only when it holds exactly those users; without the option it is refused
     * (`GROUP_MEMBERSHIP_MISMATCH`), so forgetting it cannot open someone
     * else's roster.
     */
    async open(subject: Subject, opts: OpenOptions = {}): Promise<Group> {
        if (opts.createdBy !== undefined && opts.immutableMembers !== undefined) {
            throw new TypeError("open checks the creator or the immutable roster, not both");
        }
        const groupId = await this.core.groupIdOf(subject);
        await this.check(
            { subject, createdBy: opts.createdBy, immutableMembers: opts.immutableMembers },
            await this.core.api.getGroup(groupId),
        );
        return new Group(this.core, groupId, subject);
    }

    /**
     * Opens a Group that exists under an ID of its own and ties it to
     * `subject` on this device. Fails with `GROUP_SUBJECT_REBOUND` when the
     * device knows the subject under another Group.
     *
     * For Groups made before subjects (`GroupApi.createGroup`, a random ID kept
     * in your database). The first open on a device takes the ID on trust;
     * `createdBy` checks the Group's signed creator then too, so another user
     * cannot hand over a Group of their own.
     *
     * Only `openPinned` (and `openMany` with `pinnedGroupId`) consults the pin;
     * `open(subject)` opens the Group the subject derives, pinned or not.
     */
    async openPinned(subject: Subject, groupId: string, opts: { createdBy?: string } = {}): Promise<Group> {
        await this.check(
            { subject, pinnedGroupId: groupId, createdBy: opts.createdBy },
            await this.core.api.getGroup(groupId),
        );
        return new Group(this.core, groupId, subject);
    }

    /**
     * Creates a Group under a subject you chose, with exactly `users` (all of
     * them managers: nobody is more than another) and a roster, roles and
     * rules that can never change. Members can still rotate the key.
     */
    async createImmutable(subject: Subject, users: UserWithPubKey[], opts: Omit<CreateOptions, "rules"> = {}): Promise<Group> {
        const members = users.map((user) => ({ user, role: "manager" }));
        const frozen: ContainerPolicy = { addMembers: "none", removeMembers: "none", updatePolicy: "none" };
        return new Group(this.core, await this.make(subject, members, opts, frozen), subject);
    }

    /**
     * Opens many Groups with one read of their states. One result per item,
     * in order; a Group that failed reports its own code, and an item with
     * `immutableMembers` next to `createdBy` or `pinnedGroupId` fails on its own.
     */
    async openMany(items: OpenItem[]): Promise<OpenOutcome[]> {
        const groupIds = await Promise.all(
            items.map((item) => item.pinnedGroupId ?? this.core.groupIdOf(item.subject)),
        );
        const states = await this.core.api.getGroups(groupIds);
        return Promise.all(
            items.map(async (item, i): Promise<OpenOutcome> => {
                const state = states[i];
                if (!state) return { ok: false, code: -1 };
                if (!("group" in state)) return { ok: false, code: state.code };
                try {
                    await this.check(item, state.group);
                    return { ok: true, group: new Group(this.core, groupIds[i], item.subject) };
                } catch (e) {
                    return { ok: false, code: codeOf(e) };
                }
            }),
        );
    }

    /**
     * Creates a Group that belongs to no entity, under a random ID
     * (`group.groupId`), which your app stores. Whoever tells a device which ID
     * to open chooses the Group it encrypts for: prefer `openPinned` when the
     * Group has an entity after all.
     */
    async createUnbound(members: GroupMemberToAdd[], opts: CreateOptions = {}): Promise<Group<LocationOrNone>> {
        return new Group<LocationOrNone>(this.core, await this.make(undefined, members, opts), undefined);
    }

    /** Opens a Group by its ID, as it is. No check of who created it or which entity it serves. */
    async openUnbound(groupId: string): Promise<Group<LocationOrNone>> {
        if ((await this.core.api.getGroup(groupId)).contextId !== this.core.contextId) {
            throw new TypeError("a Group of another Context");
        }
        return new Group<LocationOrNone>(this.core, groupId, undefined);
    }

    // ── Spaces ──

    /** Creates the Space of an entity. Call it once; open with `createdBy`. */
    async createSpaceFor(
        subject: Subject,
        recipients: ClientSpaceRecipient[],
        opts: { publicMeta?: Uint8Array; privateMeta?: Uint8Array } = {},
    ): Promise<Space> {
        try {
            const spaceId = await this.core.api.createSpace(
                this.core.contextId,
                await spaceRecipients(this.core, recipients),
                opts.publicMeta ?? EMPTY,
                opts.privateMeta ?? EMPTY,
                await this.core.api.encodePath(subject),
            );
            return new Space(this.core, spaceId, subject);
        } catch (e) {
            if (isDuplicate(e)) {
                throw new GroupClientError(
                    GroupErrorCode.GROUP_ALREADY_EXISTS,
                    "a Space already exists under this subject",
                );
            }
            throw e;
        }
    }

    async openSpace(subject: Subject, opts: { createdBy?: string } = {}): Promise<Space> {
        const spaceId = await this.core.api.deriveSpaceId(
            this.core.contextId,
            await this.core.api.encodePath(subject),
        );
        const state = await this.core.api.getSpace(spaceId);
        if (opts.createdBy !== undefined && state.createdBy !== opts.createdBy) {
            throw new GroupClientError(
                GroupErrorCode.GROUP_WRONG_CREATOR,
                `the Space was created by ${state.createdBy}`,
            );
        }
        return new Space(this.core, spaceId, subject);
    }

    async createUnboundSpace(
        recipients: ClientSpaceRecipient[],
        opts: { publicMeta?: Uint8Array; privateMeta?: Uint8Array } = {},
    ): Promise<Space<LocationOrNone>> {
        const spaceId = await this.core.api.createSpace(
            this.core.contextId,
            await spaceRecipients(this.core, recipients),
            opts.publicMeta ?? EMPTY,
            opts.privateMeta ?? EMPTY,
        );
        return new Space<LocationOrNone>(this.core, spaceId, undefined);
    }

    async openUnboundSpace(spaceId: string): Promise<Space<LocationOrNone>> {
        if ((await this.core.api.getSpace(spaceId)).contextId !== this.core.contextId) {
            throw new TypeError("a Space of another Context");
        }
        return new Space<LocationOrNone>(this.core, spaceId, undefined);
    }

    // ── from outside a Group ──

    /**
     * For an account that is not in the Group: a writer that signs as the
     * caller. The Group is named with its creator - anyone who knows a subject
     * can make a Group under it first, and you would write to theirs.
     */
    async openForWriting(group: GroupBySubject): Promise<GroupOutsider> {
        return new GroupOutsider(this.core, await this.core.groupOfSubject(group), group.subject);
    }

    /**
     * The verified key of a Group, to publish for writers with no account
     * ({@link anonymousWriter}). A non-member may call it when the Group is
     * visible to the Context.
     */
    async publicKeyOf(group: GroupBySubject): Promise<GroupPublicKey> {
        return this.core.api.getGroupPublicKey(this.core.contextId, await this.core.groupOfSubject(group));
    }

    /**
     * A writer with no account, from a key the Group published. Makes no
     * request; its envelopes are unsigned and read with `decryptAnonymous`.
     *
     * @param subject the subject of the Group the key belongs to; a key of
     *   another Group fails with `ENVELOPE_WRONG_GROUP`
     */
    async anonymousWriter(key: GroupPublicKey, subject: Subject): Promise<GroupOutsider> {
        if ((await this.core.groupIdOf(subject)) !== key.groupId) {
            throw new GroupClientError(GroupErrorCode.ENVELOPE_WRONG_GROUP, "the key is not of the Group of this subject");
        }
        return new GroupOutsider(this.core, key.groupId, subject, key.pubKey);
    }

    private async requireHome(author: Subject, envelope: Uint8Array, createdBy: string | null): Promise<void> {
        if (createdBy === undefined) {
            throw new TypeError("a shared read says who created the author's Group (homeCreatedBy), or null");
        }
        // The envelope says which Group it was written in; where it was found says which Group that should be.
        const homeId = await this.core.groupIdOf(author);
        if ((await this.core.api.peekEnvelope(envelope)).groupId !== homeId) {
            throw new GroupClientError(
                GroupErrorCode.ENVELOPE_WRONG_GROUP,
                "not written in the Group of the author's subject",
            );
        }
        if (createdBy !== null) {
            await this.core.groupOfSubject({ subject: author, createdBy });
        }
    }

    /**
     * Reads what was written in another Group and shared with you through
     * `alsoFor`. The value sits at `authorSubject + place` and must say it was
     * written in the Group of `authorSubject`; `senderIsMember` in the result
     * is then about that Group.
     *
     * `homeCreatedBy` is who created that Group, checked against its signed
     * policy: without it, "a member of the Group under this subject" could be
     * a member of a Group somebody else put there. Pass `null` only when you
     * do not rely on `senderIsMember` (the author is checked either way).
     */
    async decryptShared(
        authorSubject: Subject,
        place: Place,
        envelope: Uint8Array,
        opts: DecryptOptions & { homeCreatedBy: string | null },
    ): Promise<DecryptedSharedEnvelope> {
        await this.requireHome(authorSubject, envelope, opts.homeCreatedBy);
        return this.core.api.decryptShared(this.core.contextId, join(authorSubject, place), envelope, opts);
    }

    async openSharedFile(
        authorSubject: Subject,
        place: Place,
        envelope: Uint8Array,
        opts: DecryptOptions & FileRange & { homeCreatedBy: string | null },
    ): Promise<GroupFileReader> {
        await this.requireHome(authorSubject, envelope, opts.homeCreatedBy);
        return this.core.api.openSharedFile(this.core.contextId, join(authorSubject, place), envelope, opts);
    }
}
