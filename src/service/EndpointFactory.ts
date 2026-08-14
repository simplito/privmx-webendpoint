/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { Api } from "../native/Api.js";
import { ConnectionNative } from "../native/ConnectionNative.js";
import { FinalizationHelper } from "../FinalizationHelper.js";
import { PKIVerificationOptions } from "../Types.js";
import { Connection } from "./Connection.js";
import type { ConnectionServices } from "./Connection.js";
import { CryptoApi } from "./CryptoApi.js";
import { EventApi } from "./EventApi.js";
import { EventQueue } from "./EventQueue.js";
import { InboxApi } from "./InboxApi.js";
import { KvdbApi } from "./KvdbApi.js";
import { StoreApi } from "./StoreApi.js";
import { StreamApi } from "./StreamApi.js";
import { ThreadApi } from "./ThreadApi.js";
import { GlobalContainer, ConnectionContainer } from "../ioc/Container.js";
import { T, ResolvedAssetUrls } from "../ioc/Tokens.js";
import { registerGlobalServices, registerConnectionServices } from "../ioc/buildConnectionApis.js";
import { setGlobalEmCrypto } from "../crypto/index.js";
import { ExtKey } from "./ExtKey.js";
import { EventLoop } from "../events/EventLoop.js";

/**
 * //doc-gen:ignore
 */
declare function endpointWasmModule(moduleOverrides?: {
    locateFile?: (path: string, scriptDirectory: string) => string;
}): Promise<any>; // Provided by emscripten js glue code

/**
 * Options accepted by {@link EndpointFactory.setup}.
 *
 * Two ways to point the SDK at its three runtime assets:
 * - **Single directory** (simplest): set `assetsBasePath` to a folder that
 *   serves all three files.
 * - **Per-asset URLs** (bundler-native): set `wasmModuleUrl` / `wasmUrl` /
 *   `workerUrl` individually - typically with
 *   `new URL("…", import.meta.url).href` so a bundler (Vite, webpack 5, …)
 *   fingerprints and serves each asset without a manual copy step. Any URL left
 *   unset falls back to `assetsBasePath` + the default filename.
 */
export interface EndpointSetupOptions {
    /**
     * URL or path of the directory the WASM assets are served from - the three
     * files copied out of `@simplito/privmx-webendpoint/assets`
     * (`endpoint-wasm-module.js`, `endpoint-wasm-module.wasm`,
     * `privmx-worker.js`). Defaults to `/`. Relative paths
     * are resolved against `document.baseURI`. A wrong path rejects `setup()`
     * with a load error instead of failing later. Ignored for any asset that
     * has an explicit per-asset URL below.
     */
    assetsBasePath?: string;
    /**
     * Absolute URL of the Emscripten glue script `endpoint-wasm-module.js`,
     * injected as a `<script>` tag. Overrides `assetsBasePath` for the glue.
     * Use `new URL("…/endpoint-wasm-module.js", import.meta.url).href` to let a
     * bundler resolve it.
     */
    wasmModuleUrl?: string;
    /**
     * Absolute URL of the WebAssembly binary `endpoint-wasm-module.wasm`. When
     * set, it is supplied to the Emscripten module via `locateFile`, so the
     * binary may live somewhere other than next to the glue script. Defaults to
     * the glue's own directory.
     */
    wasmUrl?: string;
    /**
     * Absolute URL of the E2EE worker `privmx-worker.js` (loaded with
     * `new Worker(url)`). Overrides `assetsBasePath` for the streaming worker.
     */
    workerUrl?: string;
    /**
     * Number of async-engine worker threads the WASM module spawns (default 4,
     * clamped to a minimum of 2). Each worker holds a view of the shared WASM
     * memory; raise this for heavily parallel file transfers.
     */
    workerCount?: number;
}

/**
 * Static entry point of the SDK: loads the WebAssembly core and creates
 * {@link Connection}s and all API instances.
 *
 * ## Workflow
 * {@link setup} (once per application) → {@link connect} /
 * {@link connectPublic} → {@link createThreadApi} / {@link createStoreApi} /
 * {@link createInboxApi} / … → application work →
 * {@link Connection.disconnect}.
 *
 * API instances are cached per connection - calling `createThreadApi` twice
 * with the same connection returns the same instance - and are invalidated
 * automatically by `disconnect()`.
 *
 * Prefer the higher-level `PrivmxClient` (from
 * `@simplito/privmx-webendpoint/extra`) for new applications; it wraps this
 * factory and manages event loops for you.
 */
