# PrivMX Web Endpoint

> End-to-end encrypted messaging, file storage, and real-time media in the
> browser - powered by a C++ cryptography core compiled to WebAssembly.

[![npm](https://img.shields.io/npm/v/@simplito/privmx-webendpoint.svg)](https://www.npmjs.com/package/@simplito/privmx-webendpoint)
[![types](https://img.shields.io/badge/types-included-3178c6.svg)](#)
[![module](https://img.shields.io/badge/module-ESM-f7df1e.svg)](#packaging)
[![license](https://img.shields.io/badge/license-PrivMX%20Free-blue.svg)](#license)

**[Getting Started](https://docs.privmx.dev/docs/latest/js/introduction)** ·
**[API Reference](https://docs.privmx.dev/docs/latest/reference/webendpoint/api-reference/connection)** ·
**[PrivMX Bridge docs](https://docs.privmx.dev)**

**PrivMX Web Endpoint** is the client-side gateway to a **PrivMX Bridge**. Your app
encrypts and decrypts everything locally - the Bridge is zero-knowledge and only ever
stores ciphertext. Under the hood it wraps the native **PrivMX Endpoint** C++ library
via WebAssembly, behind a small, fully-typed JS/TS API.

- **End-to-end encryption** - all data is encrypted/decrypted client-side; the private key never leaves the browser.
- **High-level primitives** - Threads (messaging), Stores (files), Inboxes (one-way submissions), KVDBs (key-value), Streams (E2EE WebRTC audio/video).

### Quick look

```ts
import { Endpoint, setupAuto } from "@simplito/privmx-webendpoint";

await setupAuto();                                    // load the WASM core - no asset copying
const conn = await Endpoint.connect(privateKey, solutionId, bridgeUrl);
const threads = await conn.getThreadApi();             // also: conn.getStoreApi(), getInboxApi(), …

await threads.sendMessage(                            // signed + encrypted client-side
  threadId, new Uint8Array(), new Uint8Array(),
  new TextEncoder().encode("Hello, E2EE world!"),
);
```

> Full runnable walkthrough in **[Getting started](#getting-started-a-messaging-app-with-vite)**
> and the **[`example/vite`](example/vite)** app.

**Requirements:** a modern, cross-origin-isolated browser page (COOP/COEP headers - see below)
and a running [PrivMX Bridge](https://docs.privmx.dev). The SDK is browser-only.

---

## Contents

- [How it works](#how-it-works)
- [Core concepts](#core-concepts)
- [Installation](#installation)
- [Getting started: a messaging app with Vite](#getting-started-a-messaging-app-with-vite)
- [Loading the WASM assets](#loading-the-wasm-assets)
- [Common tasks](#common-tasks)
- [Receiving events](#receiving-events)
- [Error handling](#error-handling)
- [Logging](#logging)
- [Lifecycle](#lifecycle)
- [Production checklist](#production-checklist)
- [Packaging](#packaging)
- [Building from source](#building-from-source)
- [Testing](#testing)
- [License](#license)

---

## How it works

```
Your app  -->  @simplito/privmx-webendpoint  -->  WASM core (C++)  -->  PrivMX Bridge
            (typed TS API)                    (crypto, on worker threads)   (stores ciphertext)
```

Everything sensitive is encrypted in the browser before it reaches the network.
Your private key authenticates you and decrypts data locally; **it never leaves the
device**. The Bridge is effectively zero-knowledge about your plaintext.

You bootstrap through **`Endpoint`** (the `EndpointFactory` static facade) -
`setup` / `setupAuto`, `connect` / `connectPublic` - then create the per-feature
APIs straight off the connection: `connection.getThreadApi()`,
`getStoreApi()`, `getInboxApi()`, `getKvdbApi()`, `getStreamApi()`,
`getEventManager()`. (`Endpoint.createThreadApi(connection)` does the same thing
if you prefer the static form.)

---

## Core concepts

| Primitive | Use it for | Key API |
| --- | --- | --- |
| **Thread** | Encrypted messaging / activity feeds | `ThreadApi` |
| **Store** | Encrypted file storage (chunked upload/download) | `StoreApi` |
| **Inbox** | One-way submissions from anyone, incl. anonymous guests (contact forms) | `InboxApi` |
| **KVDB** | Encrypted key-value records | `KvdbApi` |
| **Stream** | Real-time E2EE WebRTC audio/video | `StreamApi` |
| **Events** | Server-pushed change notifications | `EventQueue` / event managers |

A few terms you'll meet immediately:

- **Solution / Context** - administrative scopes created in the Bridge admin panel.
  A **Context ID** is the workspace your users and containers live in.
- **`publicMeta` vs `privateMeta`** - most objects carry two metadata blobs.
  `publicMeta` is stored **unencrypted** on the server (never put secrets there);
  `privateMeta` is encrypted client-side. The payload (`data`) is always encrypted.
- **Private key (WIF)** - the user's identity. Generate or derive it with `CryptoApi`;
  register the matching **public key** in the Context to grant access.

---

## Installation

```bash
npm install @simplito/privmx-webendpoint
```

You also need a running **PrivMX Bridge** - see the
[Bridge documentation](https://docs.privmx.dev). From it you'll obtain a Bridge URL,
a Solution ID, a Context ID, and a **management API key** (`apiKeyId` +
`apiKeySecret`) used server-side to register users (step 5).

---

## Getting started: a messaging app with Vite

A complete, runnable version of this guide lives in
[`example/vite`](example/vite) - copy it or follow along below.

### 1. Scaffold

```bash
npm create vite@latest privmx-demo -- --template vanilla-ts
cd privmx-demo
npm install @simplito/privmx-webendpoint
```

### 2. Enable cross-origin isolation (required)

The WASM core runs on worker threads backed by `SharedArrayBuffer`, which browsers
only expose on a **cross-origin isolated** page. Add the two headers to the dev
server in `vite.config.ts` (and serve them in production too):

```ts
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    {
      name: "cross-origin-isolation",
      configureServer(server) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
          next();
        });
      },
    },
  ],
  optimizeDeps: { exclude: ["@simplito/privmx-webendpoint"] },
});
```

> Skipping this is the #1 setup mistake - it surfaces as `SharedArrayBuffer is not
> defined` when `setup()` runs.

### 3. Initialise the SDK (zero-config assets)

The library needs four runtime files (the WASM binary, its glue, the E2EE worker,
and an audio worklet). With **`setupAuto()`** you don't copy them anywhere - it
resolves them via `import.meta.url` and Vite fingerprints and serves them
automatically:

```ts
import { Endpoint, setupAuto } from "@simplito/privmx-webendpoint";

await setupAuto();
```

### 4. Generate the user's key pair (in the browser, at runtime)

The private key is the user's identity. Generate it **client-side** - it never
leaves the browser and is never sent anywhere:

```ts
const crypto = await Endpoint.createCryptoApi();
const privateKey = await crypto.generatePrivateKey();        // WIF - stays in the browser
const publicKey = await crypto.derivePublicKey(privateKey);  // safe to send to your server
```

For password-based login use `crypto.derivePrivateKey2(password, salt)` (deterministic).

### 5. Register the public key (on your server)

To connect, the user's **public** key must be registered in a Context. That
requires the Bridge **management API key**, which can administer your whole
Solution - so it lives on **your backend**, never in the browser. The browser
sends only the public key; the server registers it:

```ts
// --- server side (holds the API key) ---
// POST <bridgeUrl>/api  (JSON-RPC 2.0)
async function registerUser(userId: string, userPubKey: string) {
  const api = (method: string, params: unknown, token?: string) =>
    fetch(`${BRIDGE_URL}/api`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }).then((r) => r.json());

  // 1. exchange the API key for a short-lived token
  const { result } = await api("manager/auth", {
    grantType: "api_key_credentials",
    apiKeyId: API_KEY_ID, apiKeySecret: API_KEY_SECRET, scope: ["solution", "context"],
  });
  // 2. add the user's public key to the Context
  await api("context/addUserToContext", { contextId: CONTEXT_ID, userId, userPubKey }, result.accessToken);
}
```

The browser calls this over HTTP (`await fetch("/api/register-user", …)`). The
[`example/vite`](example/vite) app keeps this in a separate `src/server.ts`
module - it *mimics* the backend in-browser so the demo needs no server process,
but the module is structured to lift onto a real backend unchanged.

### 6. Connect, create a Thread, send a message

```ts
const connection = await Endpoint.connect(privateKey, solutionId, bridgeUrl);
const threadApi = await connection.getThreadApi();

const enc = (s: string) => new TextEncoder().encode(s);
const me = { userId: "alice", pubKey: publicKey };

const threadId = await threadApi.createThread(
  contextId,
  [me],                                  // users (read access)
  [me],                                  // managers (manage access)
  enc(JSON.stringify({})),               // publicMeta - NOT encrypted
  enc(JSON.stringify({ title: "Chat" })),// privateMeta - encrypted
);

await threadApi.sendMessage(
  threadId,
  new Uint8Array(),                      // publicMeta
  new Uint8Array(),                      // privateMeta
  enc("Hello, E2EE world!"),             // data - signed & encrypted client-side
);

const page = await threadApi.listMessages(threadId, { skip: 0, limit: 10, sortOrder: "desc" });
for (const msg of page.readItems) {
  console.log(new TextDecoder().decode(msg.data));
}

await connection.disconnect();
```

That's the whole loop: generate a key in the browser -> register its public half
via your server -> connect and exchange an end-to-end encrypted message. Run
`npm run dev` against the [`example/vite`](example/vite) app to see it live.

---

## Loading the WASM assets

The four assets are exported at `@simplito/privmx-webendpoint/assets/*`. Pick the
strategy that fits your setup:

**A. Zero-config (recommended, any bundler)** - Vite / webpack 5 / Rollup / Parcel / Next:

```ts
import { setupAuto } from "@simplito/privmx-webendpoint";
await setupAuto();                       // resolves assets via import.meta.url
```

`setupAuto()` is ESM-only (it relies on `import.meta.url`).

> **Vite users:** exclude the SDK from pre-bundling so `import.meta.url` resolves
> the assets against the real package location:
> ```ts
> optimizeDeps: { exclude: ["@simplito/privmx-webendpoint"] }
> ```
> See [`example/vite/vite.config.ts`](example/vite/vite.config.ts) for the full setup.

**B. Per-asset URLs** - when you want explicit control (any unset URL falls back to
`assetsBasePath`):

```ts
import { Endpoint } from "@simplito/privmx-webendpoint";
await Endpoint.setup({
  wasmModuleUrl:   new URL("@simplito/privmx-webendpoint/assets/endpoint-wasm-module.js",   import.meta.url).href,
  wasmUrl:         new URL("@simplito/privmx-webendpoint/assets/endpoint-wasm-module.wasm", import.meta.url).href,
  workerUrl:       new URL("@simplito/privmx-webendpoint/assets/privmx-worker.js",          import.meta.url).href,
  rmsProcessorUrl: new URL("@simplito/privmx-webendpoint/assets/rms-processor.js",          import.meta.url).href,
});
```

`wasmUrl` is wired into the Emscripten `locateFile`, so the `.wasm` can live anywhere.

**C. Copy to a served directory** - no bundler, or you prefer static hosting:

```bash
cp node_modules/@simplito/privmx-webendpoint/assets/* ./public/privmx-assets/
```
```ts
await Endpoint.setup({ assetsBasePath: "/privmx-assets" });
```

| Asset | Purpose |
| --- | --- |
| `endpoint-wasm-module.js` | Emscripten glue (injected by `setup()`) |
| `endpoint-wasm-module.wasm` | The C++ core (~4.4 MB; serve gzip/brotli) |
| `privmx-worker.js` | E2EE web worker (streaming) |
| `rms-processor.js` | Audio-level worklet (streaming) |

Framework copy snippets (for strategy C): **Vite** -
[`vite-plugin-static-copy`](https://www.npmjs.com/package/vite-plugin-static-copy);
**Next.js** - copy into `public/` in a `postinstall`, call `setup()` client-side only;
**webpack** - `CopyWebpackPlugin`.

---

## Common tasks

**Upload a file (Store)** - `createFile` -> `writeToFile` (repeat) -> `closeFile`:

```ts
const storeApi = await connection.getStoreApi();
const handle = await storeApi.createFile(storeId, publicMeta, privateMeta, bytes.length);
await storeApi.writeToFile(handle, bytes);
const fileId = await storeApi.closeFile(handle);
```

Download is the mirror: `openFile` -> `readFromFile` (repeat) -> `closeFile`. The
`/extra` `StreamReader` / `FileUploader` helpers wrap these loops.

**Accept anonymous submissions (Inbox)** - works on a guest connection from
`connectPublic`: `createFileHandle` (per attachment) -> `prepareEntry` ->
`writeToFile` -> `sendEntry`.

**Real-time media (Stream)** - `joinStreamRoom` -> `createStream` -> `addStreamTrack`
-> `publishStream`; receive with `subscribeToRemoteStreams` + `addRemoteStreamListener`.

See the [API reference](https://docs.privmx.dev/docs/latest/reference/webendpoint/api-reference/connection)
for the full surface; every method carries inline docs (hover in your IDE).

---

## Receiving events

Build a subscription query, subscribe, then drive the global queue:

```ts
import { Types } from "@simplito/privmx-webendpoint";

const query = await threadApi.buildSubscriptionQuery(
  Types.ThreadEventType.MESSAGE_CREATE,
  Types.ThreadEventSelectorType.THREAD_ID,
  threadId,
);
await threadApi.subscribeFor([query]);

const queue = await Endpoint.getEventQueue();
for await (const event of queue) {         // ends when queue.emitBreakEvent() fires
  console.log(event.channel, event.type, event.data);
}
```

(`queue.waitEvent()` is still there if you'd rather drive the loop yourself.)

For a higher-level option, every connection exposes a **single event manager**
(`connection.getEventManager()`) that runs the loop and dispatches to **typed**
callbacks for you. Subscribe to events of any module - Threads, Stores, Inboxes,
KVDBs, custom events, user/Context membership and connection-state - through the
one `subscribe()` call, mixing modules freely:

```ts
import {
  Types,
  createThreadSubscription,
  createStoreSubscription,
} from "@simplito/privmx-webendpoint";

const events = await connection.getEventManager();

const ids = await events.subscribe([
  createThreadSubscription({
    type: Types.ThreadEventType.MESSAGE_CREATE,
    selector: Types.ThreadEventSelectorType.THREAD_ID,
    id: threadId,
    callbacks: [(e) => console.log(e.data)], // e.data is typed as Types.Message
  }),
  createStoreSubscription({
    type: Types.StoreEventType.FILE_CREATE,
    selector: Types.StoreEventSelectorType.STORE_ID,
    id: storeId,
    callbacks: [(e) => console.log(e.data)], // e.data is typed as Types.File
  }),
]);

// later
await events.unsubscribe(ids);
```

Build each entry with the typed `create*Subscription` helper for the module you
want (`createThreadSubscription`, `createStoreSubscription`,
`createInboxSubscription`, `createKvdbSubscription`, `createEventSubscription`,
`createUserEventSubscription`, `createConnectionSubscription`). `PrivmxClient`
exposes the same single `getEventManager()` - see the [example](example/vite) and
the API reference.

---

## Error handling

API methods reject with **`NativeError`** for server/crypto failures. Branch on the
exported error-code constants instead of matching message strings:

```ts
import { NativeError, StoreErrorCode } from "@simplito/privmx-webendpoint";

try {
  await storeApi.closeFile(handle);
} catch (e) {
  if (e instanceof NativeError && e.code === StoreErrorCode.FILE_VERSION_MISMATCH) {
    // someone updated the file concurrently - re-open and retry
  }
}
```

`NativeError` carries `code` (number), `scope` (`"Core"`, `"Store"`, …) and
`fullMessage`. Code constants are exported per scope: `CoreErrorCode`,
`ConnectionErrorCode`, `ThreadErrorCode`, `StoreErrorCode`, `InboxErrorCode`,
`KvdbErrorCode`, `EventErrorCode`, `StreamRoomErrorCode`.

---

## Logging

The library is **silent by default**. Opt into diagnostics (or pipe logs to your own
sink) with `setEndpointLogger`:

```ts
import { setEndpointLogger } from "@simplito/privmx-webendpoint";

setEndpointLogger({ level: "warn" });                 // "silent" | "error" | "warn" | "info" | "debug"
setEndpointLogger({ sink: (lvl, label, args) => myLogger.log(label, ...args) });
```

---

## Lifecycle

```
setup()  -->  connect() / connectPublic()  -->  connection.getXApi()  -->  …work…  -->  connection.disconnect()
 (once)        (per session)                   (cached per connection)            (frees all APIs + WASM objects)
```

`disconnect()` invalidates every API created from that connection (including stream
sessions and the E2EE worker) - no manual per-API cleanup is needed. Calling a method
on an API after disconnect throws.

---

## Production checklist

- **Cross-origin isolation:** serve `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp` (see the Vite guide above).
- **Worker threads:** `setup({ workerCount })` sets the async-engine pool (default 4,
  min 2); raise it for heavy parallel file transfers.
- **Memory:** the WASM heap is fixed at 260 MB - stream large files in chunks rather
  than buffering whole files in memory on top of it.
- **Compression:** the `.wasm` is ~4.4 MB; serve it gzip/brotli (brotli ≈ −70%).
- **Errors:** treat `NativeError` as your typed failure channel (see above).

---

## Packaging

The package is **ESM-only** (`"type": "module"`) - tree-shakeable, with `.js`
extensions on all internal imports so it resolves under native Node and every
bundler, and `import.meta.url`-based asset loading via `setupAuto()`. Use it
from a bundler (Vite, webpack 5, Rollup, Next, …) or native ESM; there is no
CommonJS `require` build. For `<script>`-tag / non-bundler usage, a standalone
browser bundle is available at `dist/bundle/privmx-endpoint-web.js`.

> **Subresource Integrity (CDN users):** the `.wasm` is pinned by `build-manifest.sh`.
> If you serve it from a CDN, generate an SRI hash
> (`openssl dgst -sha384 -binary endpoint-wasm-module.wasm | openssl base64 -A`) and
> use a long-lived immutable cache header.

---

## Building from source

Only needed if you change the C++ core; most contributors only touch TypeScript.

**Prerequisites:** Node.js 20+, CMake (for the WASM core), Clang-format v18 (C++ lint).

| Command | Description |
| --- | --- |
| `npm run build` | Full release build: clean -> WASM -> compile TS (ESM) -> bundle (Vite) |
| `npm run build:debug` | Full debug build (see below) |
| `npm run build:wasm` | Compile C++ -> WebAssembly (release flags) |
| `npm run build:js` | Compile TypeScript + bundle assets (no WASM recompile) |
| `npm run compile` | Emit the ESM `dist/` output (tsc + `.js`-extension fixup) |
| `npm run watch:types` | Watch TypeScript |

**Release vs debug** - release is `-O3 -flto`, `ASSERTIONS=0`, `SAFE_HEAP=0`. A debug
build (`npm run build:debug` or `PRIVMX_BUILD_TYPE=debug npm run build:wasm`) swaps in
`-O0 -g -gsource-map` (C++ source-mapped in DevTools), `ASSERTIONS=2`, `SAFE_HEAP=1`,
`STACK_OVERFLOW_CHECK=2`, and `-DDEBUG`. Debug builds are larger and slower - local use only.

---

## Testing

**Unit (Jest):**

```bash
npm test
```

**End-to-end (Playwright + Docker)** - spins up Bridge, Janus, Coturn, MongoDB:

```bash
cd tests && docker compose up -d && cd ..   # start the backend first
npm run test:e2e                            # Chromium
npm run test:e2e:manybrowsers               # all browsers
```

**Lint & format** (oxlint + oxfmt; clang-format for C++):

```bash
npm run lint            # TypeScript
npm run lint:docs       # doc-quality checker
npm run lint:clang-format
npm run format          # auto-format TS
```

---

## License

Licensed under the **PrivMX Free License**. Copyright © Simplito. All rights reserved.
