/** The sender's side: a link, a text box, a file - and no account anywhere. */
import { useRef, useState, useSyncExternalStore } from "react";
import type { Anonymous } from "./Anonymous";
import { guard } from "./log";

/**
 * A file whose every byte says where it is, so a seeked read visibly lands on
 * the offset you asked for. 2 MiB spans several internal chunks - which is what
 * makes the skipped ciphertext measurable.
 */
function sampleFile(): File {
    const bytes = new Uint8Array(2 << 20);
    for (let i = 0; i < bytes.length; i++) bytes[i] = 48 + (i % 10);
    return new File([bytes], "ledger-dump.txt", { type: "text/plain" });
}

export function AnonymousPane({ anon }: { anon: Anonymous }) {
    useSyncExternalStore(anon.subscribe, anon.getVersion);
    const [text, setText] = useState("I saw the invoices being rewritten after the audit.");
    const fileEl = useRef<HTMLInputElement>(null);

    return (
        <section className="pane anon">
            <header>
                <h2>
                    Anonymous sender <span className="tag">no account</span>
                </h2>
                <span className="status">
                    <span className={`dot ${anon.ready ? "on" : ""}`} />
                    <span>{anon.status}</span>
                </span>
            </header>

            <p className="muted">
                Has the link and nothing else - no account, no key registered anywhere. Sealing
                makes no server call, so the Bridge never learns this happened.
            </p>

            {anon.link && (
                <div className="meta">
                    group {anon.link.groupId.slice(0, 12)}… · key {anon.link.groupPubKey.slice(0, 14)}…
                </div>
            )}

            <textarea
                aria-label="Message to the team"
                rows={3}
                value={text}
                disabled={!anon.ready}
                onChange={(e) => setText(e.target.value)}
            />
            <div className="row">
                <input
                    type="file"
                    aria-label="Attach a file"
                    ref={fileEl}
                    disabled={!anon.ready}
                />
                <button
                    disabled={!anon.ready}
                    onClick={guard(async () => {
                        await anon.send(text.trim(), fileEl.current?.files?.[0] ?? undefined);
                        if (fileEl.current) fileEl.current.value = "";
                    })}
                >
                    Send it
                </button>
            </div>
            <button
                disabled={!anon.ready}
                title="A file big enough that seeking into it visibly skips ciphertext"
                onClick={guard(() => anon.send(text.trim(), sampleFile()))}
            >
                Send with a 2 MiB sample file
            </button>
            <div className="hint">{anon.hintText}</div>
        </section>
    );
}
