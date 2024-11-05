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
import { EventQueueNative } from "../api/EventQueueNative";
import { InboxApiNative } from "../api/InboxApiNative";
import { StoreApiNative } from "../api/StoreApiNative";
import { ThreadApiNative } from "../api/ThreadApiNative";
import { Connection } from "./Connection";
import { CryptoApi } from "./CryptoApi";
import { EventQueue } from "./EventQueue";
import { InboxApi } from "./InboxApi";
import { StoreApi } from "./StoreApi";
import { ThreadApi } from "./ThreadApi";

/**
 * Contains static factory methods - generators for Connection and APIs.
 */
export class EndpointFactory {
  static api: Api;
  static eventQueueInstance: EventQueue;

  /**
   * //doc-gen:ignore
   */
  static init(lib: any) {
    this.api = new Api(lib);
    // this.eventQueueNative = new EventQueueNative(api);
    // this.connectionNative = new ConnectionNative(api);
    // this.threadApiNative = new ThreadApiNative(api);
    // this.storeApiNative = new StoreApiNative(api);
    // this.inboxApiNative = new InboxApiNative(api);
    // this.cryptoApiNative = new CryptoApiNative(api);
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
   * @param {string} platformUrl Platform's Endpoint URL
   * @returns {Connection} instance of Connection
   */
  static async connect(
    userPrivKey: string,
    solutionId: string,
    platformUrl: string
  ): Promise<Connection> {
    const nativeApi = new ConnectionNative(this.api);
    const ptr = await nativeApi.newConnection();
    await nativeApi.connect(ptr, [userPrivKey, solutionId, platformUrl]);

    return new Connection(nativeApi, ptr);
  }

  /**
   * Connects to the Platform backend as a guest user.
   *
   * @param {string} solutionId ID of the Solution
   * @param {string} platformUrl the Platform's Endpoint URL
   *
   * @returns {Connection} instance of Connection
   */
  static async connectPublic(
    solutionId: string,
    platformUrl: string
  ): Promise<Connection> {
    const nativeApi = new ConnectionNative(this.api);
    const ptr = await nativeApi.newConnection();
    await nativeApi.connectPublic(ptr, [solutionId, platformUrl]);
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
}
