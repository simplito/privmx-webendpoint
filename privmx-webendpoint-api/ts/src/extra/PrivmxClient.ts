import {
    Connection,
    CryptoApi,
    EndpointFactory,
    EventQueue,
    InboxApi,
    StoreApi,
    ThreadApi,
  } from "../service";
  import {
    ConnectionEventsManager,
    EventManager,
    InboxEventsManager,
    StoreEventsManager,
    ThreadEventsManager,
  } from "./events";
  
  /**
   * @class PrivmxClient
   * @classdesc A client for interacting with the PrivMX services.
   */
  export class PrivmxClient {
    private static cryptoApi: Promise<CryptoApi> | null = null;
    private static eventQueue: Promise<EventQueue> | null = null;
    private static isSetup = false;
    private static eventManager: Promise<EventManager> | null = null;

    private threadApi: Promise<ThreadApi> | null = null;
    private storeApi: Promise<StoreApi> | null = null;
    private inboxApi: Promise<InboxApi> | null = null;
    
    private connectionEventManager: Promise<ConnectionEventsManager> | null =
      null;
    private threadEventManger: Promise<ThreadEventsManager> | null = null;
    private storeEventManager: Promise<StoreEventsManager> | null = null;
    private inboxEventManager: Promise<InboxEventsManager> | null = null;
  
    /**
     * @constructor
     * @param {Connection} connection - The connection object.
     */
    constructor(private connection: Connection) {}
  
    /**
     * @description Sets up the PrivMX endpoint if it hasn't been set up yet.
     * @returns {Promise<void>}
     */
    private static async setup(): Promise<void> {
      if (!PrivmxClient.isSetup) {
        await EndpointFactory.setup("/privmx-assets");
        PrivmxClient.isSetup = true;
      }
    }
  
    /**
     * @description Gets the Crypto API.
     * @returns {Promise<CryptoApi>}
     */
    public static async getCryptoApi(): Promise<CryptoApi> {
      if (!this.cryptoApi) {
        this.cryptoApi = (async () => {
          await PrivmxClient.setup();
          return EndpointFactory.createCryptoApi();
        })();
      }
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
  
      if (!PrivmxClient.isSetup) {
        await PrivmxClient.setup();
      }
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
      await PrivmxClient.setup();
      const connection = await EndpointFactory.connect(
        privateKey,
        solutionId,
        bridgeUrl
      );
  
      if (!connection) {
        throw new Error("ERROR: Could not connect to bridge");
      }
      return new PrivmxClient(connection);
    }
  
    /**
     * @description Gets the connection object.
     * @returns {Connection}
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
     * @returns {Promise<ThreadApi>}
     */
    public getThreadApi(): Promise<ThreadApi> {
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
    public getStoreApi(): Promise<StoreApi> {
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
    public getInboxApi(): Promise<InboxApi> {
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
        const connectionId =
          (await connection.getConnectionId()) as unknown as string;
        return eventManager.getConnectionEventManager(connectionId);
      })();
  
      return this.connectionEventManager;
    }
  
    /**
     * @description Gets the Thread Event Manager.
     * @returns {Promise<ThreadEventsManager>}
     */
    public async getThreadEventManager(): Promise<ThreadEventsManager> {
      if (this.threadEventManger) {
        return this.threadEventManger;
      }
  
      this.threadEventManger = (async () => {
        const eventManager = await PrivmxClient.getEventManager();
        return eventManager.getThreadEventManager(await this.getThreadApi());
      })();
  
      return this.threadEventManger;
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
  }
  