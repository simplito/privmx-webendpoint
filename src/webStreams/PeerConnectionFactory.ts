import { TurnCredentials } from "../Types.js";
import { DecryptedDataChannelMessage, StreamHandle, StreamRoomId } from "./types/ApiTypes.js";
import { Logger } from "./Logger.js";
import { StateChangeDispatcher } from "./EventDispatcher.js";
import { E2eeTransformManager } from "./E2eeTransformManager.js";
import { RemoteStreamListenerRegistry } from "./RemoteStreamListenerRegistry.js";
import { RTCConfigurationWithInsertableStreams } from "./types/WebRtcExtensions.js";

/**
 * Builds `RTCPeerConnection` instances with all event listeners wired.
 *
 * Responsibilities:
 * - Constructs the `RTCConfiguration` from the current TURN credentials.
 * - Logs ICE/signalling state changes via `Logger`.
 * - Forwards `connectionstatechange` events to `StateChangeDispatcher`.
 * - Registers newly-opened remote data channels and decrypts incoming frames
 *   via the native `StreamApiLow` message encryptor (through the injected
 *   `registerRemoteDataChannel`/`decryptDataChannelMessage` callbacks), then
 *   dispatches them via `RemoteStreamListenerRegistry`.
 * - Forwards `track` events to a caller-supplied `onRemoteTrack` callback so
 *   the subscriber layer can install E2EE receiver transforms after ICE connects.
 * @internal
 */
export class PeerConnectionFactory {
    private turnCredentials: TurnCredentials[] = [];
    private readonly logger = new Logger();

    constructor(
        private readonly eventsDispatcher: StateChangeDispatcher,
        private readonly registerRemoteDataChannel: (
            roomId: StreamRoomId,
            remoteStreamId: string,
        ) => Promise<void>,
        private readonly decryptDataChannelMessage: (
            roomId: StreamRoomId,
            remoteStreamId: string,
            encryptedData: Uint8Array,
        ) => Promise<DecryptedDataChannelMessage>,
        private readonly e2eeTransformManager: E2eeTransformManager,
        private readonly listenerRegistry: RemoteStreamListenerRegistry,
        private readonly onRemoteTrack: (
            roomId: StreamRoomId,
            event: RTCTrackEvent,
        ) => Promise<void>,
    ) {}

    /**
     * Replaces the TURN server credentials used in all subsequent `create()` calls.
     */
    setTurnCredentials(credentials: TurnCredentials[]): void {
        this.turnCredentials = credentials;
    }

    /**
     * Creates a new `RTCPeerConnection` for `roomId` with all event listeners
     * attached. If `streamHandle` is provided, `connectionstatechange` events
     * are forwarded to `StateChangeDispatcher` so `StreamApi` can surface them
     * to the application layer.
     */
    create(roomId: StreamRoomId, streamHandle?: StreamHandle): RTCPeerConnection {
        const configuration: RTCConfigurationWithInsertableStreams = {
            iceServers: this.turnCredentials.map((c) => ({
                urls: c.url,
                username: c.username,
                credential: c.password,
            })),
            iceTransportPolicy: "all",
            encodedInsertableStreams: true,
        };

        const pc = new RTCPeerConnection(configuration);

        pc.addEventListener("icegatheringstatechange", () => {
            this.logger.debug("icegatheringstatechange:", pc.iceGatheringState);
        });
        pc.addEventListener("icecandidateerror", (event) => {
            this.logger.debug("icecandidateerror:", event);
        });
        pc.addEventListener("iceconnectionstatechange", () => {
            this.logger.debug("iceconnectionstatechange:", pc.iceConnectionState);
        });
        pc.addEventListener("negotiationneeded", () => {
            this.logger.debug("negotiationneeded");
        });
        pc.addEventListener("signalingstatechange", () => {
            this.logger.debug("signalingstatechange:", pc.signalingState);
        });
        pc.addEventListener("connectionstatechange", () => {
            this.logger.debug("connectionstatechange:", pc.connectionState);
            if (streamHandle !== undefined) {
                this.eventsDispatcher.emit({ streamHandle, state: pc.connectionState });
            }
        });
        pc.addEventListener("datachannel", (event) => {
            this.logger.debug("RECV datachannel:", event.channel.id, event.channel.label);
            this.wireDataChannel(roomId, event.channel);
        });
        pc.addEventListener("track", (event) => {
            this.onRemoteTrack(roomId, event).catch((e) => {
                this.logger.error("onRemoteTrack failed:", e);
            });
        });

        return pc;
    }

    private wireDataChannel(roomId: StreamRoomId, dc: RTCDataChannel): void {
        dc.binaryType = "arraybuffer";
        const remoteStreamId = dc.label;

        // Registered synchronously (before any message can be processed) so the
        // native encryptor's replay-protection state exists by the time the first
        // frame is decrypted; dc.onmessage is still assigned right away below so
        // no frames arriving in this tick are missed.
        const registered = this.registerRemoteDataChannel(roomId, remoteStreamId).catch((e) => {
            this.logger.error("registerRemoteDataChannel failed:", e);
            throw e;
        });

        dc.onmessage = async (dataEvent) => {
            this.logger.debug("datachannel message received");
            try {
                await registered;
            } catch {
                return;
            }

            const raw = dataEvent.data;
            const frame: Uint8Array =
                raw instanceof Uint8Array
                    ? raw
                    : raw instanceof ArrayBuffer
                      ? new Uint8Array(raw)
                      : new Uint8Array(raw.buffer);

            let decrypted: DecryptedDataChannelMessage;
            try {
                decrypted = await this.decryptDataChannelMessage(roomId, remoteStreamId, frame);
            } catch (e) {
                this.logger.error("Unexpected error decrypting data channel frame:", e);
                return;
            }
            this.listenerRegistry.dispatchData(
                roomId,
                Number(remoteStreamId),
                decrypted.data,
                decrypted.statusCode,
            );
        };
    }
}
