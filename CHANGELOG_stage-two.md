# Changelog — refactor/stage-two

Changes introduced during this session on top of the `feat/refactor-driver-context` base.

---

## TypeScript — Dead Code Removal

**`src/webStreams/Logger.ts`**
- Removed `LogLevel` enum, `setLevel()`, `getLevel()`. Log level is now a plain `number` constant.

**`src/webStreams/Utils.ts`**
- Removed `generateNumericId()` (no callers).

**`src/webStreams/Queue.ts`**
- Removed `QueueTask<T>` interface and 7 unused methods: `dequeue`, `peek`, `size`, `isEmpty`, `clear`, `toArray`, `[Symbol.iterator]`.
- Replaced `Math.random()` task IDs with a sequential `itemIndex` counter.

**`src/webStreams/WebRtcClientTypes.ts`**
- Removed `taskId` from `QueueItem`. Renamed field `_room` → `room`.

**`src/service/WebRtcInterface.ts`**
- Removed 5 dead exported types: `StreamsUpdatedData`, `UpdatedStreamData`, `CurrentPublishersData`, `NewPublisherEvent`, `VideoRoomStreamTrack`.
- Narrowed `Jsep.type` from `string` to `RTCSdpType`.

**`src/webStreams/types/ApiTypes.ts`**
- Removed 8 unused exports: `ListQuery`, `StreamAndTracksSelector`, `TrackType`, `StreamRemoteInfo`, `StreamList`, `StreamTrackList`, `PublishMeta`, `TrackInfo`.

**`src/webStreams/types/` — deleted files**
- `BaseServerTypes.ts`
- `MediaServerWebSocketApiTypes.ts`
- `SignalingReceiverTypes.ts`
- `SignalingSenderTypes.ts`
- `StreamsApiTypes.ts`

---

## TypeScript — Type Safety

**`src/webStreams/worker/WorkerEvents.ts`**
- Complete rewrite to discriminated union types: `WorkerInboundEvent` and `WorkerOutboundEvent`.
- Eliminated all `(self as any).postMessage` casts.

