import { Api } from "../api/Api";
import { CryptoApiNative } from "../api/CryptoApiNative";
import { EventApiNative } from "../api/EventApiNative";
import { EventQueueNative } from "../api/EventQueueNative";
import { InboxApiNative } from "../api/InboxApiNative";
import { KvdbApiNative } from "../api/KvdbApiNative";
import { StoreApiNative } from "../api/StoreApiNative";
import { StreamApiNative } from "../api/StreamApiNative";
import { ThreadApiNative } from "../api/ThreadApiNative";
import { WebRtcClient } from "../webStreams/WebRtcClient";
import { WebRtcInterfaceImpl } from "../webStreams/WebRtcInterfaceImpl";
import { Connection } from "./Connection";
import { Container } from "./Container";
import { CryptoApi } from "./CryptoApi";
import { EventApi } from "./EventApi";
import { EventQueue } from "./EventQueue";
import { InboxApi } from "./InboxApi";
import { KvdbApi } from "./KvdbApi";
import { StoreApi } from "./StoreApi";
import { StreamApi } from "./StreamApi";
import { ThreadApi } from "./ThreadApi";
import { T } from "./Tokens";
import { registerWebRtcServices } from "./buildWebRtcClient";

/**
 * Registers all global-scope singletons into the provided container.
 * Call once during EndpointFactory.init().
 */
export function registerGlobalServices(c: Container, api: Api, assetsBasePath: string): void {
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
 * Registers all connection-scoped API singletons into the provided container.
 *
 * Dependency graph (resolved lazily to allow any creation order):
 *
 *   ThreadApi  ──┐
 *   StoreApi   ──┼──► InboxApi
 *   EventApi   ──┼──► StreamApi (also needs WebRTC sub-graph)
 *   KvdbApi       │
 *                 └── (connection ptr shared via T.ConnectionPtr)
 *
 * Call once per Connection, after registering T.Api and T.ConnectionPtr.
 */
export function registerConnectionServices(
    c: Container,
    api: Api,
    assetsBasePath: string,
): void {
    c.registerValue(T.AssetsBasePath, assetsBasePath);

    c.registerSingleton(T.ThreadApi, async (c) => {
        const conn     = await c.resolve<Connection>(T.ConnectionPtr);
        if ("threads" in conn.apisRefs) {
            throw new Error("ThreadApi already registered for given connection.");
        }
        const native = new ThreadApiNative(api);
        const ptr    = await native.newApi(conn.servicePtr);
        await native.create(ptr, []);
        conn.apisRefs["threads"]      = { _apiServicePtr: ptr };
        conn.nativeApisDeps["threads"] = native;
        return new ThreadApi(native, ptr);
    });

    c.registerSingleton(T.StoreApi, async (c) => {
        const conn   = await c.resolve<Connection>(T.ConnectionPtr);
        if ("stores" in conn.apisRefs) {
            throw new Error("StoreApi already registered for given connection.");
        }
        const native = new StoreApiNative(api);
        const ptr    = await native.newApi(conn.servicePtr);
        conn.apisRefs["stores"]      = { _apiServicePtr: ptr };
        conn.nativeApisDeps["stores"] = native;
        await native.create(ptr, []);
        return new StoreApi(native, ptr);
    });

    c.registerSingleton(T.KvdbApi, async (c) => {
        const conn   = await c.resolve<Connection>(T.ConnectionPtr);
        if ("kvdbs" in conn.apisRefs) {
            throw new Error("KvdbApi already registered for given connection.");
        }
        const native = new KvdbApiNative(api);
        const ptr    = await native.newApi(conn.servicePtr);
        await native.create(ptr, []);
        conn.apisRefs["kvdbs"]      = { _apiServicePtr: ptr };
        conn.nativeApisDeps["kvdbs"] = native;
        return new KvdbApi(native, ptr);
    });

    c.registerSingleton(T.EventApi, async (c) => {
        const conn   = await c.resolve<Connection>(T.ConnectionPtr);
        if ("events" in conn.apisRefs) {
            throw new Error("EventApi already registered for given connection.");
        }
        const native = new EventApiNative(api);
        const ptr    = await native.newApi(conn.servicePtr);
        await native.create(ptr, []);
        conn.apisRefs["events"]      = { _apiServicePtr: ptr };
        conn.nativeApisDeps["events"] = native;
        return new EventApi(native, ptr);
    });

    // InboxApi depends on ThreadApi + StoreApi — resolved lazily from this same container.
    c.registerSingleton(T.InboxApi, async (c) => {
        const conn      = await c.resolve<Connection>(T.ConnectionPtr);
        if ("inboxes" in conn.apisRefs) {
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
        conn.apisRefs["inboxes"]      = { _apiServicePtr: ptr };
        conn.nativeApisDeps["inboxes"] = native;
        return new InboxApi(native, ptr);
    });

    // StreamApi depends on EventApi + a fresh WebRTC sub-graph.
    c.registerSingleton(T.StreamApi, async (c) => {
        const conn     = await c.resolve<Connection>(T.ConnectionPtr);
        if ("streams" in conn.apisRefs) {
            throw new Error("StreamApi already registered for given connection.");
        }
        const eventApi = await c.resolve<EventApi>(T.EventApi);

        // Each StreamApi gets its own isolated WebRTC sub-graph container.
        const rtc = new Container();
        rtc.registerValue(T.AssetsBasePath, assetsBasePath);
        registerWebRtcServices(rtc);

        const webRtcClient      = await rtc.resolve<WebRtcClient>(T.WebRtcClient);
        const webRtcInterfaceImpl = new WebRtcInterfaceImpl(webRtcClient);
        const native            = new StreamApiNative(api, webRtcInterfaceImpl);
        const ptr               = await native.newApi(conn.servicePtr, eventApi.servicePtr);

        webRtcClient.bindApiInterface({
            trickle:      (sessionId, candidate) => native.trickle(ptr, [sessionId, candidate]),
            acceptOffer:  (sessionId, sdp)       => native.acceptOfferOnReconfigure(ptr, [sessionId, sdp]),
        });

        await native.create(ptr, []);
        conn.apisRefs["streams"]      = { _apiServicePtr: ptr };
        conn.nativeApisDeps["streams"] = native;
        return new StreamApi(native, ptr, webRtcClient);
    });
}
