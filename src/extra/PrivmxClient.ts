import {
    Connection,
    CryptoApi,
    EndpointFactory,
    EventQueue,
    InboxApi,
    StoreApi,
    ThreadApi,
    KvdbApi,
    EventApi,
} from "../service/index.js";

import { logger } from "../webStreams/Logger.js";
import { PublicConnection } from "./PublicConnection.js";
import { EventManager } from "../events/EventManager.js";

/**
 * @class PrivmxClient
 * @classdesc A client for interacting with the PrivMX Endpoint API.
 * @example
 * // Initialize the PrivMX client
 * await PrivmxClient.setup('/path/to/privmx/assets');
 *
 * // Connect to the PrivMX bridge
 * const privateKey = 'your-private-key';
 * const solutionId = 'your-solution-id';
 * const contextId = 'your-context-id';
 * const bridgeUrl = 'https://your-bridge-url.com';
 * const client = await PrivmxClient.connect(privateKey, solutionId, bridgeUrl);
 *
 * // Get the Thread API and list threads
 * const threadApi = await client.getThreadApi();
 * const threads = await threadApi.listThreads(contextId, {
 *    skip: 0,
 *    limit: 100,
 *    sort: 'desc'
 * })
 *
 * // Disconnect when done
 * await client.disconnect();
 */
export class PrivmxClient {
    private static isSetup = false;

    private threadApi: Promise<ThreadApi> | null = null;
    private storeApi: Promise<StoreApi> | null = null;
    private inboxApi: Promise<InboxApi> | null = null;
    private kvdbApi: Promise<KvdbApi> | null = null;
    private eventApi: Promise<EventApi> | null = null;

    /**
     * @param {Connection} connection - The connection object.
     */
    private constructor(private connection: Connection) {}

    /**
     * @description Sets up the PrivMX endpoint if it hasn't been set up yet.
     * @param {string} folderPath - The path to the folder where PrivMX assets are stored.
     * @returns {Promise<void>}
     */

    public static async setup(folderPath: string): Promise<void> {
        if (!PrivmxClient.isSetup) {
            await EndpointFactory.setup(folderPath);
            PrivmxClient.isSetup = true;
        }
    }

    private static checkSetup() {
        if (!this.isSetup) {
            throw new Error("Endpoint not initialized, use PrivMXClient.setup(folderPath).");
        }
    }

    /**
     * @description Gets the Crypto API.
     * @returns {Promise<CryptoApi>} A promise resolving to the Crypto API.
     */
    public static async getCryptoApi(): Promise<CryptoApi> {
        this.checkSetup();
        return EndpointFactory.createCryptoApi();
    }

    /**
     * @description Gets the Event Queue.
     * @returns {Promise<EventQueue>} A promise resolving to the Event Queue.
     */
    public static async getEventQueue(): Promise<EventQueue> {
        this.checkSetup();
        return EndpointFactory.getEventQueue();
    }

    /**
     * @description Gets the single event manager for this client's connection.
     *   Subscribe to events of any module through it; build entries with the
     *   `create*Subscription` helpers.
     * @returns {Promise<EventManager>} A promise resolving to the event manager.
     */
    public getEventManager(): Promise<EventManager> {
        return this.getConnection().getEventManager();
    }

    /**
     * @description Connects to the PrivMX bridge.
     * @param {string} privateKey user's private key
     * @param {string} solutionId ID of the Solution
     * @param {string} bridgeUrl the Bridge Server URL
     * @returns {Promise<PrivmxClient>} A promise resolving to a connected client instance.
     * @throws {Error} If the connection to the bridge fails.
     */
    static async connect(
        privateKey: string,
        solutionId: string,
        bridgeUrl: string,
    ): Promise<PrivmxClient> {
        this.checkSetup();

        const connection = await EndpointFactory.connect(privateKey, solutionId, bridgeUrl);

        if (!connection) {
            throw new Error("ERROR: Could not connect to bridge");
        }
        return new PrivmxClient(connection);
    }

    /**
     * Connects to the Platform backend as a guest user.
     *
     * @param {string} solutionId ID of the Solution
     * @param {string} bridgeUrl the Bridge Server URL
     *
     * @returns {Promise<PublicConnection>} Promised instance of Connection
     */
    static async connectPublic(solutionId: string, bridgeUrl: string): Promise<PublicConnection> {
        this.checkSetup();

        const connection = await EndpointFactory.connectPublic(solutionId, bridgeUrl);

        if (!connection) {
            throw new Error("ERROR: Could not connect to bridge");
        }

        return new PublicConnection(connection);
    }

    /**
     * @description Gets the connection object.
     * @returns {Connection} The active connection object.
     * @throws {Error} If there is no active connection.
     */
    public getConnection(): Connection {
        if (!this.connection) {
            throw new Error("No active connection");
        }
        return this.connection;
    }

    /**
     * @description Gets the Thread API.
     * @returns {Promise<ThreadApi>} A promise resolving to the Thread API.
     */
    public async getThreadApi(): Promise<ThreadApi> {
        if (!this.threadApi) {
            this.threadApi = (() => {
                const connection = this.getConnection();
                return EndpointFactory.createThreadApi(connection);
            })();
        }
        return this.threadApi;
    }

    /**
     * @description Gets the Store API.
     * @returns {Promise<StoreApi>} A promise resolving to the Store API.
     */
    public async getStoreApi(): Promise<StoreApi> {
        if (!this.storeApi) {
            this.storeApi = (async () => {
                const connection = this.getConnection();
                return EndpointFactory.createStoreApi(connection);
            })();
        }
        return this.storeApi;
    }

    /**
     * @description Gets the Inbox API.
     * @returns {Promise<InboxApi>} A promise resolving to the Inbox API.
     */
    public async getInboxApi(): Promise<InboxApi> {
        if (!this.inboxApi) {
            this.inboxApi = (async () => {
                const connection = this.getConnection();
                return EndpointFactory.createInboxApi(connection);
            })();
        }
        return this.inboxApi;
    }

    /**
     * @description Gets the Kvdb API.
     * @returns {Promise<KvdbApi>} A promise resolving to the Kvdb API.
     */
    public async getKvdbApi(): Promise<KvdbApi> {
        if (!this.kvdbApi) {
            this.kvdbApi = (async () => {
                const connection = this.getConnection();
                return EndpointFactory.createKvdbApi(connection);
            })();
        }
        return this.kvdbApi;
    }

    /**
     * @description Gets the Event API.
     * @returns {Promise<EventApi>} A promise resolving to the Event API.
     */
    public async getEventApi(): Promise<EventApi> {
        if (!this.eventApi) {
            this.eventApi = (async () => {
                const connection = this.getConnection();
                return EndpointFactory.createEventApi(connection);
            })();
        }
        return this.eventApi;
    }

    /**
     * @description Disconnects from the PrivMX bridge.
     * @returns {Promise<void>}
     */
    public async disconnect(): Promise<void> {
        try {
            await this.connection.disconnect();
            this.threadApi = null;
            this.storeApi = null;
            this.inboxApi = null;
        } catch (e) {
            logger.error("Error during disconnection:", e);
        }
    }
}
