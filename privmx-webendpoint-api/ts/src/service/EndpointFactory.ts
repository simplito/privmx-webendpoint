/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { Api } from "../api/Api";
import { ConnectionNative } from "../api/ConnectionNative";
import { CryptoApiNative } from "../api/CryptoApiNative";
import { EventApiNative } from "../api/EventApiNative";
import { EventQueueNative } from "../api/EventQueueNative";
import { InboxApiNative } from "../api/InboxApiNative";
import { StoreApiNative } from "../api/StoreApiNative";
import { ThreadApiNative } from "../api/ThreadApiNative";
import { Connection } from "./Connection";
import { CryptoApi } from "./CryptoApi";
import { EventApi } from "./EventApi";
import { EventQueue } from "./EventQueue";
import { InboxApi } from "./InboxApi";
import { StoreApi } from "./StoreApi";
import { ThreadApi } from "./ThreadApi";

declare function endpointWasmModule(): Promise<any>; // Provided by emscripten js glue code

/**
 * Contains static factory methods - generators for Connection and APIs.
 */
export class EndpointFactory {
    private static api: Api;
    private static eventQueueInstance: EventQueue;

    /**
     * Load the Endpoint's WASM assets and initialize the Endpoint library.
     *
     * @param {string} [assetsBasePath] base path/url to the Endpoint's WebAssembly assets (like: endpoint-wasm-module.js, driver-web-context.js and others)
     */
    public static async setup(assetsBasePath?: string): Promise<void> {
        const basePath = assetsBasePath || (document.currentScript as HTMLScriptElement).src.split("/").slice(0, -1).join("/");
        const assets = ["driver-web-context.js", "endpoint-wasm-module.js"];
        for (const asset of assets) {
            await this.loadScript(basePath + "/" + asset);
        }
        const lib = await endpointWasmModule();
        EndpointFactory.init(lib);
    }

    private static async loadScript(url: string): Promise<void> {
        return new Promise<void>(resolve => {
            const head = document.getElementsByTagName('head')[0];
            const script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = url;

            script.onload = () => {
                resolve()
            };
            head.appendChild(script);
        });
    }

    /**
     * //doc-gen:ignore
     */
    private static init(lib: any) {
        this.api = new Api(lib);
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

    /**
     * Connects to the platform backend.
     *
     * @param {string} userPrivKey user's private key
     * @param {string} solutionId ID of the Solution
     * @param {string} bridgeUrl the Bridge Server URL
     * @returns {Connection} instance of Connection
     */
    static async connect(
        userPrivKey: string,
        solutionId: string,
        bridgeUrl: string
    ): Promise<Connection> {
        const nativeApi = new ConnectionNative(this.api);
        const ptr = await nativeApi.newConnection();
        await nativeApi.connect(ptr, [userPrivKey, solutionId, bridgeUrl]);

        return new Connection(nativeApi, ptr);
    }

    /**
     * Connects to the Platform backend as a guest user.
     *
     * @param {string} solutionId ID of the Solution
     * @param {string} bridgeUrl the Bridge Server URL
     *
     * @returns {Connection} instance of Connection
     */
    static async connectPublic(
        solutionId: string,
        bridgeUrl: string
    ): Promise<Connection> {
        const nativeApi = new ConnectionNative(this.api);
        const ptr = await nativeApi.newConnection();
        await nativeApi.connectPublic(ptr, [solutionId, bridgeUrl]);
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
        storeApi: StoreApi
    ): Promise<InboxApi> {
        if ("inboxes" in connection.apisRefs) {
            throw new Error("InboxApi already registered for given connection.");
        }
        const nativeApi = new InboxApiNative(this.api);
        const ptr = await nativeApi.newApi(
            connection.servicePtr,
            threadApi.servicePtr,
            storeApi.servicePtr
        );
        connection.apisRefs["inboxes"] = { _apiServicePtr: ptr };
        connection.nativeApisDeps["inboxes"] = nativeApi;
        await nativeApi.create(ptr, []);
        return new InboxApi(nativeApi, ptr);
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
        connection.apisRefs["events"] = { _apiServicePtr: ptr };
        connection.nativeApisDeps["events"] = nativeApi;
        await nativeApi.create(ptr, []);
        return new EventApi(nativeApi, ptr);
    }
}
