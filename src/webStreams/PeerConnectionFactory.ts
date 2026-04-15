import { StreamHandle, DataChannelCryptorDecryptStatus } from "../Types";
import { StreamRoomId } from "./types/ApiTypes";
import { TurnCredentials } from "../Types";
import { Logger } from "./Logger";
import { StateChangeDispatcher } from "./EventDispatcher";
import { DataChannelCryptorError } from "./DataChannelCryptor";
import { DataChannelSession } from "./DataChannelSession";
import { E2eeTransformManager } from "./E2eeTransformManager";
import { RemoteStreamListenerRegistry } from "./RemoteStreamListenerRegistry";
import { RTCConfigurationWithInsertableStreams } from "./types/WebRtcExtensions";

/**
 * Builds RTCPeerConnection instances with all event listeners wired.
 * Owns ICE/connection-state logging, data channel decryption dispatch,
 * and connection-state change events. Track events are forwarded via callback
 * so the subscriber layer can handle E2EE setup after ICE connects.
 */
export class PeerConnectionFactory {
    private turnCredentials: TurnCredentials[] = [];
    private readonly logger = new Logger();

    constructor(
        private readonly eventsDispatcher: StateChangeDispatcher,
        private readonly dataChannelSession: DataChannelSession,
        private readonly e2eeTransformManager: E2eeTransformManager,
        private readonly listenerRegistry: RemoteStreamListenerRegistry,
        private readonly onRemoteTrack: (
            roomId: StreamRoomId,
            event: RTCTrackEvent,
        ) => Promise<void>,
    ) {}

    setTurnCredentials(credentials: TurnCredentials[]): void {
        this.turnCredentials = credentials;
    }

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
        pc.addEventListener("track", async (event) => {
            await this.onRemoteTrack(roomId, event);
        });

        return pc;
    }

    private wireDataChannel(roomId: StreamRoomId, dc: RTCDataChannel): void {
        dc.binaryType = "arraybuffer";
        dc.onmessage = async (dataEvent) => {
            this.logger.debug("datachannel message received");
            const remoteStreamId = Number(dc.label);
            const raw = dataEvent.data;
            const frame: Uint8Array =
                raw instanceof Uint8Array
                    ? raw
                    : raw instanceof ArrayBuffer
                      ? new Uint8Array(raw)
                      : new Uint8Array(raw.buffer);

            try {
                const decrypted = await this.dataChannelSession.decrypt(remoteStreamId, frame);
                this.listenerRegistry.dispatchData(
                    roomId,
                    remoteStreamId,
                    decrypted.data,
                    DataChannelCryptorDecryptStatus.OK,
                );
            } catch (e) {
                if (e instanceof DataChannelCryptorError) {
                    this.listenerRegistry.dispatchData(
                        roomId,
                        remoteStreamId,
                        new Uint8Array(),
                        e.code,
                    );
                } else {
                    throw e;
                }
            }
        };
    }
}
