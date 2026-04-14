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

## Documentation

**`README.md`**
- Updated Build Scripts table to include `build:debug` and `build:wasm:debug`.
- Added "Release vs Debug builds" section with a comparison table of all flag differences and usage examples.
