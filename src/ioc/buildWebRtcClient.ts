import { AudioManager } from "../webStreams/AudioManager.js";
import { E2eeTransformManager } from "../webStreams/E2eeTransformManager.js";
import { E2eeWorker } from "../webStreams/E2eeWorker.js";
import { StateChangeDispatcher } from "../webStreams/EventDispatcher.js";
import { KeySyncManager } from "../webStreams/KeySyncManager.js";
import { PeerConnectionFactory } from "../webStreams/PeerConnectionFactory.js";
import { PeerConnectionManager } from "../webStreams/PeerConnectionManager.js";
import { PublisherManager } from "../webStreams/PublisherManager.js";
import { RemoteStreamListenerRegistry } from "../webStreams/RemoteStreamListenerRegistry.js";
import { SubscriberManager } from "../webStreams/SubscriberManager.js";
import { WebRtcClient } from "../webStreams/WebRtcClient.js";
import { WebRtcContainer, Container } from "./Container.js";
import { T } from "./Tokens.js";

/**
 * Builds a fully-wired WebRtcClient and registers all its internal sub-objects
 * into the provided container so that callback closures can resolve them lazily.
 *
 * Circular dependencies are broken by resolving inside the callback closures that
 * are only called during an active call - well after construction completes:
 *
 *   - PeerConnectionFactory.onRemoteTrack  → resolves SubscriberManager lazily
 *   - PeerConnectionManager.onTrickle      → resolves WebRtcClient lazily
 * @internal
 */
export async function buildWebRtcClient(c: Container): Promise<WebRtcClient> {
    const dispatcher = await c.resolve<StateChangeDispatcher>(T.StateChangeDispatcher);
    const registry = await c.resolve<RemoteStreamListenerRegistry>(T.ListenerRegistry);
    const e2eeTransform = await c.resolve<E2eeTransformManager>(T.E2eeTransformManager);
    const audioManager = await c.resolve<AudioManager>(T.AudioManager);
    const e2eeWorker = await c.resolve<E2eeWorker>(T.E2eeWorker);

    // registerRemoteDataChannel/decryptDataChannelMessage/onRemoteTrack fire during a
    // live call; WebRtcClient/SubscriberManager resolved lazily to break the cycle.
    const pcFactory = new PeerConnectionFactory(
        dispatcher,
        (roomId, remoteStreamId) =>
            c
                .resolve<WebRtcClient>(T.WebRtcClient)
                .then((client) => client.registerRemoteDataChannel(roomId, remoteStreamId)),
        (roomId, remoteStreamId, encryptedData) =>
            c
                .resolve<WebRtcClient>(T.WebRtcClient)
                .then((client) =>
                    client.decryptDataChannelMessage(roomId, remoteStreamId, encryptedData),
                ),
        e2eeTransform,
        registry,
        async (roomId, event) => {
            const sub = await c.resolve<SubscriberManager>(T.SubscriberManager);
            return sub.onRemoteTrack(roomId, event);
        },
    );

    // onTrickle fires during ICE negotiation; WebRtcClient resolved lazily.
    const pcm = new PeerConnectionManager(
        (room, streamHandle) => pcFactory.create(room, streamHandle),
        (sessionId, candidate) =>
            c
                .resolve<WebRtcClient>(T.WebRtcClient)
                .then((client) => client.trickle(sessionId, candidate)),
    );

    const publisher = new PublisherManager(pcm, audioManager, e2eeTransform);
    const subscriber = new SubscriberManager(pcm, e2eeTransform, registry, audioManager);
    const keys = new KeySyncManager(e2eeWorker);

    const client = new WebRtcClient(
        publisher,
        subscriber,
        keys,
        dispatcher,
        registry,
        pcFactory,
        audioManager,
        e2eeWorker,
    );

    // Register internally-constructed objects so the lazy callbacks can reach them.
    c.registerValue(T.PeerConnectionFactory, pcFactory);
    c.registerValue(T.PeerConnectionManager, pcm);
    c.registerValue(T.PublisherManager, publisher);
    c.registerValue(T.SubscriberManager, subscriber);
    c.registerValue(T.KeySyncManager, keys);
    c.registerValue(T.WebRtcClient, client);

    return client;
}

/**
 * Registers all WebRTC-session-scoped singletons into a WebRtcContainer.
 * Call this once per createStreamApi() invocation before resolving T.WebRtcClient.
 * @internal
 */
export function registerWebRtcServices(c: WebRtcContainer): void {
    c.registerSingleton(T.StateChangeDispatcher, async () => new StateChangeDispatcher());
    c.registerSingleton(T.ListenerRegistry, async () => new RemoteStreamListenerRegistry());

    c.registerSingleton(T.E2eeWorker, async (c) => {
        const workerUrl = await c.resolve<string>(T.WorkerUrl);
        return new E2eeWorker(workerUrl);
    });

    c.registerSingleton(
        T.E2eeTransformManager,
        async (c) => new E2eeTransformManager(await c.resolve<E2eeWorker>(T.E2eeWorker)),
    );

    c.registerSingleton(T.AudioManager, async () => new AudioManager());

    c.registerSingleton(T.WebRtcClient, (c) => buildWebRtcClient(c));
}
