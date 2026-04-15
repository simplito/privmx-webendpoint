import { Api } from "../native/Api";
import { CryptoApiNative } from "../native/CryptoApiNative";
import { EventApiNative } from "../native/EventApiNative";
import { EventQueueNative } from "../native/EventQueueNative";
import { InboxApiNative } from "../native/InboxApiNative";
import { KvdbApiNative } from "../native/KvdbApiNative";
import { StoreApiNative } from "../native/StoreApiNative";
import { StreamApiNative } from "../native/StreamApiNative";
import { ThreadApiNative } from "../native/ThreadApiNative";
import { WebRtcInterfaceImpl } from "../webStreams/WebRtcInterfaceImpl";
import { Connection } from "../service/Connection";
import { CryptoApi } from "../service/CryptoApi";
import { EventApi } from "../service/EventApi";
import { EventQueue } from "../service/EventQueue";
import { InboxApi } from "../service/InboxApi";
import { KvdbApi } from "../service/KvdbApi";
import { StoreApi } from "../service/StoreApi";
import { StreamApi } from "../service/StreamApi";
import { ThreadApi } from "../service/ThreadApi";
import { WebRtcClient } from "../webStreams/WebRtcClient";
import { GlobalContainer, ConnectionContainer, WebRtcContainer } from "./Container";
import { T } from "./Tokens";
import { registerWebRtcServices } from "./buildWebRtcClient";

/**
 * Registers all global-scope singletons into the provided GlobalContainer.
 * Call once during EndpointFactory.init().
 */
export function registerGlobalServices(c: GlobalContainer, api: Api, assetsBasePath: string): void {
    c.registerValue(T.Api, api);
    c.registerValue(T.AssetsBasePath, assetsBasePath);

    c.registerSingleton(T.EventQueue, async (c) => {
        const a = await c.resolve<Api>(T.Api);
        const native = new EventQueueNative(a);
        const ptr = await native.newEventQueue();
        return new EventQueue(native, ptr);
    });

    c.registerSingleton(T.CryptoApi, async (c) => {
        const a = await c.resolve<Api>(T.Api);
        const native = new CryptoApiNative(a);
        const ptr = await native.newApi();
        await native.create(ptr, []);
        return new CryptoApi(native, ptr);
    });
}

/**
 * Registers all connection-scoped API singletons into the provided ConnectionContainer.
 *
 * Dependency graph (resolved lazily to allow any creation order):
 *
 *   ThreadApi  ──┐
 *   StoreApi   ──┼──► InboxApi
 *   EventApi   ──┼──► StreamApi (also needs WebRTC sub-graph)
 *   KvdbApi       │
 *                 └── (connection instance shared via T.ConnectionPtr)
 *
 * Call once per Connection, after registering T.ConnectionPtr.
 */
export function registerConnectionServices(
    c: ConnectionContainer,
    api: Api,
    assetsBasePath: string,
): void {
    c.registerValue(T.AssetsBasePath, assetsBasePath);

    c.registerSingleton(T.ThreadApi, async (c) => {
        const conn = await c.resolve<Connection>(T.ConnectionPtr);
        if (conn.hasApi("threads")) {
            throw new Error("ThreadApi already registered for given connection.");
        }
        const native = new ThreadApiNative(api);
        const ptr    = await native.newApi(conn.servicePtr);
        await native.create(ptr, []);
        conn.registerApi("threads", ptr, native);
        return new ThreadApi(native, ptr);
    });

    c.registerSingleton(T.StoreApi, async (c) => {
        const conn = await c.resolve<Connection>(T.ConnectionPtr);
        if (conn.hasApi("stores")) {
            throw new Error("StoreApi already registered for given connection.");
        }
        const native = new StoreApiNative(api);
        const ptr    = await native.newApi(conn.servicePtr);
        conn.registerApi("stores", ptr, native);
        await native.create(ptr, []);
        return new StoreApi(native, ptr);
    });

    c.registerSingleton(T.KvdbApi, async (c) => {
        const conn = await c.resolve<Connection>(T.ConnectionPtr);
        if (conn.hasApi("kvdbs")) {
            throw new Error("KvdbApi already registered for given connection.");
        }
        const native = new KvdbApiNative(api);
        const ptr    = await native.newApi(conn.servicePtr);
        await native.create(ptr, []);
        conn.registerApi("kvdbs", ptr, native);
        return new KvdbApi(native, ptr);
    });

    c.registerSingleton(T.EventApi, async (c) => {
        const conn = await c.resolve<Connection>(T.ConnectionPtr);
        if (conn.hasApi("events")) {
            throw new Error("EventApi already registered for given connection.");
        }
        const native = new EventApiNative(api);
        const ptr    = await native.newApi(conn.servicePtr);
        await native.create(ptr, []);
        conn.registerApi("events", ptr, native);
        return new EventApi(native, ptr);
    });

    // InboxApi depends on ThreadApi + StoreApi — resolved lazily from this same container.
    c.registerSingleton(T.InboxApi, async (c) => {
        const conn = await c.resolve<Connection>(T.ConnectionPtr);
        if (conn.hasApi("inboxes")) {
            throw new Error("InboxApi already registered for given connection.");
        }
        const threadApi = await c.resolve<ThreadApi>(T.ThreadApi);
        const storeApi  = await c.resolve<StoreApi>(T.StoreApi);
        const native    = new InboxApiNative(api);
        const ptr       = await native.newApi(
            conn.servicePtr,
            threadApi.servicePtr,
            storeApi.servicePtr,
        );
        await native.create(ptr, []);
        conn.registerApi("inboxes", ptr, native);
        return new InboxApi(native, ptr);
    });

    // StreamApi depends on EventApi + a fresh WebRTC sub-graph.
    c.registerSingleton(T.StreamApi, async (c) => {
        const conn = await c.resolve<Connection>(T.ConnectionPtr);
        if (conn.hasApi("streams")) {
            throw new Error("StreamApi already registered for given connection.");
        }
        const eventApi = await c.resolve<EventApi>(T.EventApi);

        // Each StreamApi gets its own isolated WebRTC sub-graph container.
        const rtc = new WebRtcContainer();
        rtc.registerValue(T.AssetsBasePath, assetsBasePath);
        registerWebRtcServices(rtc);

        const webRtcClient        = await rtc.resolve<WebRtcClient>(T.WebRtcClient);
        const webRtcInterfaceImpl = new WebRtcInterfaceImpl(webRtcClient);
        const native              = new StreamApiNative(api, webRtcInterfaceImpl);
        const ptr                 = await native.newApi(conn.servicePtr, eventApi.servicePtr);

        webRtcClient.bindApiInterface({
            trickle:     (sessionId, candidate) => native.trickle(ptr, [sessionId, candidate]),
            acceptOffer: (sessionId, sdp)       => native.acceptOfferOnReconfigure(ptr, [sessionId, sdp]),
        });

        await native.create(ptr, []);
        const streamApi = new StreamApi(native, ptr, webRtcClient);
        conn.registerApi("streams", ptr, native, streamApi);
        return streamApi;
    });
}
