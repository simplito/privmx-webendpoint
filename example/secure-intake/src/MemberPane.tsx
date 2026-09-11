/** Your side: what arrived, and what you can prove about it. */
import { useState, useSyncExternalStore } from "react";
import type { Member } from "./Member";
import * as store from "./store";
import { guard } from "./log";

/** Where the ranged preview reads from - far enough in to be worth a seek. */
const PREVIEW_AT = 1 << 20;

function save(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: name }).click();
    URL.revokeObjectURL(url);
}

export function MemberPane({ member }: { member: Member }) {
    useSyncExternalStore(member.subscribe, member.getVersion);
    useSyncExternalStore(store.subscribe, store.bytesServed);
    const [note, setNote] = useState("");
    const [selected, setSelected] = useState<string | null>(null);

    const items = store.list().filter((d) => !d.parent);
    const active = selected ?? items[items.length - 1]?.id ?? null;
    const opened = active ? member.opened.get(active) : undefined;
    const replies = active ? store.list().filter((d) => d.parent === active) : [];

    return (
        <section className="pane">
            <header>
                <h2>
                    You <span className="tag">team member</span>
                </h2>
                <span className="status">
                    <span className={`dot ${member.dot}`} />
                    <span>{member.status}</span>
                </span>
            </header>

            {items.length === 0 ? (
                <p className="empty">Nothing has arrived yet.</p>
            ) : (
                <div className="submissions">
                    {items.map((d) => {
                        const o = member.opened.get(d.id);
                        // "signed" is a claim about a verified signature, so it is
                        // never the default for something nobody has opened yet.
                        const state = !o ? "wait" : o.error ? "err" : o.anonymous ? "anon" : "signed";
                        const label = { wait: "opening…", err: "locked", anon: "anonymous", signed: "signed" }[
                            state
                        ];
                        return (
                            <button
                                key={d.id}
                                className={"submission" + (d.id === active ? " on" : "")}
                                onClick={() => setSelected(d.id)}
                            >
                                <span className={`badge ${state}`}>{label}</span>
                                {o?.error ? "cannot open" : o?.text.slice(0, 40) || "…"}
                                {o?.fileName && <span className="clip">📎</span>}
                            </button>
                        );
                    })}
                </div>
            )}

            {opened && !opened.error && (
                <div className="detail">
                    <p>{opened.text}</p>
                    <p className="muted">
                        {opened.anonymous
                            ? "Sealed anonymously - nothing about the sender is knowable."
                            : `Signed by ${opened.author.slice(0, 14)}… - the signature checks out.`}
                    </p>

                    {opened.fileName && (
                        <div className="file">
                            <span>
                                📎 {opened.fileName} · {opened.fileSize?.toLocaleString()} B sealed
                            </span>
                            <div className="row">
                                <button
                                    onClick={guard(async () => {
                                        const { blob, name, complete } = await member.readWhole(active!);
                                        save(blob, name);
                                        member.hint(`downloaded ${name} · whole file verified=${complete}`);
                                    })}
                                >
                                    Download
                                </button>
                                <button
                                    title="Reads 64 bytes from the middle without fetching the start"
                                    onClick={guard(async () => {
                                        const s = await member.readSlice(active!, PREVIEW_AT, 64);
                                        member.hint(
                                            `read 64 B at 1 MiB after fetching ${s.fetched.toLocaleString()} of ${s.total.toLocaleString()} B`,
                                        );
                                    })}
                                >
                                    Peek at 1 MiB
                                </button>
                            </div>
                        </div>
                    )}

                    {replies.map((r) => {
                        const o = member.opened.get(r.id);
                        return (
                            <p key={r.id} className="comment">
                                <b>you: </b>
                                {o?.text}
                            </p>
                        );
                    })}

                    <div className="row">
                        <input
                            aria-label="Add a signed note"
                            placeholder="Add a note - signed, so the team knows it was you…"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && note.trim() && addNote()}
                        />
                        <button disabled={!note.trim()} onClick={addNote}>
                            Add
                        </button>
                    </div>
                </div>
            )}

            {opened?.error && <p className="err">🔒 {opened.error}</p>}
            <div className="hint">{member.hintText}</div>
        </section>
    );

    function addNote() {
        const text = note.trim();
        setNote("");
        guard(() => member.comment(active!, text))();
    }
}
