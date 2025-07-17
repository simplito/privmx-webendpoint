import { TurnCredentials } from "../Types";
import { PeerCredentials } from "./WebRtcClientTypes";

export class WebRtcConfig {

    // TMP IV
    private static iv: string = "uMuF0aaCZ6+kLrwp";
    // TMP key
    private static key: string = "7c4ba0c3e256369f7c4ba0c3e256369f";

    private static iceTransportPolicy: RTCIceTransportPolicy = "all";
    private static appServer: string = "localhost:8810";
    
    public static getIV() {
        return this.iv;
    }
    public static getKey() {
        return this.key;
    }

    // Default turn servers
    public static getTurnServers(): string[] {
        return [
            "turn:172.16.238.1:3478"
        ];
    }

    public static getRTCIceTransportPolicy() {
        return this.iceTransportPolicy;
    }

    // public static generateTurnConfiguration(credentials: PeerCredentials|undefined) {
    //     const servers: RTCIceServer[] = this.getTurnServers().map(x => (
    //         {
    //             urls: x, 
    //             username: credentials && credentials.username ? credentials.username : undefined, 
    //             credential: credentials && credentials.password ? credentials.password : undefined
    //         }
    //     ));
    //     return {
    //         iceServers: servers,
    //         iceTransportPolicy: this.iceTransportPolicy
    //     }
    // }

    public static generateTurnConfiguration(credentials: TurnCredentials[]) {
        return {
            iceServers: credentials.map(x => {
                return {
                    urls: x.url,
                    username: x.username,
                    credential: x.password
                }
            }),
            iceTransportPolicy: this.iceTransportPolicy
        }
    }

    public static getAppServerAddress() {
        return this.appServer;
    }
}