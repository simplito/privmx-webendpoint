/**
 * PrivMX Web Endpoint - secure intake, built on GroupApi alone.
 *
 * Left: you, a member of the receiving team. Right: somebody with a link and no
 * account. They seal a message and a file that only your Group can open; the
 * ciphertext is parked in a store that can read none of it.
 *
 * No Thread, no Store, no Inbox, no Search - the only PrivMX data API here is
 * GroupApi. (CryptoApi still generates your key; without one there is nothing to
 * connect with.)
 */
import { useEffect, useRef, useState } from "react";
import { setupAuto } from "@simplito/privmx-webendpoint";
import { Member } from "./Member";
import { Anonymous } from "./Anonymous";
import { MemberPane } from "./MemberPane";
import { AnonymousPane } from "./AnonymousPane";
import { StoreInspector } from "./StoreInspector";
import { guard, log, useLog } from "./log";

// Module scope: these own WASM handles and outlive any render.
const you = new Member("intake-team");
const anon = new Anonymous();

export function App() {
    const [step, setStep] = useState("Loading the encryption core…");
    const [start, setStart] = useState<(() => Promise<void>) | null>(null);
    const lines = useLog();
    const logEl = useRef<HTMLPreElement>(null);

    async function connect(): Promise<void> {
        setStep("Connecting…");
        setStart(null);
        if (!(await you.findGroup())) await you.createGroup();

        // The sender gets the link out of band, and nothing else.
        await anon.connect();
        anon.useLink(you.groupId, you.groupPubKey);
        setStep("Send something from the right. Only your Group can open it.");
    }

    // One-shot: initialises the WASM core. `main.tsx` deliberately skips
    // StrictMode, whose double-invoke would run this twice.
    useEffect(() => {
        setupAuto()
            .then(async () => {
                await you.connect();
                setStep("You are connected. Open the intake box to get its link.");
                setStart(() => connect);
            })
            .catch((e: Error) => setStep(`Setup failed: ${e.message}`));
    }, []);

    useEffect(() => {
        if (logEl.current) logEl.current.scrollTop = logEl.current.scrollHeight;
    }, [lines]);

    return (
        <>
            <h1>Secure intake</h1>
            <p className="lede">
                Anyone with a link can send your team a message and a file that only the team can
                open - no account, no login, nothing stored in the clear. Built on{" "}
                <strong>GroupApi</strong> and nothing else.
            </p>

            <div id="step">
                <span>{step}</span>
                <button className="primary" disabled={!start} onClick={start ? guard(start) : undefined}>
                    Open the intake box
                </button>
            </div>

            <div className="panes">
                <MemberPane member={you} />
                <AnonymousPane anon={anon} />
            </div>

            <StoreInspector />

            <details>
                <summary>Activity log</summary>
                <pre id="log" ref={logEl}>
                    {lines.join("\n")}
                </pre>
            </details>
        </>
    );
}
