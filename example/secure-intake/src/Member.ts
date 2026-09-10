/**
 * One member of the receiving team. Everything it does with PrivMX goes through
 * GroupApi - there is no Thread, Store, Inbox, Kvdb or Search anywhere in this
 * demo. Deliberately React-free; the pane subscribes to it.
 */
import {
    Endpoint,
    Types,
    createGroupCustomEventSubscription,
    deserializeObject,
    strToUint8,
    uint8ToStr,
    type Connection,
    type GroupApi,
} from "@simplito/privmx-webendpoint";
import { registerUser } from "./server";
import * as store from "./store";
import { log } from "./log";

/** publicMeta tag that identifies this demo's Group. */
const ROOM = "privmx-secure-intake-demo";
const PAGE = { skip: 0, limit: 100, sortOrder: "desc" } as const;
/** Channel for the "something arrived" pointers members send each other. */
const CHANNEL = "submissions";
/** Ranged reads ask the store for this much at a time. */
export const READ_BLOCK = 1 << 18; // 256 KiB

// Shipped by the SDK, so the demo does not reinvent them.
const enc = strToUint8;
const dec = uint8ToStr;
const json = (b: Uint8Array): any => {
    try {
        return deserializeObject(b);
    } catch {
        return {};
    }
};

/** What a member could establish about one submission. */
export interface Opened {
    text: string;
    fileName?: string;
    fileSize?: number;
    /** What `decrypt` reported - this, not a non-empty author, is what to branch on. */
    anonymous: boolean;
    author: string;
    /** Set instead of the rest when the envelope would not open for this member. */
    error?: string;
}

/** Result of a ranged, seeked read - the numbers the demo is actually about. */
export interface SliceRead {
    text: string;
    from: number;
    fetched: number;
    total: number;
    complete: boolean;
}

export class Member {
    connection!: Connection;
    api!: GroupApi;
    contextId!: string;
    me!: Types.UserWithPubKey;

    groupId = "";
    groupPubKey = "";
    epoch = 0;

    status = "offline";
    dot: "" | "on" | "warn" = "";
    hintText = "";
    /** Decrypted submissions, by store id. One that would not open keeps its error. */
    opened = new Map<string, Opened>();

    private subscriptionIds: string[] = [];
    private unwatchStore: (() => void) | undefined;

    private listeners = new Set<() => void>();
    private version = 0;

    constructor(readonly userId: string) {}

    subscribe = (notify: () => void): (() => void) => {
        this.listeners.add(notify);
        return () => {
            this.listeners.delete(notify);
        };
    };

    getVersion = (): number => this.version;

    private emit(): void {
        this.version++;
        this.listeners.forEach((notify) => notify());
    }

    hint(text: string): void {
        this.hintText = text;
        this.emit();
    }

    private setStatus(text: string, dot: "" | "on" | "warn"): void {
        this.status = text;
        this.dot = dot;
        this.emit();
    }

    // --- connection --------------------------------------------------------

    /** Generates (or reuses) this user's key and connects. GroupApi is the only API created. */
    async connect(): Promise<void> {
        const crypto = await Endpoint.createCryptoApi();
        const storageKey = `privmx-intake-key:${this.userId}`;
        const privateKey = localStorage.getItem(storageKey) ?? (await crypto.generatePrivateKey());
        localStorage.setItem(storageKey, privateKey);
        const pubKey = await crypto.derivePublicKey(privateKey);
        const { bridgeUrl, solutionId, contextId } = await registerUser({
            userId: this.userId,
            pubKey,
        });

        this.contextId = contextId;
        this.me = { userId: this.userId, pubKey };
        this.connection = await Endpoint.connect(privateKey, solutionId, bridgeUrl);
        this.api = await Endpoint.createGroupApi(this.connection);

        // Watch the store from the moment we are connected, not from the moment
        // we join: an envelope names its own Group, so a non-member can try to
        // open one and be refused. That refusal is the point - what protects a
        // submission is the encryption, not the store's willingness to list it.
        this.unwatchStore ??= store.subscribe(() => void this.openNew());
        await this.openNew();

        this.setStatus("connected", "warn");
        log(this.userId, `connected (public key ${pubKey.slice(0, 10)}…)`);
    }


    // --- the Group ---------------------------------------------------------

    /**
     * Finds this demo's Group - `listGroups` is a GroupApi call, so even the
     * lookup needs no container. A listing page deliberately carries no
     * metadata (nothing on it was decrypted or verified), so the tag has to come
     * from `getGroup`; newest first, and the first match wins.
     */
    async findGroup(): Promise<boolean> {
        const page = await this.api.listGroups(this.contextId, PAGE);
        for (const summary of page.readItems) {
            try {
                const group = await this.api.getGroup(summary.groupId);
                if (json(group.publicMeta).room !== ROOM) continue;
                this.groupId = group.groupId;
                await this.enter();
                return true;
            } catch {
                continue; // listed but not openable with this key - not ours
            }
        }
        this.setStatus("no Group to receive for", "warn");
        return false;
    }

    /** Creates the Group that receives everything sent to this intake box. */
    async createGroup(): Promise<void> {
        this.groupId = await this.api.createGroup(
            this.contextId,
            [this.me],
            [this.me],
            enc(JSON.stringify({ room: ROOM })),
            enc(JSON.stringify({ name: "Intake recipients" })),
        );
        log(this.userId, `created group ${this.groupId}`);
        await this.enter();
    }

