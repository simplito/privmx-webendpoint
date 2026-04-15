/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { Api } from "../native/Api";
import { ConnectionNative } from "../native/ConnectionNative";
import { FinalizationHelper } from "../FinalizationHelper";
import { PKIVerificationOptions } from "../Types";
import { Connection } from "./Connection";
import { CryptoApi } from "./CryptoApi";
import { EventApi } from "./EventApi";
import { EventQueue } from "./EventQueue";
import { InboxApi } from "./InboxApi";
import { KvdbApi } from "./KvdbApi";
import { StoreApi } from "./StoreApi";
import { StreamApi } from "./StreamApi";
import { ThreadApi } from "./ThreadApi";
import { GlobalContainer, ConnectionContainer } from "../ioc/Container";
import { T } from "../ioc/Tokens";
import { registerGlobalServices, registerConnectionServices } from "../ioc/buildConnectionApis";
import { setGlobalEmCrypto } from "../crypto/index";

/**
 * //doc-gen:ignore
 */
declare function endpointWasmModule(): Promise<any>; // Provided by emscripten js glue code

export interface EndpointSetupOptions {
    assetsBasePath?: string;
    workerCount?: number;
}

/**
 * Contains static factory methods - generators for Connection and APIs.
 */
export class EndpointFactory {
    private static globalContainer: GlobalContainer;
    private static assetsBasePath: string;
    private static api: Api;

    // Per-Connection containers, keyed by the Connection instance.
    // WeakMap ensures no memory leak when a Connection is garbage-collected.
    private static readonly connectionContainers = new WeakMap<Connection, ConnectionContainer>();

    /**
     * Load the Endpoint's WASM assets and initialize the Endpoint library.
     *
     * @param {string | EndpointSetupOptions} [options] either a base path string (legacy) or an options object
     * @param {string} [options.assetsBasePath] base path/url to the Endpoint's WebAssembly assets
     * @param {number} [options.workerCount] number of async-engine worker threads (default: 4, minimum: 2)
     */
    public static async setup(options?: string | EndpointSetupOptions): Promise<void> {
        const resolved: EndpointSetupOptions =
            typeof options === "object" && options !== null
                ? options
                : { assetsBasePath: options as string | undefined };
        const { assetsBasePath, workerCount } = resolved;

        const basePath = this.resolveAssetsBasePath(assetsBasePath);
        this.assetsBasePath = basePath;

        // Must be set before endpointWasmModule() is called — the C++ AsyncEngine
        // constructor reads this global during WASM module initialization (on the
        // worker thread), before the main thread gets control back.
        if (workerCount !== undefined) {
            (window as unknown as Record<string, unknown>)["__privmxWorkerCount"] = Math.max(
                2,
                Math.floor(workerCount),
            );
        }

        setGlobalEmCrypto();
        const assets = ["endpoint-wasm-module.js"];

        for (const asset of assets) {
            await this.loadScript(this.buildAssetUrl(basePath, asset));
        }

        const lib = await endpointWasmModule();
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
        return new Promise<void>((resolve) => {
            const head = document.getElementsByTagName("head")[0];
            const script = document.createElement("script");
            script.type = "text/javascript";
            script.src = url;

            script.onload = () => {
                resolve();
            };
            head.appendChild(script);
        });
    }

    /**
     * //doc-gen:ignore
     */
    private static init(lib: any) {
        this.api = new Api(lib);
        FinalizationHelper.init(lib);

        this.globalContainer = new GlobalContainer();
        registerGlobalServices(this.globalContainer, this.api, this.assetsBasePath);
    }

    /**
     * Gets the EventQueue instance.
     *
     * @returns {EventQueue} instance of EventQueue
     */
    static async getEventQueue(): Promise<EventQueue> {
        return this.globalContainer.resolve<EventQueue>(T.EventQueue);
    }

    /**
     * Creates a standalone instance of the Crypto API.
     *
     * CryptoApi is stateless and connection-independent; the same instance is
     * returned on every call (singleton within the global container).
     *
     * @returns {CryptoApi} instance of CryptoApi
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
     */
    private static getConnectionContainer(connection: Connection): ConnectionContainer {
        let c = this.connectionContainers.get(connection);
        if (!c) {
            c = new ConnectionContainer();
            c.registerValue(T.ConnectionPtr, connection);
            registerConnectionServices(c, this.api, this.assetsBasePath);
            this.connectionContainers.set(connection, c);
        }
        return c;
    }

