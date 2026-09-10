# PrivMX Web Endpoint - Vite example

A minimal demo showing the correct **client / backend split**:

- **Client (browser, `src/main.ts`)** - generates the user's private key **at
  runtime** (it never leaves the browser), hands only the **public key** to the
  backend, then connects and exchanges an end-to-end encrypted Thread message.
  Assets load via the zero-config `/auto` entry (`setupAuto()`).
- **Backend (`src/server.ts`)** - holds the **Bridge management API key** and
  registers users' public keys in a Context (`manager/auth` →
  `context/addUserToContext`).

> **WARNING The backend is *mimicked* in the browser.** For a zero-infra demo,
> `src/server.ts` runs client-side and `main.ts` calls `registerUser()` directly
> instead of over HTTP. In a **real app this code must run on your server** - the
> management API key can administer your whole Solution and must never reach the
> browser; the client would `fetch("/api/register-user", …)` your backend.

```
browser: generate keypair ──pubKey──▶ registerUser()  ──API key──▶ Bridge (addUserToContext)
   │  (private key stays here)        [src/server.ts: your backend, mimicked here]
   └──────────────── connect(privateKey) + send encrypted message ─────────────▶ Bridge
```

## Prerequisites

- A running **PrivMX Bridge** with a **management API key** and an existing
  **Context** (create them in the Bridge admin panel / CLI - see the
  [Bridge docs](https://docs.privmx.dev)).
- Node.js 20+.

## Run it

```bash
npm install

cp .env.example .env.local
#   → fill in the VITE_PRIVMX_* values, then RESTART the dev server

npm run dev
```

### Local Bridge in one command (contributors)

From the repo root, `scripts/example_bridge` starts a throwaway Bridge (reusing
the e2e Mongo and seed data: solution, context and API key) and writes this
example's `.env.local` for you:

```bash
scripts/example_bridge        # → http://localhost:9111, writes .env.local
scripts/example_bridge stop
```

A bare Bridge sends **no CORS headers**, so the browser cannot call it
cross-origin. The generated `.env.local` therefore leaves
`VITE_PRIVMX_BRIDGE_URL` empty (= this page's own origin) and sets
`PRIVMX_BRIDGE_PROXY`, which makes the dev server forward `/api` to the Bridge -
including the WebSocket upgrade the core opens on that same path for events. In
production the Bridge sits behind a reverse proxy that adds CORS, and you set
`VITE_PRIVMX_BRIDGE_URL` to its URL instead.

Open the printed URL, enter a user ID, and click **Generate key → register →
send message**. The log shows the key generated in-browser, the user registered,
and an encrypted message round-trip.

## Second demo: searchable group chat

`example/group-chat` builds a chat on **GroupApi** + **SearchApi**, with Alice
and Bob side by side on one page. It uses the same local Bridge - see its README.

## Notes

- **`src/server.ts` = your backend.** Keeping it a separate module makes the
  move to a real server a copy-paste: host it behind an HTTP endpoint, drop the
  `VITE_` prefixes, and replace the direct `registerUser()` call in `main.ts`
  with a `fetch`.
- **`vite.config.ts`** sets the COOP/COEP headers required for `SharedArrayBuffer`
  (the WASM worker threads). Serve these in production too.

## Using a locally-built SDK (contributors)

This example installs the SDK from the locally-built tarball at
`builds/privmx-webendpoint-latest.tgz` (see `package.json`), so it always tests
the package built from this repo - the same path the pipeline smoke test uses.
From the repo root, build the package, then install here:

```bash
npm run build          # or: npm run build:js, if WASM is already built
npm run build-package  # produces builds/privmx-webendpoint-latest.tgz
cd example/vite && npm install
```