export class EndpointFactory {
    private static readonly WORKER_COUNT_MIN = 2;

    private static globalContainer: GlobalContainer;
    private static assets: ResolvedAssetUrls;
    private static api: Api;
    // Cached so concurrent/repeated setup() calls share one WASM load.
    private static setupPromise: Promise<void> | undefined;
    private static eventLoop: Promise<EventLoop> | undefined;

    // WeakMap so containers are GC-eligible when their Connection is dropped.
    private static readonly connectionContainers = new WeakMap<Connection, ConnectionContainer>();

    // Service closures injected into every Connection so it resolves its APIs /
    // event loop without importing this factory (breaks the import cycle).
    private static readonly connectionServices: ConnectionServices = {
        createThreadApi: (c) => EndpointFactory.createThreadApi(c),
        createStoreApi: (c) => EndpointFactory.createStoreApi(c),
        createInboxApi: (c) => EndpointFactory.createInboxApi(c),
        createKvdbApi: (c) => EndpointFactory.createKvdbApi(c),
        createEventApi: (c) => EndpointFactory.createEventApi(c),
        createStreamApi: (c) => EndpointFactory.createStreamApi(c),
        getEventLoop: () => EndpointFactory.getEventLoop(),
    };

    /**
     * Loads the Endpoint's WebAssembly assets and initializes the library. Must
     * complete before any other Endpoint call; safe to call multiple times -
     * concurrent and repeated calls share one initialization (a failed attempt
     * may be retried).
     *
     * Injects a script tag loading `endpoint-wasm-module.js` (from
     * `assetsBasePath` or the explicit `wasmModuleUrl`), instantiates the
     * C++/WASM module (spawning `workerCount` async-engine worker threads on
     * SharedArrayBuffer, which requires COOP/COEP headers; the `.wasm` is
     * located via `wasmUrl` when given), and registers the WebCrypto-based
     * engine the native core uses for all cryptography.
     *
     * Call once at application startup, before {@link connect} /
     * {@link connectPublic}. Workflow: `setup` → {@link connect} →
     * {@link createThreadApi} / {@link createStoreApi} / … →
     * {@link Connection.disconnect}.
     *
     * @param {string | EndpointSetupOptions} [options] options object, or the
     *   `assetsBasePath` string alone (legacy form). Use the per-asset URL
     *   fields of {@link EndpointSetupOptions} for bundler-native loading.
     * @returns {Promise<void>} resolves when the WASM module is fully initialised and ready to use
     * @throws {Error} when an asset fails to load (wrong `assetsBasePath` /
     *   per-asset URL, or assets not copied), or when called outside a browser
     *   environment
     * @example
     * // Simple: all three assets served from one directory.
     * await EndpointFactory.setup({ assetsBasePath: "/privmx-assets" });
     *
     * // Bundler-native: let the bundler resolve each asset (no manual copy).
     * await EndpointFactory.setup({
     *     wasmModuleUrl: new URL("…/endpoint-wasm-module.js", import.meta.url).href,
     *     wasmUrl: new URL("…/endpoint-wasm-module.wasm", import.meta.url).href,
     *     workerUrl: new URL("…/privmx-worker.js", import.meta.url).href,
     * });
     * const connection = await EndpointFactory.connect(userPrivKey, solutionId, bridgeUrl);
     * const threadApi = await EndpointFactory.createThreadApi(connection);
     */
    public static async setup(options?: string | EndpointSetupOptions): Promise<void> {
        if (!this.setupPromise) {
            this.setupPromise = this.doSetup(options).catch((e) => {
                // A failed load must not poison future attempts.
                this.setupPromise = undefined;
                throw e;
            });
        }
        return this.setupPromise;
    }

    /**
     * Guards calls that require an initialised WASM core. Throws a clear error
     * when {@link setup} / `setupAuto` was never started, and otherwise waits
     * for an in-flight setup to finish so callers never race initialisation.
     * @internal
     */
    private static async ensureSetup(): Promise<void> {
        if (!this.setupPromise) {
            throw new Error(
                "PrivMX Endpoint is not initialized. Call (and await) EndpointFactory.setup() " +
                    "or setupAuto() before connect()/connectPublic().",
            );
        }
        await this.setupPromise;
    }

