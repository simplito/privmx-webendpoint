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
} from '../service';

import { PublicConnection } from './PublicConnection';
import {ConnectionEventsManager, CustomEventsManager, InboxEventsManager, StoreEventsManager, ThreadEventsManager} from "./managers";
import {EventManager} from "./events";

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
  private static cryptoApi: Promise<CryptoApi> | null = null;
  private static eventQueue: Promise<EventQueue> | null = null;
  private static isSetup = false;
  private static eventManager: Promise<EventManager> | null = null;

  private threadApi: Promise<ThreadApi> | null = null;
  private storeApi: Promise<StoreApi> | null = null;
  private inboxApi: Promise<InboxApi> | null = null;
  private kvdbApi: Promise<KvdbApi> | null = null;
  private eventApi: Promise<EventApi> | null = null;

  private connectionEventManager: Promise<ConnectionEventsManager> | null =
    null;
  private threadEventManager: Promise<ThreadEventsManager> | null = null;
  private storeEventManager: Promise<StoreEventsManager> | null = null;
  private inboxEventManager: Promise<InboxEventsManager> | null = null;
  private customEventsManager: Promise<CustomEventsManager> | null = null;

  /**
   * @constructor
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
      throw new Error(
        'Endpoint not initialized, use PrivMXClient.setup(folderPath).'
      );
    }
  }

  /**
   * @description Gets the Crypto API.
   * @returns {Promise<CryptoApi>}
   */
  public static async getCryptoApi(): Promise<CryptoApi> {
    if (this.cryptoApi) {
      return this.cryptoApi;
    }

    this.checkSetup();

    this.cryptoApi = (async () => {
      return EndpointFactory.createCryptoApi();
    })();

    return this.cryptoApi;
  }

  /**
   * @description Gets the Event Queue.
   * @returns {Promise<EventQueue>}
   */
  public static async getEventQueue(): Promise<EventQueue> {
    if (this.eventQueue) {
      return this.eventQueue;
    }

    this.checkSetup();

    this.eventQueue = (async () => {
      return EndpointFactory.getEventQueue();
    })();

    return this.eventQueue;
  }

  /**
   * @description Gets the Event Manager.
   * @returns {Promise<EventManager>}
   */
  public static async getEventManager(): Promise<EventManager> {
    if (this.eventManager) {
      return this.eventManager;
    }

    this.checkSetup();

    this.eventManager = (async () => {
      const eventQueue = await PrivmxClient.getEventQueue();
      return EventManager.startEventLoop(eventQueue);
    })();

    return await this.eventManager;
  }

  /**
   * @description Connects to the PrivMX bridge.
   * @param {string} privateKey user's private key
   * @param {string} solutionId ID of the Solution
   * @param {string} bridgeUrl the Bridge Server URL
   * @returns {Promise<PrivmxClient>}
   * @throws {Error} If the connection to the bridge fails.
   */
  static async connect(
    privateKey: string,
    solutionId: string,
    bridgeUrl: string
  ): Promise<PrivmxClient> {
    this.checkSetup();

    const connection = await EndpointFactory.connect(
      privateKey,
      solutionId,
      bridgeUrl
    );

    if (!connection) {
      throw new Error('ERROR: Could not connect to bridge');
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
  static async connectPublic(solutionId: string, bridgeUrl: string): Promise<PublicConnection>{
    this.checkSetup();

    const connection = await EndpointFactory.connectPublic(solutionId, bridgeUrl)

    if(!connection){
      throw new Error('ERROR: Could not connect to bridge');
    }

    return new PublicConnection(connection);
  }

  /**
   * @description Gets the connection object.
   * @returns {Connection}
   * @throws {Error} If there is no active connection.
   */
  public getConnection(): Connection {
    if (!this.connection) {
      throw new Error('No active connection');
    }
    return this.connection;
  }

  /**
   * @description Gets the Thread API.
   * @returns {Promise<ThreadApi>}
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
   * @returns {Promise<StoreApi>}
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
   * @returns {Promise<InboxApi>}
   */
  public async getInboxApi(): Promise<InboxApi> {
    if (!this.inboxApi) {
      this.inboxApi = (async () => {
        const connection = this.getConnection();
        return EndpointFactory.createInboxApi(
          connection,
          await this.getThreadApi(),
          await this.getStoreApi()
        );
      })();
    }
    return this.inboxApi;
  }

  /**
   * @description Gets the Kvdb API.
   * @returns {Promise<KvdbApi>}
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
   * @returns {Promise<EventApi>}
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
   * @description Gets the Connection Event Manager.
   * @returns {Promise<ConnectionEventsManager>}
   */
  public async getConnectionEventManager(): Promise<ConnectionEventsManager> {
    if (this.connectionEventManager) {
      return this.connectionEventManager;
    }

    this.connectionEventManager = (async () => {
      const eventManager = await PrivmxClient.getEventManager();
      const connection = this.getConnection();
      const connectionId = await connection.getConnectionId();
      return eventManager.getConnectionEventManager(
        connection,
        `${connectionId}`,
      );
    })();

    return this.connectionEventManager;
  }

  /**
   * @description Gets the Thread Event Manager.
   * @returns {Promise<ThreadEventsManager>}
   */
  public async getThreadEventManager(): Promise<ThreadEventsManager> {
    if (this.threadEventManager) {
      return this.threadEventManager;
    }

    this.threadEventManager = (async () => {
      const eventManager = await PrivmxClient.getEventManager();
      return eventManager.getThreadEventManager(await this.getThreadApi());
    })();

    return this.threadEventManager;
  }

  /**
   * @description Gets the Store Event Manager.
   * @returns {Promise<StoreEventsManager>}
   */
  public async getStoreEventManager(): Promise<StoreEventsManager> {
    if (this.storeEventManager) {
      return this.storeEventManager;
    }

    this.storeEventManager = (async () => {
      const eventManager = await PrivmxClient.getEventManager();
      return eventManager.getStoreEventManager(await this.getStoreApi());
    })();

    return this.storeEventManager;
  }

  /**
   * @description Gets the Inbox Event Manager.
   * @returns {Promise<InboxEventsManager>}
   */
  public async getInboxEventManager(): Promise<InboxEventsManager> {
    if (this.inboxEventManager) {
      return this.inboxEventManager;
    }

    this.inboxEventManager = (async () => {
      const eventManager = await PrivmxClient.getEventManager();
      return eventManager.getInboxEventManager(await this.getInboxApi());
    })();

    return this.inboxEventManager;
  }

  /**
   * @description Gets the Custom Events Manager.
   * @returns {Promise<CustomEventsManager>}
   */
  public async getCustomEventsManager(): Promise<CustomEventsManager> {
    if (this.customEventsManager) {
      return this.customEventsManager;
    }

    this.customEventsManager = (async () => {
      const eventManager = await PrivmxClient.getEventManager();
      return eventManager.getCustomEventManager(await this.getEventApi());
    })();

    return this.customEventsManager;
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
      this.connectionEventManager = null;
      this.customEventsManager = null;
      this.threadEventManager = null;
      this.storeEventManager = null;
      this.inboxEventManager = null;
    } catch (e) {
      console.error('Error during disconnection:', e);
    }
  }
}