**`src/webStreams/worker/worker.ts`**
- Fully typed message handler via `MessageEvent<WorkerInboundEvent>`.
- `(encodedFrame as any).type` replaced with proper `RTCEncodedVideoFrame` cast.
- Added local `RTCTransformEvent` interface (missing from TypeScript's lib).
- `TransformStreamDefaultController<any>` → `<unknown>`.

**`src/api/StreamApiNative.ts`**
- Replaced `(window as any).webRtcInterfaceToNativeHandler` with typed `WindowWithWasmHandler` interface from `webStreams/types/WebRtcExtensions.ts`.

**`src/webStreams/types/WebRtcExtensions.ts`**
- Added `WindowWithWasmHandler` and `RTCConfigurationWithInsertableStreams` interfaces.

---

## TypeScript — Coupling Fixes

**`src/webStreams/WebRtcClient.ts`**
- Removed `getPublisherPeerConnection()` — was leaking raw `RTCPeerConnection` through the public API.
- Added `createPublisherOffer(roomId)` and `setPublisherRemoteDescription(roomId, sdp, type)` in its place.
- Removed mutable instance field `publishStreamHandle`; `streamHandle` now flows as a parameter through the factory callback into per-connection closures in `PeerConnectionManager`.
- `removeSenderPeerConnectionOnUnpublish` now routes through `closeConnection()` instead of mutating `PeerConnectionManager`-owned state directly (`session.pc = undefined` removed).
- Added `bindApiInterface(iface)` public method and `private streamsApiInterface: StreamsCallbackInterface | undefined` field with explicit null-guard, replacing implicit temporal coupling.
- Fixed `AudioManager` RMS callback — now delegates to `e2eeTransformManager.sendLocalRms(rms)` instead of posting raw worker messages directly.
- Import of `StreamTrack` moved from `../service/StreamApi` to `./types/ApiTypes` (upward dependency removed).

**`src/webStreams/E2eeTransformManager.ts`**
- Added `sendLocalRms(rms: number): Promise<void>` — encapsulates the worker RMS message protocol so callers don't need to know about the worker message format.

**`src/webStreams/PeerConnectionsManager.ts`**
- `createPeerConnection` factory callback extended to accept optional `streamHandle?: StreamHandle`.
- `initialize()` gains optional `streamHandle?: StreamHandle` 4th parameter, forwarded to the factory.

**`src/webStreams/WebRtcInterfaceImpl.ts`**
- `createOfferAndSetLocalDescription` now calls `client.createPublisherOffer()`.
- `setAnswerAndSetRemoteDescription` now calls `client.setPublisherRemoteDescription()`.
- No longer imports or touches `RTCPeerConnection`, `RTCSessionDescription`, `CurrentPublishersData`, or `StreamsUpdatedData`.
- Removed dead `getClient()` null-guard (constructor parameter is non-optional).

**`src/service/StreamApi.ts`**
- `StreamTrack` interface removed from this file — moved to `src/webStreams/types/ApiTypes.ts`.
- Import updated accordingly.

**`src/webStreams/types/ApiTypes.ts`**
- `StreamTrack` interface added here, consolidating it with `StreamTrackId`, `DataChannelMeta`, and `StreamTrackInit`.

---

## TypeScript — `EndpointFactory.setup()` worker count parameter

**`src/service/EndpointFactory.ts`**
- `setup()` signature changed from `(assetsBasePath?: string)` to `(options?: string | EndpointSetupOptions)` — fully backward-compatible; a plain string is still accepted.
- New `EndpointSetupOptions` interface exported: `{ assetsBasePath?: string; workerCount?: number }`.
- When `workerCount` is provided, sets `window.__privmxWorkerCount` before calling `endpointWasmModule()` so the C++ `AsyncEngine` constructor reads it during WASM initialisation on the worker thread (avoids blocking-on-main-thread abort).

---

## C++ — Configurable worker count

**`async-engine/src/AsyncEngine.cpp`**
- Added `EM_JS readWorkerCountFromJs()` that reads `window.__privmxWorkerCount`.
- `AsyncEngine::AsyncEngine()` now reads that global and uses it as the pool size (defaults to 4 if absent or `< 2`).

**`async-engine/include/AsyncEngine.hpp`**  
No public API changes — `setWorkerCount` was considered and removed in favour of the pre-init global approach.

---

## C++ — Debug / Release build variants

**`webendpoint-cpp/CMakeLists.txt`**
- Added `PRIVMX_BUILD_TYPE` CMake cache variable (`release` by default).
- **Release** (unchanged): `-O3`, LTO (`-flto`), `ASSERTIONS=0`, `SAFE_HEAP=0`.
- **Debug** (new): `-O0 -g`, `ASSERTIONS=2`, `SAFE_HEAP=1`, `STACK_OVERFLOW_CHECK=2`, `DEMANGLE_SUPPORT=1`, `-DDEBUG`, no LTO.

---

## Build system — debug/release npm scripts

**`package.json`**
- Added `build:wasm:debug` — `PRIVMX_BUILD_TYPE=debug scripts/pipeline.sh`.
- Added `build:debug` — full pipeline using `build:wasm:debug`.

**`scripts/pipeline.sh`**
- Reads `PRIVMX_BUILD_TYPE` from environment (defaults to `release`).
- Prints build type in the banner.
- Passes build type as second argument to `build_api`.

**`scripts/build_api`**
- Accepts optional second argument `debug|release`.
- Passes `-D PRIVMX_BUILD_TYPE=...` to cmake.
- Reconfigures automatically when build type changes between runs (detected via `CMakeCache.txt` grep).

---

## Build system — removed custom checksum cache

The project previously had a hand-rolled incremental build cache (`check_dir_checksum`, `/tmp/dir_checksum.*.prev` state files, `need_rebuild` sentinel files, `/tmp/privmx_endpoint_last_built_version`). This was replaced by relying on CMake's native `CMakeCache.txt` and Make's dependency tracking.

**`scripts/check_dir_checksum`** — deleted.

**All build scripts** (`build_gmp`, `build_poco`, `build_pson`, `build_secp`, `build_async_engine`, `build_webdrivers`, `build_privmx_endpoint`, `build_api`):
- Removed `check_dir_checksum` calls, `RESULT` case/esac blocks, and `need_rebuild` sentinel logic.
- Configure step is now guarded by `if [ ! -f CMakeCache.txt ]` (CMake projects) or `if [ ! -f Makefile ]` (GMP autoconf).
- `emmake make -j20` always runs — Make's own dependency graph skips unchanged translation units.

---

## Tests — worker count

**`tests/specs/core.spec.ts`**
- Added `measureSendMessages()` helper: reloads the page, calls `setup({ assetsBasePath, workerCount })`, creates a thread, fires `Promise.all(N × sendMessage)`, returns elapsed ms.
- Added test **"CoreTest: Worker count / EndpointFactory.setup() initialises WASM with the requested worker count"**: runs at 2, 4, 8, and 16 workers, logs timings; asserts all runs complete without throwing.
- Added `measureSignData()` helper: same page-reload pattern but fires `Promise.all(200 × signData)` — pure CPU-bound secp256k1 ECDSA, no network.
- Added test **"Worker count scales CPU-bound crypto throughput (signData)"**: hard asserts `times["4w"] < times["2w"]` and `times["8w"] < times["4w"]`, validating that the worker count parameter actually controls parallelism.

---

## TypeScript — Dependency Direction (`service/` → `webStreams/`)

**`src/webStreams/EventDispatcher.ts`** — new file (moved from `src/service/EventDispatcher.ts`)
- `StateChangeDispatcher`, `StateChangeEvent`, `StateChangeFilter`, `StateChangeListener` now live in `webStreams/`.
- `src/service/EventDispatcher.ts` deleted.
- `WebRtcClient.ts` import updated: `"../service/EventDispatcher"` → `"./EventDispatcher"`.

**`src/webStreams/types/ApiTypes.ts`**
- Added `Jsep` interface (moved out of `src/service/WebRtcInterface.ts`).

**`src/service/WebRtcInterface.ts`**
- Removed local `Jsep` definition; now imports it from `../webStreams/types/ApiTypes`.
- `SdpWithRoomModel extends Jsep` still works via the imported type.

**`src/api/StreamApiNative.ts`**
- `Jsep` import updated: `"../service/WebRtcInterface"` → `"../webStreams/types/ApiTypes"`.
- Removed unused `SdpWithRoomModel` import.

---

## TypeScript — `WebRtcInterfaceImpl` dead code and typing

**`src/webStreams/WebRtcInterfaceImpl.ts`**
- Removed `getClient()` method — it only guarded `this.webRtcClient` which is a non-optional constructor parameter; the guard was permanently dead. All call sites now use `this.webRtcClient` directly.
- Introduced `MethodMap` type — a concrete record mapping each method name to its exact signature, replacing `{ [K: string]: Function }`.
- `methodsMap` entries use `.bind(this)` instead of the previous `this.methodsMap[name].call(this, params)` hack.
- `methodCall` parameter narrowed from `params: any` / `Promise<any>` to `params: unknown` / `Promise<unknown>`.
- `Jsep` import moved from `"../service/WebRtcInterface"` to `"./types/ApiTypes"`.

---

## TypeScript — `service/WebRtcInterface.ts` dissolved into `webStreams/`

**`src/webStreams/WebRtcInterface.ts`** — new file (replaces `src/service/WebRtcInterface.ts`)
- Contains all types previously in `service/WebRtcInterface.ts`: `UpdateKeysModel`, `RoomModel`, `SdpWithRoomModel`, `CreateAnswerAndSetDescriptionsModel`, `SetAnswerAndSetRemoteDescriptionModel`, `WebRtcInterface`.
- Added `WebRtcMethodCall` discriminated union — exhaustive tagged union of every method the C++ WASM layer can invoke, with per-method `params` types.
- `src/service/WebRtcInterface.ts` deleted — no remaining importers.

**`src/webStreams/WebRtcInterfaceImpl.ts`**
- `MethodMap` type now derived from `WebRtcMethodCall` using mapped/conditional types: `{ [K in WebRtcMethodCall["name"]]: (params: Extract<WebRtcMethodCall, { name: K }>["params"]) => Promise<unknown> }`. Adding or removing a method from `WebRtcMethodCall` produces a compile error here automatically.
- `updateSessionId` entry in `methodsMap` uses an inline arrow that destructures `params.streamRoomId / sessionId / connectionType` — matching the discriminated union's `params` shape.
- Imports changed from `"../service/WebRtcInterface"` → `"./WebRtcInterface"`.

---

## Build system — debug/release for async engine and drivers

**`async-engine/CMakeLists.txt`**
- Added `PRIVMX_BUILD_TYPE` cache variable (same pattern as `webendpoint-cpp`).
- Debug: `-O0 -g -DDEBUG`. Release: `-O3`.

**`drivers/privmx-webendpoint-drv-crypto/CMakeLists.txt`**  
**`drivers/privmx-webendpoint-drv-ecc/CMakeLists.txt`**  
**`drivers/privmx-webendpoint-drv-net/CMakeLists.txt`**
- Same `PRIVMX_BUILD_TYPE` pattern added to all three.

**`scripts/build_async_engine`**
- Reads `PRIVMX_BUILD_TYPE` from environment (defaults to `release`).
- Reconfigures when build type changes (same CMakeCache.txt detection as `build_api`).
- Passes `-D PRIVMX_BUILD_TYPE=...` to cmake.

**`scripts/build_webdrivers`**
- Same changes as `build_async_engine`, applied to all three driver builds.
- Extracted a `configure_if_needed` helper to avoid repeating the detection logic three times.

---

## Build system — `clean:wasm` script

**`scripts/clean_wasm`** — new script
- Removes `build-emscripten/` from every first-party C++ component (async engine, webendpoint api, all three drivers) and every third-party dependency under `dependency_sources/`.
- Running this followed by `npm run build:wasm` guarantees a fully clean rebuild from configured sources.

**`package.json`**
- Added `"clean:wasm": "scripts/clean_wasm"` script.

---

## Tests — `EndpointFactory.setup()` object form

**`tests/specs/core.spec.ts`**
- Added describe block `"CoreTest: EndpointFactory.setup() object form"` with two tests:
  - **`setup({ assetsBasePath })` without `workerCount`** — reloads page, calls the object form, connects to bridge, verifies connection and key derivation work end-to-end.
  - **`setup({ assetsBasePath, workerCount: 6 })`** — reloads page, calls with explicit worker count, waits for pthreads, asserts `signData` returns a non-empty signature.

---

## Documentation

**`README.md`**
- Updated Build Scripts table to include `build:debug` and `build:wasm:debug`.
- Added "Release vs Debug builds" section with a comparison table of all flag differences and usage examples.

---

## TypeScript — `webStreams/` Dependency Injection Refactor

Broke the 9-dependency `WebRtcClient` god class into focused, single-responsibility services wired together via constructor injection. `WebRtcClient` is now a thin facade whose every method body is a one-liner delegation.

### New files

**`src/webStreams/PublisherManager.ts`**
- Owns the publisher-side peer connection for a stream room.
- Responsibilities: initialise publisher PC, add/remove media tracks, install E2EE sender transforms, start/stop local audio level metering, create SDP offer, set remote description, session ID updates.

**`src/webStreams/SubscriberManager.ts`**
- Owns the subscriber-side peer connection for a stream room.
- Responsibilities: SDP offer/answer reconfigure queue (serialised via `Queue<QueueItem>`), bootstrap data channel creation, `lastProcessedAnswer` state, ICE connection wait before installing receiver transforms, `ended` track teardown, session ID updates.

**`src/webStreams/DataChannelSession.ts`**
- Owns all encrypted data channel state for one client session.
- Outbound: increments a single monotonic sequence number and calls `DataChannelCryptor.encryptToWireFormat`.
- Inbound: tracks last-seen sequence number per remote stream ID, calls `DataChannelCryptor.decryptFromWireFormat`.
- Replaces the scattered `sequenceNumberOfSender` field and `sequenceNumberByRemoteStreamId` map that previously lived in `WebRtcClient` and `PeerConnectionFactory` respectively.

**`src/webStreams/KeySyncManager.ts`**
- Single method `updateKeys(streamRoomId, keys)` — atomically calls `KeyStore.setKeys()` (main-thread AEAD key registry) and `E2eeWorker.setKeys()` (worker-thread key registry) so they never drift.

**`src/webStreams/PeerConnectionFactory.ts`**
- Builds `RTCPeerConnection` instances with all event listeners wired: ICE/connection-state logging, `connectionstatechange` → `StateChangeDispatcher`, `datachannel` → decrypt-and-dispatch via `DataChannelSession`, `track` → forwarded to `SubscriberManager` via callback.
- Owns TURN credential storage (`setTurnCredentials`); generates `RTCConfiguration` inline (replaces `WebRtcConfig`).
- Injects `DataChannelSession` for data channel decryption instead of owning `DataChannelCryptor` and a sequence-number map directly.

### Changed files

**`src/webStreams/WebRtcClient.ts`** — rewritten as thin DI facade
- Constructor reduced from 9 raw infrastructure objects to 8 grouped dependencies:
  - `publisher: PublisherManager` — outbound media cluster
  - `subscriber: SubscriberManager` — inbound SDP/track cluster
  - `dataChannel: DataChannelSession` — data channel encryption cluster
  - `keys: KeySyncManager` — key synchronisation cluster
  - `eventsDispatcher: StateChangeDispatcher` — cross-cutting
  - `listenerRegistry: RemoteStreamListenerRegistry` — cross-cutting
  - `pcFactory: PeerConnectionFactory` — construction plumbing
  - `audioManager: AudioManager` — audio level callbacks
- Every public method is now a single delegation call; no business logic remains in the facade.
- `static create(assetsDir)` is the sole place where concrete types are instantiated; the rest of the class works exclusively through injected interfaces.
- Removed `reconfigureSingle`, `waitUntilConnected`, `addRemoteTrack` / `onRemoteTrack` — moved to `SubscriberManager`.
- Removed `createPeerConnectionMultiForRoom` — moved to `PeerConnectionFactory`.
- `closeConnection` and `updateConnectionSessionId` now dispatch by `connectionType` to `publisher.close` / `subscriber.close` and `publisher.updateSessionId` / `subscriber.updateSessionId` respectively, without exposing `PeerConnectionManager` through the facade.

**`src/webStreams/PeerConnectionsManager.ts`** — simplified
- Removed `configuration` / `RTCConfiguration` parameter from constructor; configuration is now owned by `PeerConnectionFactory`.
- `createPeerConnection` factory callback signature unchanged; factory closure captures TURN credentials directly.
- Minor cleanup: guard conditions consolidated, `candidateQueue` flush uses a `for...of` loop.

### Deleted files

**`src/webStreams/WebRtcConfig.ts`** — deleted
- The single static method `generateTurnConfiguration()` is inlined into `PeerConnectionFactory.create()`. No callers remain.

---

## Bug fix — ICE trickle candidate serialisation

**`src/api/StreamApiNative.ts`**

- Replaced `JSON.stringify(candidate)` in `trickle()` with a new `private static serializeCandidate(c: RTCIceCandidate): string` helper.
- **Root cause**: `RTCIceCandidate.toJSON()` (which `JSON.stringify` calls) emits only four fields — `candidate`, `sdpMid`, `sdpMLineIndex`, `usernameFragment`. PrivMX Bridge requires `address` (a `stringOrNull` field) and rejects requests where it is absent, logging `rtcCandidate -> Key 'address' is required`.
- **Fix**: `serializeCandidate` copies every property directly from the `RTCIceCandidate` object (the browser already parses all SDP fields into typed properties). All 14 fields are emitted; fields that are `null` in the browser object are serialised as JSON `null`.
  - Fields serialised: `address`, `candidate`, `component`, `foundation`, `port`, `priority`, `protocol`, `relatedAddress`, `relatedPort`, `sdpMLineIndex`, `sdpMid`, `tcpType`, `type`, `usernameFragment`.

---

## Bug fix — E2E data-channel encryption test timing

**`tests/specs/streamDataChannels.spec.ts`**

- Fixed `"E2E: data channel frames are encrypted on the wire and decrypted at the receiver"` timing out at 60 s.
- **Root cause**: the previous implementation sent the plaintext message once (with a catch-retry loop) and then polled page1 for receipt. If `sendData` did not throw — because U2's data channel was open — the retry loop exited, even though U1's subscriber WebRTC data channel may not have been established yet. U1 would never receive that single send.
- **Fix**: Steps 4 and 5 are merged into a single concurrent step:
  - U2 runs a background send loop that sends every second for up to 30 s, continuing after each successful or failed send (stopping only when `__stopSend` is set by the test runner).
  - U1 concurrently polls `window.__received` via `expect.poll` with a 30 s timeout.
  - Once U1 receives the message, the test runner sets `__stopSend` on page2 and awaits the send loop.
  - This guarantees at least one message arrives at U1 regardless of when the subscriber WebRTC connection establishes.
- Overall test timeout raised from 60 s to 90 s to accommodate the extended connection window.

---

## Bug fix — `RTCRtpScriptTransform` missing `kind` breaks video frame header layout

**`src/webStreams/E2eeTransformManager.ts`**

- `setupSenderTransform`: added `kind: sender.track?.kind` to the `RTCRtpScriptTransform` options object passed to the worker.
- `setupReceiverTransform`: added `kind: receiver.track.kind` to the `RTCRtpScriptTransform` options object passed to the worker.
- **Root cause**: The `kind` field was never forwarded through `RTCRtpScriptTransformOptions`. The worker's `onrtctransform` handler received `kind === undefined`, causing `EncryptTransform` to treat video frames as audio (`headerLen = 1` instead of the video-correct 10 / 3 / 1 bytes). Both the encoder and decoder used the same wrong header length, so AES-GCM AAD matched and decryption did not fail — but the unencrypted header was too short, leaving 9 bytes of codec-critical data encrypted for key frames and 2 bytes for delta frames.
- **Effect**: In the basic streaming path the video decoder tolerated the broken header layout. In the Page Reload & Recovery scenario a fresh subscriber peer connection received frames whose codec headers were partially encrypted; the decoder could not produce a first decodable frame, so `readyState` never advanced beyond 0 regardless of how long the stream ran.
- **Fix**: `kind` is now always included in the options. The worker's `onrtctransform` handler already reads it; `handleTransform` propagates it to `EncryptTransform.encryptFrame` / `decryptFrame` where it selects the correct header length.

**`src/webStreams/types/WebRtcExtensions.ts`**

- Added `kind?: string` to `RTCRtpScriptTransformOptions` interface so the new field compiles without a cast.

**`src/webStreams/worker/worker.ts`**

- `onrtctransform` handler: added `?? "video"` fallback when `kind` is absent (guards against older callers that pre-date this fix).

---

## Refactor — IoC Container for the full TypeScript service layer

Introduced a minimal async IoC container (`Container`) and a token registry (`Tokens`) that now govern the entire object graph — from the WASM `Api` singleton down to per-connection API instances and the WebRTC sub-graph. `EndpointFactory` is reduced to a thin facade that delegates all construction to containers.

### New files

**`src/service/Container.ts`**
- 43-line async IoC container; no framework, no decorators, no reflect-metadata.
- Three registration modes: `registerSingleton` (factory called once, result cached), `registerTransient` (factory called on every resolve), `registerValue` (pre-built instance stored as a resolved singleton).
- Circular dependencies are broken by resolving inside callback closures that execute after all registrations are set up.

**`src/service/Tokens.ts`**
- String-literal token constants for every managed object; scope prefix encodes lifetime:
  - `global:` — created once in `EndpointFactory.setup()`, live for the application lifetime (`Api`, `AssetsBasePath`, `EventQueue`, `CryptoApi`).
  - `conn:` — created once per `Connection` instance (`ThreadApi`, `StoreApi`, `KvdbApi`, `EventApi`, `InboxApi`, `StreamApi`, `ConnectionPtr`).
  - `rtc:` — created once per `createStreamApi()` call, scoped to the WebRTC session.

**`src/service/buildConnectionApis.ts`**
- `registerGlobalServices(c, api, assetsBasePath)` — registers `EventQueue` and `CryptoApi` as global singletons.
- `registerConnectionServices(c, api, assetsBasePath)` — registers all six connection-scoped API singletons. Dependency rules encoded as container registrations:
  - `InboxApi` lazily resolves `ThreadApi` + `StoreApi` from the same container (no caller needs to pass them explicitly).
  - `StreamApi` lazily resolves `EventApi`, then creates an isolated WebRTC sub-graph container and calls `registerWebRtcServices`.
- All factories still populate `connection.apisRefs` / `connection.nativeApisDeps` so `Connection.disconnect()` cleanup is unchanged.

**`src/service/buildWebRtcClient.ts`**
- `registerWebRtcServices(c)` — registers all `rtc:*` singletons (`KeyStore`, `DataChannelCryptor`, `DataChannelSession`, `StateChangeDispatcher`, `ListenerRegistry`, `E2eeWorker`, `E2eeTransformManager`, `AudioManager`, `WebRtcClient`).
- `buildWebRtcClient(c)` — resolves deps, creates `PeerConnectionFactory` and `PeerConnectionManager` with lazy callback closures (breaking the `PeerConnectionFactory → SubscriberManager` and `PeerConnectionManager → WebRtcClient` cycles), registers all internally-constructed objects back into the container, returns the `WebRtcClient`.

### Changed files

**`src/service/EndpointFactory.ts`** — reduced to a facade
- Static `api: Api` field retained for synchronous access during connection creation.
- `init()` calls `registerGlobalServices(globalContainer, api, assetsBasePath)` instead of wiring objects inline.
- `getEventQueue()` and `createCryptoApi()` delegate to `globalContainer.resolve(T.EventQueue / T.CryptoApi)`.
- `connect()` / `connectPublic()` use `this.api` directly (no container resolution needed — connection creation is not a singleton).
- `getConnectionContainer(connection)` — lazily creates a per-connection `Container`, registers `T.ConnectionPtr`, calls `registerConnectionServices`, and caches it in a `WeakMap<Connection, Container>` (no memory leak when connections are GC'd).
- All six `createXApi` methods are now one-liner delegators: `return this.getConnectionContainer(connection).resolve<XApi>(T.XApi)`.
- `createInboxApi(connection, _threadApi?, _storeApi?)` — `threadApi` / `storeApi` parameters made optional and ignored; the container resolves them automatically. **Signature is backwards-compatible.**
- `createStreamApi(connection, _eventApi?)` — same pattern; `eventApi` parameter made optional and ignored. **Backwards-compatible.**
- `CryptoApi` is now a **global singleton**: the same instance is returned on every `createCryptoApi()` call (previously a fresh instance was constructed each time).

**`src/api/StreamApiNative.ts`**
- Constructor signature changed: `constructor(api: Api, private readonly webRtcInterfaceImpl: WebRtcInterfaceImpl)` — takes the already-built `WebRtcInterfaceImpl` instead of a `WebRtcClient`. The native layer no longer owns or constructs the interface bridge.
- Removed `WebRtcClient` and `SessionId` imports.
- Removed `webRtcInterfacePtr` field and the `bindApiInterface` wiring that was in the old constructor.
- `bindWebRtcInterfaceAsHandler` renamed to `registerWebRtcInterfaceHandler` (private); no longer constructs a new `WebRtcInterfaceImpl` — uses the one passed at construction.
- `selfPtr` changed from `protected` to `public` so `EndpointFactory` can reference it in the trickle/acceptOffer closures it wires after `newApi()`.

**`src/webStreams/WebRtcClient.ts`**
- Removed `static create(assetsDir)` factory method — construction is now entirely in `buildWebRtcClient.ts` via the IoC container.
- Added `trickle(sessionId, candidate): Promise<void>` public method — delegates to `streamsApiInterface.trickle(...)` with a null-guard, so `buildWebRtcClient.ts` can route ICE candidates without accessing the private `streamsApiInterface` field.
- Removed imports for `KeyStore`, `DataChannelCryptor`, `PeerConnectionManager`, `E2eeWorker`, `E2eeTransformManager` — no longer needed after removal of `static create`.

---

## Bug fix — subscriber bootstrap data channel created unconditionally on every reconfigure

**`src/webStreams/SubscriberManager.ts`**

- In the refactored code, a `bootstrapDataChannels: Map<StreamRoomId, RTCDataChannel>` guard was introduced that correctly prevented duplicate data channel creation per room. However, Janus requires a `"JanusDataChannel"` data channel to appear in **every** offer/answer exchange so that the data-channel `m=` section is present in the SDP the subscriber sends back.
- **Root cause of the regression**: The original `WebRtcClient` code declared `private bootstrapDataChannel: RTCDataChannel | undefined` but never assigned it, making the guard `if (!this.bootstrapDataChannel)` permanently `true` — a data channel was created on every `reconfigureSingle` call. The refactor accidentally introduced a working guard that broke Janus SDP negotiation.
- **Fix**: The `bootstrapDataChannels` Map is removed. `reconfigureSingle` creates `pc.createDataChannel("JanusDataChannel")` unconditionally at the top of every call, matching the original behaviour.
