# PrivMX Web Endpoint — Code Review

Review of the TypeScript SDK and the project-owned C++/WASM layer.

**Scope reviewed:** ~16k LOC TypeScript (`src/`) + ~4.2k LOC project-owned C++
(`webendpoint-cpp/`, `async-engine/`, `drivers/`). Vendored `emsdk/` and
`dependency_sources/` were excluded.

**Method:** five focused review passes (one per layer). The most severe items
were independently re-verified against the source; those are marked **(verified)**
in the per-layer documents.

> **Note:** `CLAUDE.md` is itself out of date — it states the ECC layer uses
> `elliptic`, but the code actually uses `@noble/curves` / `@noble/ciphers` /
> `@noble/hashes`. Worth fixing since it misleads reviewers and tooling.

## Documents

| File | Area |
|---|---|
| [01-crypto-layer.md](01-crypto-layer.md) | `src/crypto/` — CryptoFacade, EmCrypto, AEAD, ECC |
| [02-webrtc-streaming.md](02-webrtc-streaming.md) | `src/webStreams/` — per-frame E2EE, key sync, wire formats |
| [03-service-native-ioc-events.md](03-service-native-ioc-events.md) | `src/service/`, `src/native/`, `src/ioc/`, `src/events/` |
| [04-cpp-wasm.md](04-cpp-wasm.md) | `drivers/`, `async-engine/`, `webendpoint-cpp/` |
| [05-build-tooling-types.md](05-build-tooling-types.md) | build config, tsconfig, publish hygiene, `src/extra/`, tests |

## Proposals / Issues

| File | Topic |
|---|---|
| [06-jspi-adoption-plan.md](06-jspi-adoption-plan.md) | Adopt JSPI to remove the thread-per-request concurrency ceiling |

## Fix-first shortlist

1. **GCM nonce strategy for media + data frames** — random 96-bit IV with one
   long-lived key (crypto risk on long / high-FPS sessions). *(verified)*
2. **C++ driver memory-safety on the JS→C++ return path** — `randomBytes`
   overread and `aeadEncrypt` size underflow. *(verified)*
3. **`disconnect()` leaks all native objects on the error path** — teardown is
   skipped if `native.disconnect()` rejects. *(verified)*
4. **Global handler/verifier leaks defeat the WeakMap GC design** —
   `StreamApiNative` and `setUserVerifier` never remove their `window.*` entries.
5. **`Api.resolveResult` can wedge the entire async bridge** — no null guard in
   the single global result callback. *(verified)*
6. **`KeyStore.setKeys` is destructive-then-repopulate** — a key rotation racing
   a live frame can permanently kill the media pipeline.
7. **`strictNullChecks: false` in a crypto library** — the cheapest correctness
   layer is half-disabled.

## Cross-cutting themes

- **Test coverage is the biggest systemic gap.** The most security-critical,
  hand-rolled code — wire-format parsers (`DataChannelCryptor`,
  `EncryptTransform`), sequence/replay logic, the key-sync handshake, ECC
  sign/verify, and all teardown error paths — is essentially untested. Unit
  tests run in a Node environment that cannot exercise the worker / WebRTC paths.
- **Teardown / error paths leak.** A recurring pattern across both TS and C++:
  the happy path frees resources, but rejections/exceptions skip cleanup
  (`disconnect`, `freeApis`, global `window` handlers, native pointers on
  mid-connect failure). `try/finally` + `Promise.allSettled` closes most of these.
- **Defense-in-depth on untrusted input.** Both the media-frame parser (TS) and
  the driver return-path (C++) trust lengths/sizes without bounds checks.
  Validate before slicing / `memcpy`.

## Severity legend

| Severity | Meaning |
|---|---|
| **Critical** | Memory-safety, key-material, or "breaks crypto" risk; fix before release. |
| **High** | Correctness/leak bug with a realistic trigger; fix soon. |
| **Medium** | Real bug with a narrow trigger, or important hardening. |
| **Low** | Minor correctness, consistency, or hygiene. |
