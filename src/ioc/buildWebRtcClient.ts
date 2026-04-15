import { AudioManager } from "../webStreams/AudioManager";
import { DataChannelCryptor } from "../webStreams/DataChannelCryptor";
import { DataChannelSession } from "../webStreams/DataChannelSession";
import { E2eeTransformManager } from "../webStreams/E2eeTransformManager";
import { E2eeWorker } from "../webStreams/E2eeWorker";
import { StateChangeDispatcher } from "../webStreams/EventDispatcher";
import { KeyStore } from "../webStreams/KeyStore";
import { KeySyncManager } from "../webStreams/KeySyncManager";
import { PeerConnectionFactory } from "../webStreams/PeerConnectionFactory";
import { PeerConnectionManager } from "../webStreams/PeerConnectionManager";
import { PublisherManager } from "../webStreams/PublisherManager";
import { RemoteStreamListenerRegistry } from "../webStreams/RemoteStreamListenerRegistry";
import { SubscriberManager } from "../webStreams/SubscriberManager";
import { WebRtcClient } from "../webStreams/WebRtcClient";
import { WebRtcContainer, Container } from "./Container";
import { T } from "./Tokens";

/**
 * Builds a fully-wired WebRtcClient and registers all its internal sub-objects
 * into the provided container so that callback closures can resolve them lazily.
 *
 * Circular dependencies are broken by resolving inside the callback closures that
 * are only called during an active call — well after construction completes:
 *
 *   - PeerConnectionFactory.onRemoteTrack  → resolves SubscriberManager lazily
 *   - PeerConnectionManager.onTrickle      → resolves WebRtcClient lazily
 *   - E2eeWorker RMS callback              → resolves AudioManager lazily
 */
export async function buildWebRtcClient(c: Container): Promise<WebRtcClient> {
    const assetsDir    = await c.resolve<string>(T.AssetsBasePath);
    const keyStore     = await c.resolve<KeyStore>(T.KeyStore);
    const dataChannel  = await c.resolve<DataChannelSession>(T.DataChannelSession);
    const dispatcher   = await c.resolve<StateChangeDispatcher>(T.StateChangeDispatcher);
    const registry     = await c.resolve<RemoteStreamListenerRegistry>(T.ListenerRegistry);
    const e2eeTransform = await c.resolve<E2eeTransformManager>(T.E2eeTransformManager);
    const audioManager = await c.resolve<AudioManager>(T.AudioManager);
    const e2eeWorker   = await c.resolve<E2eeWorker>(T.E2eeWorker);

    // --- PeerConnectionFactory ---
    // onRemoteTrack fires during a live call; SubscriberManager is resolved lazily.
    const pcFactory = new PeerConnectionFactory(
        dispatcher,
        dataChannel,
        e2eeTransform,
        registry,
        async (roomId, event) => {
            const sub = await c.resolve<SubscriberManager>(T.SubscriberManager);
            return sub.onRemoteTrack(roomId, event);
        },
    );

    // --- PeerConnectionManager ---
    // onTrickle fires during ICE negotiation; WebRtcClient is resolved lazily.
    const pcm = new PeerConnectionManager(
        (room, streamHandle) => pcFactory.create(room, streamHandle),
        (sessionId, candidate) =>
            c.resolve<WebRtcClient>(T.WebRtcClient).then((client) =>
                client.trickle(sessionId, candidate),
            ),
    );

    const publisher  = new PublisherManager(pcm, audioManager, e2eeTransform);
    const subscriber = new SubscriberManager(pcm, e2eeTransform, registry);
    const keys       = new KeySyncManager(keyStore, e2eeWorker);

    const client = new WebRtcClient(
        publisher, subscriber, dataChannel, keys,
        dispatcher, registry, pcFactory, audioManager, e2eeWorker,
    );

    // Register all internally-constructed objects so the lazy callbacks above
    // and any future resolver can reach them.
    c.registerValue(T.PeerConnectionFactory, pcFactory);
    c.registerValue(T.PeerConnectionManager, pcm);
    c.registerValue(T.PublisherManager,      publisher);
    c.registerValue(T.SubscriberManager,     subscriber);
    c.registerValue(T.KeySyncManager,        keys);
    c.registerValue(T.WebRtcClient,          client);

    return client;
}

/**
 * Registers all WebRTC-session-scoped singletons into a WebRtcContainer.
 * Call this once per createStreamApi() invocation before resolving T.WebRtcClient.
 */
export function registerWebRtcServices(c: WebRtcContainer): void {
    c.registerSingleton(T.KeyStore,    async () => new KeyStore());
    c.registerSingleton(T.StateChangeDispatcher, async () => new StateChangeDispatcher());
    c.registerSingleton(T.ListenerRegistry,      async () => new RemoteStreamListenerRegistry());

    c.registerSingleton(T.DataChannelCryptor, async (c) =>
        new DataChannelCryptor(await c.resolve<KeyStore>(T.KeyStore)));

    c.registerSingleton(T.DataChannelSession, async (c) =>
        new DataChannelSession(await c.resolve<DataChannelCryptor>(T.DataChannelCryptor)));

    // E2eeWorker — the RMS callback resolves AudioManager lazily (built after E2eeWorker).
    c.registerSingleton(T.E2eeWorker, async (c) => {
        const assetsDir = await c.resolve<string>(T.AssetsBasePath);
        return new E2eeWorker(assetsDir, (publisherId, rms) => {
            c.resolve<AudioManager>(T.AudioManager).then((am) =>
                am.onRemoteFrameRms(publisherId, rms),
            );
        });
    });

    c.registerSingleton(T.E2eeTransformManager, async (c) =>
        new E2eeTransformManager(await c.resolve<E2eeWorker>(T.E2eeWorker)));

    c.registerSingleton(T.AudioManager, async (c) => {
        const assetsDir  = await c.resolve<string>(T.AssetsBasePath);
        const e2eeWorker = await c.resolve<E2eeWorker>(T.E2eeWorker);
        return new AudioManager(assetsDir, (rms) => e2eeWorker.sendRms(rms));
    });

    // WebRtcClient — delegates to buildWebRtcClient which registers the rest.
    c.registerSingleton(T.WebRtcClient, (c) => buildWebRtcClient(c));
}
