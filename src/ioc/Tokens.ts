/**
 * IoC container token registry.
 *
 * `global:` — created once during EndpointFactory.setup(), live for the application lifetime.
 * `conn:`   — created once per Connection (connect / connectPublic call), scoped to that connection.
 * `rtc:`    — created once per createStreamApi() call, scoped to that connection's stream session.
 */
export const T = {
    // -------------------------------------------------------------------------
    // Global scope
    // -------------------------------------------------------------------------
    Api: "global:Api",
    AssetsBasePath: "global:AssetsBasePath",
    EventQueue: "global:EventQueue",
    CryptoApi: "global:CryptoApi",

    // -------------------------------------------------------------------------
    // Connection scope  (one container per Connection instance)
    // -------------------------------------------------------------------------
    ConnectionPtr: "conn:ConnectionPtr",
    ThreadApi: "conn:ThreadApi",
    StoreApi: "conn:StoreApi",
    KvdbApi: "conn:KvdbApi",
    EventApi: "conn:EventApi",
    InboxApi: "conn:InboxApi",
    StreamApi: "conn:StreamApi",

    // -------------------------------------------------------------------------
    // WebRTC sub-graph  (connection-scoped, one per createStreamApi call)
    // -------------------------------------------------------------------------
    KeyStore: "rtc:KeyStore",
    DataChannelCryptor: "rtc:DataChannelCryptor",
    DataChannelSession: "rtc:DataChannelSession",
    StateChangeDispatcher: "rtc:StateChangeDispatcher",
    ListenerRegistry: "rtc:ListenerRegistry",
    E2eeWorker: "rtc:E2eeWorker",
    E2eeTransformManager: "rtc:E2eeTransformManager",
    AudioManager: "rtc:AudioManager",
    PeerConnectionFactory: "rtc:PeerConnectionFactory",
    PeerConnectionManager: "rtc:PeerConnectionManager",
    PublisherManager: "rtc:PublisherManager",
    SubscriberManager: "rtc:SubscriberManager",
    KeySyncManager: "rtc:KeySyncManager",
    WebRtcClient: "rtc:WebRtcClient",

    // -------------------------------------------------------------------------
    // API layer  (connection-scoped)
    // -------------------------------------------------------------------------
    StreamApiNative: "api:StreamApiNative",
    WebRtcInterfaceImpl: "api:WebRtcInterfaceImpl",
} as const;

export type Token = (typeof T)[keyof typeof T];
