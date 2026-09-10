/** One user's pane: their chat, their search box, and whatever the demo lets them manage. */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Peer } from "./Peer";
import { guard } from "./log";

export function PeerPane({
    peer,
    title,
    tag,
    children,
}: {
    peer: Peer;
    title: string;
    tag: string;
    children?: ReactNode;
}) {
    // Re-renders whenever the Peer changes; the fields are then read directly off it.
    useSyncExternalStore(peer.subscribe, peer.getVersion);
    const [message, setMessage] = useState("");
    const [query, setQuery] = useState("");
    const chatEl = useRef<HTMLDivElement>(null);
    const off = !peer.enabled;
    const chat = peer.chat;

    // Follow the conversation: a new message must not land below the fold.
    useEffect(() => {
        if (chatEl.current) chatEl.current.scrollTop = chatEl.current.scrollHeight;
    }, [chat.length]);

    const send = guard(async () => {
        const text = message.trim();
        if (!text) return;
        setMessage("");
        await peer.send(text);
    });
    const search = guard(() => peer.search(query.trim()));

    return (
        <section className="pane">
            <header>
                <h2>
                    {title} <span className="tag">{tag}</span>
                </h2>
                <span className="status">
                    <span className={`dot ${peer.dot}`} />
                    <span>{peer.status}</span>
                </span>
            </header>

            <div className="chat" ref={chatEl}>
                {chat.map((m) => (
                    <div
                        key={m.id}
                        className={
                            "msg" + (m.author === peer.userId ? " mine" : "") + (m.hit ? " hit" : "")
                        }
                    >
                        <b>{m.author}: </b>
                        {/* Rendered as text, never as HTML. */}
                        {m.locked ? "🔒 cannot decrypt this message" : m.text}
                    </div>
                ))}
            </div>

            <div className="row">
                <input
                    aria-label={`Message as ${title}`}
                    placeholder={`Message as ${title}…`}
                    disabled={off}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && send()}
                />
                <button disabled={off} onClick={send}>
                    Send
                </button>
            </div>

            <div className="row">
                <input
                    aria-label={`Search the shared index as ${title}`}
                    placeholder="Search the shared index…"
                    disabled={off}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && search()}
                />
                <button disabled={off} onClick={search}>
                    Search
                </button>
                <button
                    disabled={off}
                    onClick={() => {
                        setQuery("");
                        peer.clearSearch();
                    }}
                >
                    Clear
                </button>
                <button disabled={off} title="Fetch the last 10 messages" onClick={guard(() => peer.refresh())}>
                    Refresh
                </button>
            </div>

            <div className="hint">{peer.hintText}</div>
            {children && <div className="manager">{children}</div>}
        </section>
    );
}
