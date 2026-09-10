/**
 * One side of the split screen: an identity, its connection and the room
 * handles that go with it. Deliberately free of React - it is the SDK model,
 * and the UI subscribes to it (see `usePeer` in PeerPane).
 */
import {
    Endpoint,
    Types,
    createThreadSubscription,
    deserializeObject,
    groupGrant,
    strToUint8,
    uint8ToStr,
    type Connection,
    type GroupApi,
    type ThreadApi,
    type SearchApi,
} from "@simplito/privmx-webendpoint";
import { registerUser } from "./server";
import { guard, log } from "./log";

/** publicMeta tag that identifies this demo's room. */
const ROOM = "privmx-group-chat-demo";
const PAGE = { skip: 0, limit: 100, sortOrder: "desc" } as const;
/** How long the indexing transaction stays open after the last message. */
const COMMIT_DEBOUNCE_MS = 1500;

// The SDK ships these, so the demo does not reinvent them.
const enc = strToUint8;
const dec = uint8ToStr;
const json = (b: Uint8Array): any => {
    try {
        return deserializeObject(b);
    } catch {
        return {};
    }
};

export interface ChatMessage {
    id: string;
    author: string;
    text: string;
    ts: number;
    locked: boolean;
    hit: boolean;
}

export class Peer {
    connection!: Connection;
    groupApi!: GroupApi;
    threadApi!: ThreadApi;
    searchApi!: SearchApi;
    contextId!: string;
    me!: Types.UserWithPubKey;

    groupId = "";
    threadId = "";
    indexId = "";
    indexHandle = 0;

    /** Everything the pane renders. Changing any of it must go through `emit()`. */
    status = "offline";
    dot: "" | "on" | "warn" = "";
    enabled = false;
    hintText = "";

    private txOpen = false;
    private txTimer: ReturnType<typeof setTimeout> | undefined;
    /** Index writes are serialised: begin/add/commit share one SQLite handle. */
    private indexOps: Promise<void> = Promise.resolve();

    private messages = new Map<string, { author: string; text: string; ts: number; locked: boolean }>();
    private hits: Set<string> | null = null;
    private subscribed = false;

    private listeners = new Set<() => void>();
    private version = 0;

    constructor(readonly userId: string) {}

    // --- external store, for useSyncExternalStore -------------------------

    subscribe = (notify: () => void): (() => void) => {
        this.listeners.add(notify);
        return () => {
            this.listeners.delete(notify);
        };
    };

    /** A counter, not a snapshot object: the pane reads the fields directly. */
    getVersion = (): number => this.version;

    private emit(): void {
        this.version++;
        this.listeners.forEach((notify) => notify());
    }

