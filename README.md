# PrivMX Web Endpoint

**PrivMX Web Endpoint** is a robust JavaScript library designed for the browser environment. It serves as the client-side gateway to PrivMX Bridge secure communication channels, enabling applications to encrypt, decrypt, and manage data securely.

Under the hood, it wraps the native **PrivMX Endpoint** library (written in C++) using **WebAssembly (Wasm)**. This architecture ensures high-performance cryptography while providing a developer-friendly JavaScript API.

## Key Features

* **End-to-End Encryption (E2EE):** Client-side encryption for all data transfers.
* **Universal Tools:** Build complex communication logic using simple primitives:
* **Threads:** For contextual messaging and collaboration.
* **Stores:** For secure file and data storage.
* **Inboxes:** For secure, one-way communication with external or anonymous users (e.g., public forms)
* **Kvdbs:** For encrypted key-value database storage
* **Events queue:** For real-time updates and system event handling.

* **Performance:** Powered by a C++ core compiled to WebAssembly.
* **Type-Safe:** Fully typed with TypeScript definitions included.

## Installation

Install the package via npm:

```bash
npm install @simplito/privmx-webendpoint

```

### Documentation & Examples

* **Getting Started Guide:** [Introduction to PrivMX JS](https://docs.privmx.dev/docs/latest/js/introduction)
* **API Reference:** [Full API Documentation](https://docs.privmx.dev/docs/latest/reference/webendpoint/api-reference/connection)

## Building

If you want to build the library from source, follow these steps.

### Prerequisites

* Node.js
* CMake: Required to build the Wasm core (npm run build:wasm).
* Clang-format (v18): Required for formatting and linting of C++ code

### Build Scripts

The project uses a combined pipeline to compile the C++ core to Wasm and bundle the TypeScript code.

| Command | Description |
| --- | --- |
| `npm run build` | Full release build: Clean → Build Wasm → Compile TS → Bundle Webpack. |
| `npm run build:debug` | Full debug build (see below). |
| `npm run build:wasm` | Compiles the C++ source to WebAssembly (release flags). |
| `npm run build:wasm:debug` | Compiles the C++ source to WebAssembly (debug flags). |
| `npm run build:js` | Compiles TypeScript (`tsc`) and bundles assets (`webpack`). |
| `npm run watch:types` | Watches for TypeScript changes. |

### Release vs Debug builds

By default all builds are **release** builds: `-O3`, LTO enabled, `ASSERTIONS=0`, `SAFE_HEAP=0`.

A **debug** build swaps in the following flags for the WASM module:

| Flag | Release | Debug |
| --- | --- | --- |
| Optimisation | `-O3` + `-flto` | `-O0 -g` |
| Emscripten assertions | `ASSERTIONS=0` | `ASSERTIONS=2` |
| Heap safety checks | `SAFE_HEAP=0` | `SAFE_HEAP=1` |
| Stack overflow check | off | `STACK_OVERFLOW_CHECK=2` |
| Demangled stack traces | off | `DEMANGLE_SUPPORT=1` |
| C++ `DEBUG` macro | not defined | defined |

```bash
# Full debug build (WASM + JS)
npm run build:debug

# WASM only (faster iteration)
npm run build:wasm:debug

# Or pass the env variable directly to the pipeline script
PRIVMX_BUILD_TYPE=debug npm run build:wasm
```

> **Note:** Debug builds are significantly larger and slower than release builds. Use them only for local development and troubleshooting.

## Testing

The project employs a dual testing strategy: **Jest** for unit logic and **Playwright** for End-to-End (E2E) integration testing.

### Unit Tests

Run standard unit tests using Jest:

```bash
npm test

```

### End-to-End (E2E) Tests

E2E tests require a running Docker backend (PrivMX Bridge). The tests use **Playwright** to spin up browser instances and execute scenarios against the local backend.

```bash
# Run all E2E tests
npm run test:e2e

```

*Note: Ensure Docker is running before executing E2E tests.*

## Linting & Formatting

Maintain code quality using ESLint and Prettier:

```bash
# Check for linting errors

# Typescript
npm run lint
# C++
npm run lint:clang-format

# Auto-format code

# Typescript
npm run format
# C++
npm run format:clang
```

## License

This software is licensed under the **PrivMX Free License**.
Copyright © Simplito. All rights reserved.