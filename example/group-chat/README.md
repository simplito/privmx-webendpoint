# PrivMX Web Endpoint - searchable group chat

A demo of **`GroupApi`** and **`SearchApi`** working together: one Group of
Context users is granted access to *both* a Thread and a full-text Search Index,
so membership is managed in a single place, and every message is indexed by its
sender - end-to-end encrypted, yet searchable.

Alice and Bob share **one page, side by side**, so the Group mechanics are
visible as they happen instead of being spread across two browser tabs. Bob's
pane is locked until Alice adds him to the Group, and it unlocks by itself the
moment she does.

```
                    ┌─────────── Group ("Chat members") ───────────┐
                    │                                              │
       granted as "user"                              granted as "manager"
                    │                                              │
                 Thread  ◀── messages ──  Alice / Bob  ── indexed ──▶  Search Index
```

## Run it

From the repo root, start a local Bridge (this also writes `.env.local` here):

```bash
scripts/example_bridge
cd example/group-chat && npm install && npm run dev
```

Or point it at your own Bridge: `cp .env.example .env.local`, fill in the
values, and restart the dev server.

Then just follow the blue banner at the top of the page - it always names the
single next action.

## What each step demonstrates

| Step | What happens | Why it matters |
|---|---|---|
| **Start demo** | Both users generate a key in the browser, register their **public** key, and connect. Alice creates the Group, the Search Index and the Thread. | The Index and Thread are granted to the **Group**, not to a user list. |
| Bob's pane is locked | `listThreads` returns nothing for Bob. | Access is decided by Group membership; a non-member cannot even see the room. |
| **Add Bob to the Group** | `addGroupMembers`, then Bob's pane opens. | The log shows `epoch 1 → 1`: adding a member costs **no re-key** of any granted container. |
| Chat on both sides | Each message goes to the Thread and to the Index, added by its sender. | Only the sender indexes, so the shared Index holds no duplicates. |
| **Search** from either pane | `searchDocuments` returns message ids; hits are highlighted in place. | One Index, shared by the whole Group. |
| **Remove Bob** | `removeGroupMembers` bumps the epoch, and both the Thread and the Index land in `staleGroups`. The next write to each one re-keys it and goes through. | Removal is the expensive direction. Nothing has to be re-keyed by hand, but every granted container pays for it on its next write. |
| Talk while he is out | Send a couple of messages as Alice - Bob's pane stays quiet. | Live events only reach current members. |
| **Add Bob to the Group** again | Bob rejoins and his pane is refreshed automatically. | He sees everything said while he was away - see below. |
| **Refresh** (either pane) | Re-reads the last 10 messages from the Thread. | Catching up needs a re-read; events do not backfill. |

### Re-adding grants access to the past, not just the future

When Bob comes back he can read the messages sent while he was out, and the log
shows why: `re-added bob - epoch 2 -> 2`. Adding a member never advances the
epoch, so Bob is handed the *current* epoch key - the same one Alice's messages
were encrypted with after the rotation. Removal cuts a member off from that
point on; it does not make later content unreadable to them if they are ever
let back in. If your application needs a returning member to be blind to that
window, call rotateThreadKeys and rotateSearchIndexKeys after re-adding them.

## Notes on the code

- **The files.** `src/App.tsx` runs the demo (the step banner and the Group
  operations), `src/PeerPane.tsx` is one side of the split screen,
  `src/Peer.ts` holds all the SDK work for one user, `src/log.ts` is the
  activity log, and `src/main.tsx` mounts it. `Peer` is deliberately React-free
  and the pane subscribes to it through `useSyncExternalStore`, so the SDK code
  reads the same whatever UI you put on top of it.
- **No `<StrictMode>`.** Its double-invoked effects would initialise the WASM
  core twice, and that core is a process-wide singleton.
- **Indexing is batched.** A sent message goes into the Index inside a
  transaction that stays open for 1.5s after the last one, so a burst of
  messages costs one commit instead of one per message. Each commit writes the
  changed fragments of the encrypted index back to the Bridge. The other side
  can search a message once that commit lands.
- **`src/server.ts` = your backend.** It holds the Bridge **management API key**
  and is *mimicked in the browser* here so the demo needs no server process. In
  a real app this runs on your server and the browser calls it over HTTP.
- **Keys are per user id, in `localStorage`.** A Group and its containers are
  encrypted to the member public keys known at the time, so re-registering the
  same user id under a freshly generated key would lock that user out of their
  own room. A real app uses the platform keychain.
- **`vite.config.ts` sets COOP/COEP** (required for `SharedArrayBuffer`, i.e. the
  WASM worker threads) and proxies same-origin `/api` to the Bridge, including
  the WebSocket upgrade the core opens on that same path for events. The proxy
  exists because a bare Bridge serves **no CORS headers**; in production it sits
  behind a reverse proxy that adds them, and you set `VITE_PRIVMX_BRIDGE_URL`
  instead.
- **A room that cannot be decrypted is skipped.** `listThreads` matches on user
  *id*, while keys are wrapped to the public key that id had at the time, so a
  user who lost their key still sees the room listed. The demo only accepts a
  Thread with `statusCode === 0` and otherwise starts a fresh room.

Deliberately left out: no `closeSearchIndex`/`disconnect` on unload, no retry or
reconnect, and no room management beyond the single hard-coded demo room. To
start over, restart `scripts/example_bridge` - it recreates the database.

## Using a locally-built SDK (contributors)

This example installs the SDK from `builds/privmx-webendpoint-latest.tgz`. After
rebuilding it, delete `package-lock.json` here before reinstalling - otherwise
npm restores the previous tarball from cache by its pinned integrity hash and you
silently keep running the old WASM:

```bash
npm run build && npm run build-package          # from the repo root
cd example/group-chat && rm -f package-lock.json && npm install
```
