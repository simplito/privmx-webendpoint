import { Inboxes } from '.';
import {
  Connection,
  EndpointFactory,
  InboxApi,
  StoreApi,
  ThreadApi,
} from '../service';

import { InboxEntryPayload } from './inbox';

/**
 * @class PublicConnection
 * @classdesc A client for interacting with the PrivMX Endpoint API as a guest. The scope is limited to sending an entries to inboxes.
 * @example
 * // Initialize the PrivMX client
 * await PrivmxClient.setup('/path/to/privmx/assets');
 *
 * // Connect to the PrivMX bridge
 * const solutionId = 'your-solution-id';
 * const bridgeUrl = 'https://your-bridge-url.com';
 * const inboxId = 'your-inbox-id'
 * const client = await PrivmxClient.connectPublic(solutionId, bridgeUrl);
 *
 * // Send entry
 * const encoder = new TextEncoder();
 * const encodedData = encoder.encode(JSON.stringify({ message: 'Hello, PrivMX!' }));
 * 
 * await client.sendEntry(inboxId, {
 *  data: encodedData
 * })
 *
 * // Disconnect when done
 * await client.disconnect();
 */
export class PublicConnection {
  private threadApi: Promise<ThreadApi> | null = null;
  private storeApi: Promise<StoreApi> | null = null;
  private inboxApi: Promise<InboxApi> | null = null;

  /**
   * @constructor
   * @param {Connection} connection - The connection object.
   */
  public constructor(private connection: Connection) {}


  /**
   * @description Gets the connection object.
   * @returns {Connection}
   * @throws {Error} If there is no active connection.
   */
  private getConnection(): Connection {
    if (!this.connection) {
      throw new Error('No active connection');
    }
    return this.connection;
  }

  /**
   * @description Gets the Thread API.
   * @returns {Promise<ThreadApi>}
   */
  private getThreadApi(): Promise<ThreadApi> {
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
  private getStoreApi(): Promise<StoreApi> {
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
  private getInboxApi(): Promise<InboxApi> {
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
      console.error('Error during disconnection:', e);
    }
  }

  /**
   * @description Sends an entry to the specified inbox.
   * @param {string} inboxId - The ID of the inbox to send the entry to.
   * @param {InboxEntryPayload} payload - The payload of the entry to send.
   * @returns {Promise<void>}
   */
  public async sendEntry(inboxId: string, payload: InboxEntryPayload): Promise<void>{
    const inboxApi = await this.getInboxApi();
    return await Inboxes.sendEntry(inboxApi, inboxId, payload);
  }
}