    /** Messages oldest-first, with the current search hits marked. */
    get chat(): ChatMessage[] {
        return [...this.messages.entries()]
            .map(([id, m]) => ({ id, ...m, hit: this.hits?.has(id) ?? false }))
            .sort((a, b) => a.ts - b.ts);
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

    private setEnabled(on: boolean): void {
        this.enabled = on;
        this.emit();
    }

    // --- connection and room ----------------------------------------------

    /**
     * Generates (or reuses) this user's key and connects. The key is kept per
     * user id: the Group and its containers are encrypted to the public keys
     * known at the time, so re-registering the same user id under a fresh key
     * would lock them out of their own room.
     */
    async connect(): Promise<void> {
        const crypto = await Endpoint.createCryptoApi();
        const storageKey = `privmx-demo-key:${this.userId}`;
        let privateKey = localStorage.getItem(storageKey);
        if (!privateKey) {
            privateKey = await crypto.generatePrivateKey();
            localStorage.setItem(storageKey, privateKey);
        }
        const pubKey = await crypto.derivePublicKey(privateKey);
        const { bridgeUrl, solutionId, contextId } = await registerUser({ userId: this.userId, pubKey });

        this.contextId = contextId;
        this.me = { userId: this.userId, pubKey };
        this.connection = await Endpoint.connect(privateKey, solutionId, bridgeUrl);
        this.groupApi = await Endpoint.createGroupApi(this.connection);
        this.threadApi = await Endpoint.createThreadApi(this.connection);
        this.searchApi = await Endpoint.createSearchApi(this.connection);
        this.setStatus("connected", "warn");
        log(this.userId, `connected (public key ${pubKey.slice(0, 10)}…)`);
    }

    /**
     * Finds this demo's room. Only Threads the user can reach are listed, so a
     * user outside the Group sees nothing - that is what keeps Bob locked out
     * until Alice adds him. Returns false when there is no room for this user.
     */
    async openRoom(): Promise<boolean> {
        const threads = await this.threadApi.listThreads(this.contextId, PAGE);
        const rooms = threads.readItems.filter((t) => json(t.publicMeta).room === ROOM);
        // Listed but undecryptable: the Bridge matches on user *id*, while keys are wrapped to
        // the public key that id had at the time. A user who lost their key must skip it.
        const room = rooms.find((t) => t.statusCode === 0);
        if (rooms.length && !room) {
            log(this.userId, `${rooms.length} room(s) found but none decryptable with this key - starting over`);
        }
        if (!room) {
            this.setStatus("no access to the room", "warn");
            this.setEnabled(false);
            return false;
        }
        this.threadId = room.threadId;
        this.indexId = json(room.publicMeta).indexId;
        this.groupId = room.groups[0]?.groupId ?? "";
        await this.enterRoom();
        log(this.userId, `joined room ${this.threadId}`);
        return true;
    }

    /** Alice-only: creates the Group and the two containers granted to it. */
    async createRoom(): Promise<void> {
        // The Group starts with its creator only; Bob is added later, on camera.
        this.groupId = await this.groupApi.createGroup(
            this.contextId,
            [this.me],
            [this.me],
            enc(JSON.stringify({ room: ROOM })),
            enc(JSON.stringify({ name: "Chat members" })),
        );
        const group = await this.groupApi.getGroup(this.groupId);
        log(this.userId, `created group ${this.groupId} (epoch ${group.keyVersion})`);

        // The Index is deliberately left without forwardSecrecy: its content is one long-lived SQLite file, and
        // re-keying it under an open handle leaves that handle reading stale content. The Thread carries the
        // messages, so that is where cutting a removed member off actually matters.
        const policy: Types.ContainerPolicy = { forwardSecrecy: "yes" };

        // The Group is a *manager* of the Index: every member indexes the messages they send.
        this.indexId = await this.searchApi.createSearchIndex(
            this.contextId,
            [this.me],
            [this.me],
            enc(JSON.stringify({ room: ROOM })),
            enc(JSON.stringify({ title: "Chat index" })),
            Types.IndexMode.WITH_CONTENT,
            undefined,
            [groupGrant(group, "manager")],
        );
        // publicMeta is NOT encrypted - it is how the other side finds the room.
        this.threadId = await this.threadApi.createThread(
            this.contextId,
            [this.me],
            [this.me],
            enc(JSON.stringify({ room: ROOM, indexId: this.indexId })),
            enc(JSON.stringify({ title: "Group chat" })),
            policy,
            [groupGrant(group, "user")],
        );
        log(this.userId, `created index ${this.indexId} and thread ${this.threadId}, both granted to the group`);
        await this.enterRoom();
    }

    /** Opens the index, loads history and subscribes to new messages. */
    private async enterRoom(): Promise<void> {
        // Re-entering (removed, then added back) must close the previous handle first: two open handles on one
        // encrypted SQLite file leave the index empty for whoever holds the older one.
        if (this.indexHandle) {
            // Anything still in an open transaction is lost with the handle.
            await this.flushIndex();
            await this.searchApi.closeSearchIndex(this.indexHandle);
            this.indexHandle = 0;
        }
        this.indexHandle = await this.searchApi.openSearchIndex(this.indexId);

        const history = await this.threadApi.listMessages(this.threadId, PAGE);
        history.readItems.forEach((m) => this.addMessage(m));

        // Subscribe once per peer: re-entering the room after being removed and
        // added back must not register a second callback for the same events.
        if (!this.subscribed) {
            const events = await this.connection.getEventManager();
            await events.subscribe([
                createThreadSubscription({
                    type: Types.ThreadEventType.MESSAGE_CREATE,
                    selector: Types.ThreadEventSelectorType.THREAD_ID,
                    id: this.threadId,
                    callbacks: [
                        (e) => {
                            this.addMessage(e.data);
                            this.emit();
                        },
                    ],
                }),
            ]);
            this.subscribed = true;
        }

        this.setStatus("in the group", "on");
        this.setEnabled(true);
        this.hint(`${this.messages.size} message(s) loaded`);
    }

    /**
     * Re-reads the last 10 messages from the Thread. Live events only cover the
     * time a peer is in the Group, so this is how someone who was removed and
     * added back catches up on what was said while they were out.
     */
    async refresh(): Promise<void> {
        const page = await this.threadApi.listMessages(this.threadId, { ...PAGE, limit: 10 });
        const before = this.messages.size;
        page.readItems.forEach((m) => this.addMessage(m));
        const locked = page.readItems.filter((m) => m.statusCode !== 0).length;
        this.hint(
            `fetched ${page.readItems.length} of ${page.totalAvailable} message(s), ` +
                `${this.messages.size - before} new` +
                (locked ? `, ${locked} not decryptable` : ""),
        );
        log(this.userId, `refreshed: ${page.readItems.length} fetched, ${locked} undecryptable`);
    }

    /** A message this peer cannot decrypt is shown as locked, never hidden. */
    private addMessage(m: Types.Message): void {
        this.messages.set(m.info.messageId, {
            author: m.info.author,
            text: m.statusCode === 0 ? dec(m.data) : "",
            ts: m.info.createDate,
            locked: m.statusCode !== 0,
        });
    }

    // --- chat and index ----------------------------------------------------

    async send(text: string): Promise<void> {
        if (!text) return;
        const messageId = await this.threadApi.sendMessage(
            this.threadId,
            new Uint8Array(),
            new Uint8Array(),
            enc(text),
        );
        // Indexed under the message id, so a hit points straight at a message.
        // Only the sender indexes, so the shared index holds no duplicates.
        await this.indexMessage(messageId, text);
        this.hint("sent - indexed, commit follows shortly");
    }

    /**
     * Adds one message to the Index inside a transaction left open for a
     * moment. A burst of messages then costs one commit - and one upload of the
     * encrypted SQLite file - instead of one per message. The commit lands
     * COMMIT_DEBOUNCE_MS after the last message, which is also when the
     * documents become searchable for the other side.
     */
    private indexMessage(messageId: string, text: string): Promise<void> {
        clearTimeout(this.txTimer);
        const added = this.enqueue(async () => {
            if (!this.txOpen) {
                await this.searchApi.beginTransaction(this.indexHandle);
                this.txOpen = true;
            }
            await this.searchApi.addDocument(this.indexHandle, messageId, text);
        });
        this.txTimer = setTimeout(guard(() => this.flushIndex()), COMMIT_DEBOUNCE_MS);
        return added;
    }

    /** Commits the open indexing transaction now; a no-op when there is none. */
    flushIndex(): Promise<void> {
        clearTimeout(this.txTimer);
        this.txTimer = undefined;
        return this.enqueue(async () => {
            if (!this.txOpen) return;
            await this.searchApi.commit(this.indexHandle);
            this.txOpen = false;
            this.hint("index committed - searchable on both sides");
            log(this.userId, "committed the indexing transaction");
        });
    }

    /** Runs index operations one at a time; a failed one does not stall the rest. */
    private enqueue(op: () => Promise<void>): Promise<void> {
        const next = this.indexOps.then(op);
        this.indexOps = next.catch(() => {});
        return next;
    }

    async search(query: string): Promise<void> {
        if (!query) {
            this.hint("Type something to search for.");
            return;
        }
        const found = await this.searchApi.searchDocuments(this.indexHandle, query, PAGE);
        this.hits = new Set(found.readItems.map((d) => d.name));
        this.hint(`${found.readItems.length} hit(s) for “${query}” - highlighted below`);
        log(this.userId, `searched “${query}”: ${found.readItems.length} hit(s)`);
    }

    clearSearch(): void {
        this.hits = null;
        this.hint("");
    }
}