    /**
     * Connects to the platform backend.
     *
     * @param {string} userPrivKey user's private key
     * @param {string} solutionId ID of the Solution
     * @param {string} bridgeUrl the Bridge Server URL
     * @param {PKIVerificationOptions} [verificationOptions] PrivMX Bridge server instance verification options using a PKI server
     * @returns {Connection} instance of Connection
     */
    static async connect(
        userPrivKey: string,
        solutionId: string,
        bridgeUrl: string,
        verificationOptions?: PKIVerificationOptions,
    ): Promise<Connection> {
        const nativeApi = new ConnectionNative(this.api);
        const ptr = await nativeApi.newConnection();
        await nativeApi.connect(ptr, [
            userPrivKey,
            solutionId,
            bridgeUrl,
            verificationOptions || this.generateDefaultPKIVerificationOptions(),
        ]);

        return new Connection(nativeApi, ptr);
    }

    /**
     * Connects to the Platform backend as a guest user.
     *
     * @param {string} solutionId ID of the Solution
     * @param {string} bridgeUrl the Bridge Server URL
     * @param {PKIVerificationOptions} [verificationOptions] PrivMX Bridge server instance verification options using a PKI server
     * @returns {Connection} instance of Connection
     */
    static async connectPublic(
        solutionId: string,
        bridgeUrl: string,
        verificationOptions?: PKIVerificationOptions,
    ): Promise<Connection> {
        const nativeApi = new ConnectionNative(this.api);
        const ptr = await nativeApi.newConnection();
        await nativeApi.connectPublic(ptr, [
            solutionId,
            bridgeUrl,
            verificationOptions || this.generateDefaultPKIVerificationOptions(),
        ]);
        return new Connection(nativeApi, ptr);
    }

    /**
     * Creates an instance of the Thread API.
     *
     * @param {Connection} connection instance of Connection
     * @returns {ThreadApi} instance of ThreadApi
     */
    static async createThreadApi(connection: Connection): Promise<ThreadApi> {
        return this.getConnectionContainer(connection).resolve<ThreadApi>(T.ThreadApi);
    }

    /**
     * Creates an instance of the Store API.
     *
     * @param {Connection} connection instance of Connection
     * @returns {StoreApi} instance of StoreApi
     */
    static async createStoreApi(connection: Connection): Promise<StoreApi> {
        return this.getConnectionContainer(connection).resolve<StoreApi>(T.StoreApi);
    }

    /**
     * Creates an instance of the Inbox API.
     *
     * ThreadApi and StoreApi are resolved automatically from the connection container.
     *
     * @param {Connection} connection instance of Connection
     * @param {ThreadApi} [_threadApi] ignored — kept for backwards-compatible signature
     * @param {StoreApi} [_storeApi] ignored — kept for backwards-compatible signature
     * @returns {InboxApi} instance of InboxApi
     */
    static async createInboxApi(
        connection: Connection,
        _threadApi?: ThreadApi,
        _storeApi?: StoreApi,
    ): Promise<InboxApi> {
        return this.getConnectionContainer(connection).resolve<InboxApi>(T.InboxApi);
    }

    /**
     * Creates an instance of the Kvdb API.
     *
     * @param {Connection} connection instance of Connection
     * @returns {KvdbApi} instance of KvdbApi
     */
    static async createKvdbApi(connection: Connection): Promise<KvdbApi> {
        return this.getConnectionContainer(connection).resolve<KvdbApi>(T.KvdbApi);
    }

    /**
     * Creates an instance of 'EventApi'.
     *
     * @param connection instance of 'Connection'
     * @returns {EventApi} instance of EventApi
     */
    static async createEventApi(connection: Connection): Promise<EventApi> {
        return this.getConnectionContainer(connection).resolve<EventApi>(T.EventApi);
    }

    /**
     * Creates an instance of the Stream API.
     *
     * EventApi is resolved automatically from the connection container.
     *
     * @param {Connection} connection instance of Connection
     * @param {EventApi} [_eventApi] ignored — kept for backwards-compatible signature
     * @returns {StreamApi} instance of StreamApi
     */
    static async createStreamApi(connection: Connection, _eventApi?: EventApi): Promise<StreamApi> {
        return this.getConnectionContainer(connection).resolve<StreamApi>(T.StreamApi);
    }
}
