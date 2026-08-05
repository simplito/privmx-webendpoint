/**
 * IoC container token registry.
 *
 * `global:` - created once during EndpointFactory.setup(), live for the application lifetime.
 * `conn:`   - created once per Connection (connect / connectPublic call), scoped to that connection.
 * `rtc:`    - created once per createStreamApi() call, scoped to that connection's stream session.
 * @internal
 */
export const T = {
    // Global scope
    Api: "global:Api",
    AssetsBasePath: "global:AssetsBasePath",
    WorkerUrl: "global:WorkerUrl",
    EventQueue: "global:EventQueue",
    CryptoApi: "global:CryptoApi",

    // Connection scope (one container per Connection instance)
    ConnectionPtr: "conn:ConnectionPtr",
    ThreadApi: "conn:ThreadApi",
    StoreApi: "conn:StoreApi",
    KvdbApi: "conn:KvdbApi",
    LockApi: "conn:LockApi",
    EventApi: "conn:EventApi",
    InboxApi: "conn:InboxApi",
    SearchApi: "conn:SearchApi",
    StreamApi: "conn:StreamApi",

    // WebRTC sub-graph (connection-scoped, one per createStreamApi call)
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

    // API layer (connection-scoped)
    StreamApiNative: "api:StreamApiNative",
    WebRtcInterfaceImpl: "api:WebRtcInterfaceImpl",
} as const;

/**
 * Union of all registered IoC token string literals.
 * @internal
 */
export type Token = (typeof T)[keyof typeof T];

/**
 * Fully-resolved runtime asset locations computed once by
 * `EndpointFactory.setup()` and shared with the WebRTC sub-graph. Each URL is
 * either an explicit per-asset override or derived from `assetsBasePath`.
 * @internal
 */
export interface ResolvedAssetUrls {
    /** Base path/URL unspecified assets are resolved against (legacy single-path mode). */
    basePath: string;
    /** Absolute URL of `privmx-worker.js`, loaded by the E2EE `Worker`. */
    workerUrl: string;
}