    private static async doSetup(options?: string | EndpointSetupOptions): Promise<void> {
        if (typeof window === "undefined" || typeof document === "undefined") {
            throw new Error(
                "PrivMX Endpoint requires a browser environment (window/document are not available). " +
                    "In SSR frameworks call EndpointFactory.setup() from client-side code only.",
            );
        }
        const resolved: EndpointSetupOptions =
            typeof options === "object" && options !== null
                ? options
                : { assetsBasePath: options as string | undefined };
        const { assetsBasePath, wasmModuleUrl, wasmUrl, workerCount } = resolved;

        const basePath = this.resolveAssetsBasePath(assetsBasePath);
        this.assets = {
            basePath,
            workerUrl: resolved.workerUrl ?? this.buildAssetUrl(basePath, "privmx-worker.js"),
        };
        const glueUrl = wasmModuleUrl ?? this.buildAssetUrl(basePath, "endpoint-wasm-module.js");

        // Must be set before endpointWasmModule() - the C++ AsyncEngine reads this global during WASM init.
        if (workerCount !== undefined) {
            (window as unknown as Record<string, unknown>).__privmxWorkerCount = Math.max(
                EndpointFactory.WORKER_COUNT_MIN,
                Math.floor(workerCount),
            );
        }

        setGlobalEmCrypto();

        await this.loadScript(glueUrl);

        // Override locateFile only for an explicit .wasm URL; otherwise keep Emscripten's glue-relative default.
        const lib = wasmUrl
            ? await endpointWasmModule({
                  locateFile: (path: string, scriptDirectory: string) =>
                      path.endsWith(".wasm") ? wasmUrl : scriptDirectory + path,
              })
            : await endpointWasmModule();
        EndpointFactory.init(lib);
    }

    private static resolveAssetsBasePath(assetsBasePath?: string): string {
        if (assetsBasePath != null) {
            return this.normalizeBasePath(assetsBasePath);
        }
        return "/";
    }

