/**
 * The sender: somebody with a link and no account.
 *
 * It holds a *public* connection - `connectPublic`, no key registered anywhere,
 * nothing to log in with - and seals for the Group using only what the link
 * carries: the Group's ID and its identity public key. Sealing itself makes no
 * server call at all, so the Bridge never learns that a submission happened; the
 * ciphertext goes straight to the blind store.
 *
 * What it cannot do is as instructive as what it can: it cannot read back what
 * it sealed, and it cannot send a Group custom event - notifications require
 * membership.
 */
import { Endpoint, progressStream, strToUint8, type GroupApi } from "@simplito/privmx-webendpoint";
import { publicEndpoint } from "./server";
import * as store from "./store";
import { log } from "./log";

const enc = strToUint8;

export class Anonymous {
    private api: GroupApi | undefined;
    /** The whole "link": everything an outsider needs, all of it public. */
    link: { groupId: string; groupPubKey: string } | undefined;

    status = "not connected";
    hintText = "";

    private listeners = new Set<() => void>();
    private version = 0;

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

    get ready(): boolean {
        return !!this.api && !!this.link;
    }

    /** Opens an account-less session. No registration, no key of our own. */
    async connect(): Promise<void> {
        const { bridgeUrl, solutionId } = publicEndpoint();
        const connection = await Endpoint.connectPublic(solutionId, bridgeUrl);
        this.api = await Endpoint.createGroupApi(connection);
        this.status = "public session (no account)";
        this.emit();
        log("sender", "connected with connectPublic - no user, no key registered");
    }

    /** Receives the intake link out of band, exactly as a real sender would. */
    useLink(groupId: string, groupPubKey: string): void {
        this.link = { groupId, groupPubKey };
        this.emit();
    }

    /**
     * Seals a note, and optionally a file, for the Group and leaves both in the
     * store. The file name rides inside the note envelope, so the store cannot
     * read it either.
     */
    async send(text: string, file?: File): Promise<string> {
        if (!this.api || !this.link) throw new Error("no link yet");
        const { groupId, groupPubKey } = this.link;
        const id = store.newId();

        const note = await this.api.encryptAnonymously(
            groupId,
            groupPubKey,
            enc(JSON.stringify({ text, fileName: file?.name })),
        );

        let fileEnvelope: Uint8Array | undefined;
        let fileCipher: Uint8Array | undefined;
        if (file) {
            // One pipeline: the file is read, sealed and collected without ever
            // holding the plaintext twice, and progress is just another stage.
            const sealer = this.api.sealFileAnonymously({
                groupId,
                groupPubKey, // public information only, no membership needed
                size: file.size,
            });
            fileCipher = new Uint8Array(
                await new Response(
                    file
                        .stream()
                        .pipeThrough(
                            progressStream((sent) =>
                                this.hint(`sealing… ${Math.round((sent / file.size) * 100)}%`),
                            ),
                        )
                        .pipeThrough(sealer),
                ).arrayBuffer(),
            );
            // Keep both: the envelope is a header without which nobody opens the
            // ciphertext - not even a member of the Group.
            fileEnvelope = await sealer.envelope;
            log("sender", `sealed ${file.name}: ${file.size} B plain → ${fileCipher.length} B cipher`);
        }

        store.put({ id, note, fileEnvelope, fileCipher, at: Date.now() });
        this.hint("sent - and we cannot read it back, only the team can");
        log("sender", `sent ${id.slice(0, 8)}… straight into the store; the Bridge saw nothing`);
        return id;
    }
}
