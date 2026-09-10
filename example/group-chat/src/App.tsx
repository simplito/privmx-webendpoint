/**
 * PrivMX Web Endpoint - searchable group chat (GroupApi + SearchApi).
 *
 * Two users share one page so the Group mechanics are visible as they happen,
 * instead of being spread over two browser tabs and a list of manual steps.
 *
 * What the demo shows, in order:
 *
 *   1. Alice creates a Group, a Search Index and a Thread. The Index and the
 *      Thread are granted to the *Group*, not to a list of users - that is the
 *      point of GroupApi: membership lives in one place.
 *   2. Bob is registered in the Context but is not in the Group, so he cannot
 *      even see the room. `listThreads` returns nothing for him.
 *   3. Alice adds Bob. The Group's key epoch does NOT move, so nothing is
 *      re-keyed, and Bob's side unlocks immediately.
 *   4. Both chat. Every message is added to the shared Search Index by its
 *      sender, so either side can search the whole conversation.
 *   5. Alice removes Bob. The epoch advances and the containers re-key themselves,
 *      because they were created with a forwardSecrecy policy - after which Bob
 *      no longer receives new messages.
 *
 * Keys are generated in the browser and never leave it; only public keys go to
 * `./server` (a backend mimicked in-browser - see that file's warning).
 */
import { useEffect, useRef, useState } from "react";
import { setupAuto, type Types } from "@simplito/privmx-webendpoint";
import { Peer } from "./Peer";
import { PeerPane } from "./PeerPane";
import { guard, log, useLog } from "./log";

// Module scope, not component state: these own WASM handles and outlive any render.
const alice = new Peer("alice");
const bob = new Peer("bob");

interface Step {
    text: string;
    action?: { label: string; run: () => Promise<void> };
}

export function App() {
    const [step, setStep] = useState<Step>({ text: "Loading the encryption core…" });
    const [roomState, setRoomState] = useState("");
    const [canAdd, setCanAdd] = useState(false);
    const [canRemove, setCanRemove] = useState(false);
    const lines = useLog();
    const logEl = useRef<HTMLPreElement>(null);

    const showRoomState = (group: Types.Group): void =>
        setRoomState(
            `group ${group.groupId} · epoch ${group.keyVersion} · members ${group.users.join(", ")} · ` +
                `thread ${alice.threadId} · index ${alice.indexId}`,
        );

    /** Alice adds Bob. Incremental: only the newcomer is named, the roster follows. */
    async function addBob(): Promise<void> {
        // Both buttons go first: a second click while the addition is in flight
        // would seat Bob twice.
        setCanAdd(false);
        setCanRemove(true);
        const group = await alice.groupApi.getGroup(alice.groupId);
        const rejoining = bob.threadId !== "";
        await alice.groupApi.addGroupMembers(alice.groupId, [{ user: bob.me, role: "user" }]);
        // Adding never moves the epoch, so `group` is still current.
        log("alice", `${rejoining ? "re-added" : "added"} bob - epoch stays ${group.keyVersion}, nothing re-keyed`);

        // Bob is on the same page, so his side can just re-open the room now.
        await bob.openRoom();
        showRoomState(group);
        if (rejoining) {
            // Live events only reach members, so Bob re-reads the Thread to catch up.
            await bob.refresh();
            setStep({ text: "Bob is back in, and his pane shows what was sent while he was out." });
        } else {
            setStep({ text: "Chat on both sides, then search from either one - the Index is shared." });
        }
    }

    /** Alice removes Bob: the epoch advances and the containers re-key themselves on the next write. */
    async function removeBob(): Promise<void> {
        setCanRemove(false);
        setCanAdd(true); // he can always be let back in
        const group = await alice.groupApi.getGroup(alice.groupId);
        await alice.groupApi.removeGroupMembers(alice.groupId, [bob.userId]);
        const after = await alice.groupApi.getGroup(alice.groupId);
        log("alice", `removed bob - epoch ${group.keyVersion} → ${after.keyVersion}`);
        showRoomState(after);

        bob.hint("Removed from the Group - new Thread messages no longer reach him.");
        alice.hint("Send a message now - it will not appear on Bob's side.");
        setStep({
            text: "Send a message or two as Alice - Bob's pane stays quiet. Then add him back and watch him catch up.",
        });
    }

    async function start(): Promise<void> {
        setStep({ text: "Connecting…" });
        await alice.connect();
        await bob.connect();

        // Alice joins an existing room if one is already on the Bridge, so the demo
        // survives a reload; otherwise she creates it.
        if (!(await alice.openRoom())) await alice.createRoom();
        showRoomState(await alice.groupApi.getGroup(alice.groupId));

        if (await bob.openRoom()) {
            setCanRemove(true);
            setStep({ text: "Both are in the Group. Chat, search, then try Remove Bob." });
            return;
        }
        bob.hint("Registered in the Context, but not in the Group - the room is invisible to him.");
        setCanAdd(true);
        setStep({ text: "Bob is not in the Group, so he cannot see the room. Add him:" });
    }

    // One-shot: loads and initialises the WASM core. `main.tsx` deliberately does
    // not use StrictMode, whose double-invoke would run this twice.
    useEffect(() => {
        setupAuto()
            .then(() => {
                log("demo", "encryption core ready");
                setStep({
                    text: "Connect Alice and Bob, and create the room.",
                    action: { label: "Start demo", run: start },
                });
            })
            .catch((e: Error) => setStep({ text: `Setup failed: ${e.message}` }));
    }, []);

    useEffect(() => {
        if (logEl.current) logEl.current.scrollTop = logEl.current.scrollHeight;
    }, [lines]);

    return (
        <>
            <h1>Searchable group chat</h1>
            <p className="lede">
                Two users, one page. A single <strong>Group</strong> is granted access to both the
                Thread and the full-text <strong>Search Index</strong>, so membership is managed in one
                place - watch Bob's side unlock the moment Alice adds him to the Group.
            </p>

            <div id="step">
                <span>{step.text}</span>
                <button
                    className="primary"
                    disabled={!step.action}
                    onClick={step.action && guard(step.action.run)}
                >
                    {step.action?.label ?? "Done"}
                </button>
            </div>
            <div id="roomState">{roomState}</div>

            <div className="panes">
                <PeerPane peer={alice} title="Alice" tag="group manager">
                    <button disabled={!canAdd} onClick={guard(addBob)}>
                        Add Bob to the Group
                    </button>
                    <button disabled={!canRemove} onClick={guard(removeBob)}>
                        Remove Bob
                    </button>
                </PeerPane>
                <PeerPane peer={bob} title="Bob" tag="member" />
            </div>

            <details open>
                <summary>Activity log</summary>
                <pre id="log" ref={logEl}>
                    {lines.join("\n")}
                </pre>
            </details>
        </>
    );
}
