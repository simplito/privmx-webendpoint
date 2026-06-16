# PrivMX Web Endpoint — Vite example

A minimal demo showing the correct **client / backend split**:

- **Client (browser, `src/main.ts`)** — generates the user's private key **at
  runtime** (it never leaves the browser), hands only the **public key** to the
  backend, then connects and exchanges an end-to-end encrypted Thread message.
  Assets load via the zero-config `/auto` entry (`setupAuto()`).
- **Backend (`src/server.ts`)** — holds the **Bridge management API key** and
  registers users' public keys in a Context (`manager/auth` →
  `context/addUserToContext`).

> **⚠️ The backend is *mimicked* in the browser.** For a zero-infra demo,
> `src/server.ts` runs client-side and `main.ts` calls `registerUser()` directly
> instead of over HTTP. In a **real app this code must run on your server** — the
> management API key can administer your whole Solution and must never reach the
> browser; the client would `fetch("/api/register-user", …)` your backend.

```
browser: generate keypair ──pubKey──▶ registerUser()  ──API key──▶ Bridge (addUserToContext)
   │  (private key stays here)        [src/server.ts: your backend, mimicked here]
   └──────────────── connect(privateKey) + send encrypted message ─────────────▶ Bridge
```

## Prerequisites

- A running **PrivMX Bridge** with a **management API key** and an existing
  **Context** (create them in the Bridge admin panel / CLI — see the
  [Bridge docs](https://docs.privmx.dev)).
- Node.js 20+.

## Run it

```bash
npm install

cp .env.example .env.local
#   → fill in the VITE_PRIVMX_* values, then RESTART the dev server

npm run dev
```

Open the printed URL, enter a user ID, and click **Generate key → register →
send message**. The log shows the key generated in-browser, the user registered,
and an encrypted message round-trip.

## Notes

- **`src/server.ts` = your backend.** Keeping it a separate module makes the
  move to a real server a copy-paste: host it behind an HTTP endpoint, drop the
  `VITE_` prefixes, and replace the direct `registerUser()` call in `main.ts`
  with a `fetch`.
- **`vite.config.ts`** sets the COOP/COEP headers required for `SharedArrayBuffer`
  (the WASM worker threads). Serve these in production too.

## Using a locally-built SDK (contributors)

This example depends on the published `@simplito/privmx-webendpoint`. To test a
local build, from the repo root run `npm run build` then `npm pack`, and install
the tarball here:

```bash
npm install ../../simplito-privmx-webendpoint-*.tgz
```
