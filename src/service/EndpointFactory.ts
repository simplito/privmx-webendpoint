/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { Api } from "../api/Api";
import { ApiStatic } from "../api/ApiStatic";
import { ConnectionNative } from "../api/ConnectionNative";
import { CryptoApiNative } from "../api/CryptoApiNative";
import { EventApiNative } from "../api/EventApiNative";
import { EventQueueNative } from "../api/EventQueueNative";
import { InboxApiNative } from "../api/InboxApiNative";
import { KvdbApiNative } from "../api/KvdbApiNative";
import { StoreApiNative } from "../api/StoreApiNative";
import { StreamApiNative } from "../api/StreamApiNative";
import { ThreadApiNative } from "../api/ThreadApiNative";
import { FinalizationHelper } from "../FinalizationHelper";
import { PKIVerificationOptions } from "../Types";
import { WebRtcClient } from "../webStreams/WebRtcClient";
import { Connection } from "./Connection";
import { CryptoApi } from "./CryptoApi";
import { EventApi } from "./EventApi";
import { EventQueue } from "./EventQueue";
import { InboxApi } from "./InboxApi";
import { KvdbApi } from "./KvdbApi";
import { StoreApi } from "./StoreApi";
import { StreamApi } from "./StreamApi";
import { ThreadApi } from "./ThreadApi";
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
    private static api: Api;
    private static eventQueueInstance: EventQueue;
    private static assetsBasePath: string;

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
            (window as unknown as Record<string, unknown>).__privmxWorkerCount = Math.max(
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
        ApiStatic.init(this.api);
        FinalizationHelper.init(lib);
    }

    /**
     * Gets the EventQueue instance.
     *
     * @returns {EventQueue} instance of EventQueue
     */
    static async getEventQueue(): Promise<EventQueue> {
        if (!this.eventQueueInstance) {
            const nativeApi = new EventQueueNative(this.api);
            const ptr = await nativeApi.newEventQueue();
            this.eventQueueInstance = new EventQueue(nativeApi, ptr);
        }
        return this.eventQueueInstance;
    }

    private static generateDefaultPKIVerificationOptions(): PKIVerificationOptions {
        return {
            bridgeInstanceId: undefined,
            bridgePubKey: undefined,
        };
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
     *
     * @returns {ThreadApi} instance of ThreadApi
     */
    static async createThreadApi(connection: Connection): Promise<ThreadApi> {
        if ("threads" in connection.apisRefs) {
            throw new Error("ThreadApi already registered for given connection.");
        }
        const nativeApi = new ThreadApiNative(this.api);
        const ptr = await nativeApi.newApi(connection.servicePtr);
        await nativeApi.create(ptr, []);
        connection.apisRefs["threads"] = { _apiServicePtr: ptr };
        connection.nativeApisDeps["threads"] = nativeApi;
        return new ThreadApi(nativeApi, ptr);
    }

    /**
     * Creates an instance of the Store API.
     *
     * @param {Connection} connection instance of Connection
     *
     * @returns {StoreApi} instance of StoreApi
     */
    static async createStoreApi(connection: Connection): Promise<StoreApi> {
        if ("stores" in connection.apisRefs) {
            throw new Error("StoreApi already registered for given connection.");
        }
        const nativeApi = new StoreApiNative(this.api);
        const ptr = await nativeApi.newApi(connection.servicePtr);
        connection.apisRefs["stores"] = { _apiServicePtr: ptr };
        connection.nativeApisDeps["stores"] = nativeApi;
        await nativeApi.create(ptr, []);
        return new StoreApi(nativeApi, ptr);
    }

    /**
     * Creates an instance of the Inbox API.
     *
     * @param {Connection} connection instance of Connection
     * @param {ThreadApi} threadApi instance of ThreadApi
     * @param {StoreApi} storeApi instance of StoreApi
     * @returns {InboxApi} instance of InboxApi
     */
    static async createInboxApi(
        connection: Connection,
        threadApi: ThreadApi,
        storeApi: StoreApi,
    ): Promise<InboxApi> {
        if ("inboxes" in connection.apisRefs) {
            throw new Error("InboxApi already registered for given connection.");
        }
        const nativeApi = new InboxApiNative(this.api);
        const ptr = await nativeApi.newApi(
            connection.servicePtr,
            threadApi.servicePtr,
            storeApi.servicePtr,
        );
        await nativeApi.create(ptr, []);
        connection.apisRefs["inboxes"] = { _apiServicePtr: ptr };
        connection.nativeApisDeps["inboxes"] = nativeApi;

        return new InboxApi(nativeApi, ptr);
    }

    /**
     * Creates an instance of the Kvdb API.
     *
     * @param {Connection} connection instance of Connection
     *
     * @returns {KvdbApi} instance of KvdbApi
     */
    static async createKvdbApi(connection: Connection): Promise<KvdbApi> {
        if ("kvdbs" in connection.apisRefs) {
            throw new Error("KvdbApi already registered for given connection.");
        }
        const nativeApi = new KvdbApiNative(this.api);
        const ptr = await nativeApi.newApi(connection.servicePtr);
        await nativeApi.create(ptr, []);
        connection.apisRefs["kvdbs"] = { _apiServicePtr: ptr };
        connection.nativeApisDeps["kvdbs"] = nativeApi;
        return new KvdbApi(nativeApi, ptr);
    }

    /**
     * Creates an instance of the Crypto API.
     *
     * @returns {CryptoApi} instance of CryptoApi
     */
    static async createCryptoApi(): Promise<CryptoApi> {
        const nativeApi = new CryptoApiNative(this.api);
        const ptr = await nativeApi.newApi();
        await nativeApi.create(ptr, []);
        return new CryptoApi(nativeApi, ptr);
    }

    /**
     * Creates an instance of 'EventApi'.
     *
     * @param connection instance of 'Connection'
     *
     * @returns {EventApi} instance of EventApi
     */
    static async createEventApi(connection: Connection): Promise<EventApi> {
        if ("events" in connection.apisRefs) {
            throw new Error("EventApi already registered for given connection.");
        }
        const nativeApi = new EventApiNative(this.api);
        const ptr = await nativeApi.newApi(connection.servicePtr);
        await nativeApi.create(ptr, []);
        connection.apisRefs["events"] = { _apiServicePtr: ptr };
        connection.nativeApisDeps["events"] = nativeApi;
        return new EventApi(nativeApi, ptr);
    }

    /**
     * Creates an instance of the Stream API.
     *
     * @param {Connection} connection instance of Connection
     * @param {EventApi} eventApi instance of EventApi
     * @param {StoreApi} storeApi instance of StoreApi
     * @returns {StreamApi} instance of StreamApi
     */
    static async createStreamApi(connection: Connection, eventApi: EventApi): Promise<StreamApi> {
        if ("streams" in connection.apisRefs) {
            throw new Error("StreamApi already registered for given connection.");
        }
        const webRtcClient = new WebRtcClient(this.assetsBasePath);
        const nativeApi = new StreamApiNative(this.api, webRtcClient);

        const ptr = await nativeApi.newApi(connection.servicePtr, eventApi.servicePtr);
        await nativeApi.create(ptr, []);
        connection.apisRefs["streams"] = { _apiServicePtr: ptr };
        connection.nativeApisDeps["streams"] = nativeApi;
        return new StreamApi(nativeApi, ptr, webRtcClient);
    }
}