    /** Reads the Group, opens whatever is already in the store, and starts listening. */
    private async enter(): Promise<void> {
        await this.refreshGroup();
        // Joining changes the answer for everything already refused.
        this.opened.clear();
        await this.openNew();

        if (!this.subscriptionIds.length) {
            // Member-to-member pointers travel through PrivMX, sealed with the
            // Group key. The anonymous submissions cannot come this way - sending
            // requires membership - so the store announces those itself.
            const events = await this.connection.getEventManager();
            this.subscriptionIds = await events.subscribe([
                createGroupCustomEventSubscription({
                    channel: CHANNEL,
                    selector: Types.GroupEventSelectorType.GROUP_ID,
                    id: this.groupId,
                    callbacks: [
                        (e) => {
                            const d = e.data;
                            if (d.statusCode !== 0) return;
                            const id = json(d.payload).id;
                            log(
                                this.userId,
                                `pointer to ${String(id).slice(0, 8)}… over PrivMX, signed by ${d.authorPubKey.slice(0, 10)}…`,
                            );
                            void this.open(id);
                        },
                    ],
                }),
            ]);
        }
        this.setStatus("receiving", "on");
    }

    async refreshGroup(): Promise<void> {
        const group = await this.api.getGroup(this.groupId);
        this.groupPubKey = group.groupPubKey;
        this.epoch = group.keyVersion;
        this.emit();
    }

    // --- submissions -------------------------------------------------------------

    /** Opens everything in the store this member has not opened yet. */
    private async openNew(): Promise<void> {
        for (const item of store.list()) {
            if (!this.opened.has(item.id)) await this.open(item.id);
        }
    }

    /**
     * Opens one submission. `decrypt` reports whether the envelope was sealed by a
     * member or anonymously, and that - not a non-empty author - is what decides
     * whether the author means anything.
     */
    async open(id: string, force = false): Promise<Opened | undefined> {
        const item = store.get(id);
        if (!item || (this.opened.has(id) && !force)) return this.opened.get(id);
        try {
            const envelope = await this.api.decrypt(item.note);
            const body = json(envelope.data);
            const anonymous = envelope.type === Types.EnvelopeType.ENVELOPE_ANONYMOUS;
            const result: Opened = {
                text: body.text ?? "",
                fileName: body.fileName,
                fileSize: item.fileCipher?.length,
                anonymous,
                author: anonymous ? "" : envelope.authorPubKey,
            };
            this.opened.set(id, result);
            this.emit();
            return result;
        } catch (e) {
            const result: Opened = {
                text: "",
                anonymous: false,
                author: "",
                // Native errors arrive with a trailing newline; it ends up
                // splitting any line this message is rendered into.
                error: (e as Error).message.trim(),
            };
            this.opened.set(id, result);
            this.emit();
            return result;
        }
    }

    /** Seals a comment as this member - signed, so readers learn who wrote it. */
    async comment(parent: string, text: string): Promise<void> {
        const note = await this.api.encrypt(this.groupId, enc(JSON.stringify({ text })));
        const id = store.newId();
        store.put({ id, note, parent, at: Date.now() });
        // The pointer goes through PrivMX; the bytes stay in the store.
        await this.api.sendCustomEvent(this.groupId, CHANNEL, enc(JSON.stringify({ id })));
        this.hint("comment sealed, pointer sent over PrivMX");
    }

    /**
     * Reads `length` plaintext bytes starting at `from`, fetching only the
     * ciphertext that carries them: `openFile` maps the plaintext position onto
     * a ciphertext offset, and everything before it is never asked for.
     */
    async readSlice(id: string, from: number, length: number): Promise<SliceRead> {
        const item = store.get(id);
        if (!item?.fileEnvelope || !item.fileCipher) throw new Error("this submission carries no file");
        const total = item.fileCipher.length;

        const reader = await this.api.openFile(item.fileEnvelope, { from, length });
        // The whole saving is here: one block starting at the offset the seek
        // reported, and nothing before it.
        const block = store.range(id, reader.ciphertextOffset, READ_BLOCK);
        const plain = await new Response(
            new Blob([block as BlobPart]).stream().pipeThrough(reader.stream),
        ).arrayBuffer();

        // Seeking gives up the truncation guarantee, so `complete` is false here.
        const info = await reader.info;
        log(
            this.userId,
            `read ${length} B at ${from}: skipped ${reader.ciphertextOffset} B of ciphertext, ` +
                `fetched ${block.length} of ${total} B`,
        );
        return {
            text: dec(new Uint8Array(plain)),
            from,
            fetched: block.length,
            total,
            complete: info.complete,
        };
    }

    /**
     * Reads a whole sealed file back, in order and without seeking - the only
     * way `info.complete` can answer whether all of it arrived.
     */
    async readWhole(id: string): Promise<{ blob: Blob; name: string; complete: boolean }> {
        const item = store.get(id);
        if (!item?.fileEnvelope || !item.fileCipher) throw new Error("this submission carries no file");
        const reader = await this.api.openFile(item.fileEnvelope);

        // Ranged pulls out of the store, straight through the decryptor: the
        // store only hands over a block when the reader is ready for it.
        let at = 0;
        const ciphertext = new ReadableStream<Uint8Array>({
            pull(controller) {
                const block = store.range(id, at, READ_BLOCK);
                at += block.length;
                if (block.length) controller.enqueue(block);
                else controller.close();
            },
        });
        const blob = await new Response(ciphertext.pipeThrough(reader.stream)).blob();

        const info = await reader.info;
        const name = this.opened.get(id)?.fileName ?? "submission.bin";
        log(this.userId, `read all of ${name}: ${blob.size} B, complete=${info.complete}`);
        return { blob, name, complete: info.complete };
    }
}
