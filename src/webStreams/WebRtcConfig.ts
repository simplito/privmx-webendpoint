import { TurnCredentials } from "../Types";

export class WebRtcConfig {
    private static readonly iceTransportPolicy: RTCIceTransportPolicy = "all";

    public static generateTurnConfiguration(credentials: TurnCredentials[]): RTCConfiguration {
        return {
            iceServers: credentials.map((x) => ({
                urls: x.url,
                username: x.username,
                credential: x.password,
            })),
            iceTransportPolicy: this.iceTransportPolicy,
        };
    }
}