    private static normalizeBasePath(path: string): string {
        const trimmed = path.trim();
        if (trimmed === "" || trimmed === "/") {
            return "/";
        }
        if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) {
            return trimmed.replace(/\/+$/, "");
        }
        const resolved = new URL(trimmed.replace(/\/+$/, "") + "/", document.baseURI).href;
        return resolved.replace(/\/+$/, "");
    }

    private static buildAssetUrl(basePath: string, asset: string): string {
        const fileName = asset.replace(/^\/+/, "");
        if (basePath === "/") {
            return `/${fileName}`;
        }
        return new URL(fileName, basePath.endsWith("/") ? basePath : `${basePath}/`).href;
    }

    private static async loadScript(url: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const head = document.getElementsByTagName("head")[0];
            const script = document.createElement("script");
            script.type = "text/javascript";
            script.src = url;

            script.onload = () => {
                resolve();
            };
            script.onerror = () => {
                script.remove();
                reject(
                    new Error(
                        `PrivMX Endpoint: failed to load "${url}". ` +
                            'Copy the WASM assets from "@simplito/privmx-webendpoint/assets" ' +
                            "into your app's public directory and pass their location to " +
                            "EndpointFactory.setup({ assetsBasePath }).",
                    ),
                );
            };
            head.appendChild(script);
        });
    }

    /**
     * //doc-gen:ignore
     * @param {any} lib the initialised Emscripten module returned by `endpointWasmModule()`
     */
    private static init(lib: any) {
        this.api = new Api(lib);
        FinalizationHelper.init(lib);
        ExtKey.init(this.api);

        this.globalContainer = new GlobalContainer();
        registerGlobalServices(this.globalContainer, this.api, this.assets);
    }

    /**
     * Returns the application-wide {@link EventQueue} used to receive server
     * events pushed over active connections.
     *
     * The queue lives in the WASM core and is shared by all connections; this
     * call only resolves the singleton wrapper (no server round-trip).
     *
     * Use it after subscribing to events (e.g. `ThreadApi.subscribeFor`) and
     * drive it with {@link EventQueue.waitEvent} - or let
     * {@link getEventManager} run the loop and dispatch typed callbacks for you.
     *
     * @returns {EventQueue} the global event queue singleton (same instance on
     *   every call)
     */
    static async getEventQueue(): Promise<EventQueue> {
        return this.globalContainer.resolve<EventQueue>(T.EventQueue);
    }

    /**
     * Returns the application-wide event loop - the single running consumer of
     * the global {@link EventQueue} that dispatches incoming server events to the
     * per-connection {@link EventManager}s (`connection.getEventManager()`).
     *
     * Started lazily on the first call and reused thereafter (one loop per
     * application). Internal plumbing - applications use
     * `connection.getEventManager()` instead.
     * @internal
     * @returns {EventLoop} the shared, already-running event loop
     */
    static async getEventLoop(): Promise<EventLoop> {
        if (!this.eventLoop) {
            this.eventLoop = (async () => {
                const queue = await this.getEventQueue();
                return EventLoop.start(queue);
            })();
        }
        return this.eventLoop;
    }

    /**
     * Returns the standalone Crypto API for key generation, signing and
     * symmetric encryption.
     *
     * CryptoApi runs entirely client-side in the WASM core (secp256k1 keys,
     * ECDSA signatures, AES symmetric encryption) - it needs no connection and
     * never contacts a server.
     *
     * Use it before {@link connect} to generate or derive the user's private
     * key (e.g. `derivePrivateKey2` from a password), or any time the
     * application needs raw cryptographic operations.
     *
     * @returns {CryptoApi} the CryptoApi singleton (same instance on every call)
     */
    static async createCryptoApi(): Promise<CryptoApi> {
        return this.globalContainer.resolve<CryptoApi>(T.CryptoApi);
    }

    private static generateDefaultPKIVerificationOptions(): PKIVerificationOptions {
        return {
            bridgeInstanceId: undefined,
            bridgePubKey: undefined,
        };
    }

    /**
     * Returns (creating if necessary) the connection-scoped container for the
     * given `Connection` instance.  All per-connection API singletons live here.
     * @param {Connection} connection the authenticated or guest connection whose container to retrieve
     * @returns {ConnectionContainer} the per-connection IoC container for this connection
     */
    private static getConnectionContainer(connection: Connection): ConnectionContainer {
        let c = this.connectionContainers.get(connection);
        if (!c) {
            c = new ConnectionContainer();
            c.registerValue(T.ConnectionPtr, connection);
            registerConnectionServices(c, this.api, this.assets);
            this.connectionContainers.set(connection, c);
        }
        return c;
    }

    /**
     * Opens an authenticated session with a PrivMX Bridge server and returns
     * the {@link Connection} all other APIs are created from.
     *
     * Performs an ECDHE handshake with the Bridge that encrypts the transport
     * layer and proves the user's identity with their secp256k1 private key -
     * the key itself never leaves the browser; the server only ever sees the
     * derived public key. An authenticated WebSocket event channel is opened
     * for server-pushed events.
     *
     * Requires {@link setup} to have completed. Next steps:
     * {@link createThreadApi} / {@link createStoreApi} / … with the returned
     * connection; call {@link Connection.disconnect} when done. For
     * account-less guests (e.g. a public contact form) use
     * {@link connectPublic} instead.
     *
     * @param {string} userPrivKey user's secp256k1 private key in WIF format -
     *   generate with `CryptoApi.generatePrivateKey()` or derive from
     *   credentials with `CryptoApi.derivePrivateKey2()`; the matching public
     *   key must be registered in the Context for content access to work
     * @param {string} solutionId ID of the Solution, found in the PrivMX
     *   Bridge admin panel next to the Bridge URL
     * @param {string} bridgeUrl base URL of the PrivMX Bridge instance, e.g.
     *   `https://bridge.example.com`
     * @param {PKIVerificationOptions} [verificationOptions] expected Bridge
     *   instance ID / public key, letting the client detect a spoofed Bridge
     *   server during the handshake
     * @returns {Connection} authenticated connection - pass it to the
     *   `createXApi` factory methods
     * @throws {NativeError} when the server is unreachable, the Solution does
     *   not exist, or the key is malformed
     */
    static async connect(
        userPrivKey: string,
        solutionId: string,
        bridgeUrl: string,
        verificationOptions?: PKIVerificationOptions,
    ): Promise<Connection> {
        await this.ensureSetup();
        const nativeApi = new ConnectionNative(this.api);
        const ptr = await nativeApi.newConnection();
        await nativeApi.connect(ptr, [
            userPrivKey,
            solutionId,
            bridgeUrl,
            verificationOptions || this.generateDefaultPKIVerificationOptions(),
        ]);

        return new Connection(nativeApi, ptr, this.connectionServices);
    }

    /**
     * Opens an anonymous guest session with a PrivMX Bridge server - no user
     * account or private key required.
     *
     * Generates a random ephemeral secp256k1 key client-side for the transport
     * handshake; the session is unauthenticated (user ID `<anonymous>`) and
     * uses plain HTTP requests instead of the WebSocket event channel.
     *
     * A guest connection cannot decrypt container keys, so Threads/Stores/KVDBs
     * are inaccessible. Its purpose is the Inbox write path: create an
     * `InboxApi` with {@link createInboxApi} and submit entries via
     * `prepareEntry`/`sendEntry` (entries are encrypted client-side with the
     * Inbox's public key, so only Inbox members can read them). Typical for
     * public contact/submission forms.
     *
     * @param {string} solutionId ID of the Solution, found in the PrivMX
     *   Bridge admin panel next to the Bridge URL
     * @param {string} bridgeUrl base URL of the PrivMX Bridge instance, e.g.
     *   `https://bridge.example.com`
     * @param {PKIVerificationOptions} [verificationOptions] expected Bridge
     *   instance ID / public key, letting the client detect a spoofed Bridge
     *   server during the handshake
     * @returns {Connection} guest connection - pass it to {@link createInboxApi}
     * @throws {NativeError} when the server is unreachable or the Solution
     *   does not exist
     */
    static async connectPublic(
        solutionId: string,
        bridgeUrl: string,
        verificationOptions?: PKIVerificationOptions,
    ): Promise<Connection> {
        await this.ensureSetup();
        const nativeApi = new ConnectionNative(this.api);
        const ptr = await nativeApi.newConnection();
        await nativeApi.connectPublic(ptr, [
            solutionId,
            bridgeUrl,
            verificationOptions || this.generateDefaultPKIVerificationOptions(),
        ]);
        return new Connection(nativeApi, ptr, this.connectionServices);
    }

    /**
     * Returns the Thread API (encrypted messaging) for the given connection.
     *
     * Resolved from the connection's container - the first call instantiates
     * the WASM-side ThreadApi object, subsequent calls return the same cached
     * instance; no server round-trip happens here.
     *
     * Use it for everything message-related: `createThread`, `sendMessage`,
     * `listMessages`, Thread event subscriptions.
     *
     * @param {Connection} connection connection returned by {@link connect};
     *   the API stops working (throws) after `connection.disconnect()`
     * @returns {ThreadApi} the per-connection ThreadApi instance
     */
    static async createThreadApi(connection: Connection): Promise<ThreadApi> {
        return this.getConnectionContainer(connection).resolve<ThreadApi>(T.ThreadApi);
    }

    /**
     * Returns the Store API (encrypted file storage) for the given connection.
     *
     * Resolved from the connection's container - the first call instantiates
     * the WASM-side StoreApi object, subsequent calls return the same cached
     * instance; no server round-trip happens here.
     *
     * Use it for everything file-related: `createStore`, file upload
     * (`createFile` → `writeToFile` → `closeFile`), download
     * (`openFile` → `readFromFile`), Store event subscriptions.
     *
     * @param {Connection} connection connection returned by {@link connect};
     *   the API stops working (throws) after `connection.disconnect()`
     * @returns {StoreApi} the per-connection StoreApi instance
     */
    static async createStoreApi(connection: Connection): Promise<StoreApi> {
        return this.getConnectionContainer(connection).resolve<StoreApi>(T.StoreApi);
    }

    /**
     * Returns the Inbox API (one-way encrypted submissions) for the given
     * connection.
     *
     * Resolved from the connection's container together with its internal
     * ThreadApi/StoreApi dependencies; the first call instantiates the
     * WASM-side object, subsequent calls return the same cached instance.
     *
     * Use it to manage Inboxes on an authenticated connection, or to submit
     * entries (`prepareEntry` → `sendEntry`) on a guest connection from
     * {@link connectPublic}.
     *
     * @param {Connection} connection connection returned by {@link connect} or
     *   {@link connectPublic}; the API stops working (throws) after
     *   `connection.disconnect()`
     * @returns {InboxApi} the per-connection InboxApi instance
     */
    static async createInboxApi(connection: Connection): Promise<InboxApi>;
    /**
     * @param {Connection} connection connection returned by {@link connect} or
     *   {@link connectPublic}
     * @param {ThreadApi} [_threadApi] ignored - resolved internally instead
     * @param {StoreApi} [_storeApi] ignored - resolved internally instead
     * @returns {InboxApi} the per-connection InboxApi instance
     * @deprecated The `_threadApi` and `_storeApi` arguments are ignored and
     *   will be removed in the next major release - call
     *   `createInboxApi(connection)` with the connection only.
     */
    static async createInboxApi(
        connection: Connection,
        _threadApi?: ThreadApi,
        _storeApi?: StoreApi,
    ): Promise<InboxApi>;
    static async createInboxApi(
        connection: Connection,
        _threadApi?: ThreadApi,
        _storeApi?: StoreApi,
    ): Promise<InboxApi> {
        return this.getConnectionContainer(connection).resolve<InboxApi>(T.InboxApi);
    }

    /**
     * Returns the KVDB API (encrypted key-value storage) for the given
     * connection.
     *
     * Resolved from the connection's container - the first call instantiates
     * the WASM-side KvdbApi object, subsequent calls return the same cached
     * instance; no server round-trip happens here.
     *
     * Use it for structured key-value data: `createKvdb`, `setEntry`,
     * `getEntry`, `listEntriesKeys`, KVDB event subscriptions.
     *
     * @param {Connection} connection connection returned by {@link connect};
     *   the API stops working (throws) after `connection.disconnect()`
     * @returns {KvdbApi} the per-connection KvdbApi instance
     */
    static async createKvdbApi(connection: Connection): Promise<KvdbApi> {
        return this.getConnectionContainer(connection).resolve<KvdbApi>(T.KvdbApi);
    }

    /**
     * Returns the Event API (custom encrypted Context events) for the given
     * connection.
     *
     * Resolved from the connection's container - the first call instantiates
     * the WASM-side EventApi object, subsequent calls return the same cached
     * instance; no server round-trip happens here.
     *
     * Use it to broadcast application-defined events (`emitEvent`) to selected
     * Context members - each event is encrypted client-side for its recipients -
     * and to subscribe to such events from others.
     *
     * @param {Connection} connection connection returned by {@link connect};
     *   the API stops working (throws) after `connection.disconnect()`
     * @returns {EventApi} the per-connection EventApi instance
     */
    static async createEventApi(connection: Connection): Promise<EventApi> {
        return this.getConnectionContainer(connection).resolve<EventApi>(T.EventApi);
    }

    /**
     * Returns the Stream API (end-to-end encrypted WebRTC audio/video) for the
     * given connection.
     *
     * Resolved from the connection's container; besides the WASM-side object,
     * the first call wires up the WebRTC client stack (peer-connection
     * managers, the E2EE web worker performing per-frame AES-256-GCM
     * encryption, audio metering). All of it is torn down automatically by
     * `connection.disconnect()`.
     *
     * Use it for live media: `joinStreamRoom` → `createStream` →
     * `addStreamTrack` → `publishStream`, and `createSubscriberStream` for
     * receiving.
     *
     * @param {Connection} connection connection returned by {@link connect};
     *   the API stops working (throws) after `connection.disconnect()`
     * @returns {StreamApi} the per-connection StreamApi instance
     */
    static async createStreamApi(connection: Connection): Promise<StreamApi>;
    /**
     * @param {Connection} connection connection returned by {@link connect}
     * @param {EventApi} [_eventApi] ignored - resolved internally instead
     * @returns {StreamApi} the per-connection StreamApi instance
     * @deprecated The `_eventApi` argument is ignored and will be removed in the
     *   next major release - call `createStreamApi(connection)` with the
     *   connection only.
     */
    static async createStreamApi(connection: Connection, _eventApi?: EventApi): Promise<StreamApi>;
    static async createStreamApi(connection: Connection, _eventApi?: EventApi): Promise<StreamApi> {
        return this.getConnectionContainer(connection).resolve<StreamApi>(T.StreamApi);
    }
}
