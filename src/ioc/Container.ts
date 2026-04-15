type Factory<T> = (c: Container) => Promise<T>;

interface Registration<T> {
    factory: Factory<T>;
    singleton: boolean;
    cached: Promise<T> | undefined;
}

/**
 * Minimal async IoC container.
 *
 * - Singletons: factory is called once; all subsequent resolves return the same Promise.
 * - Values: pre-constructed instance stored as a resolved singleton.
 *
 * Circular dependencies are broken by resolving inside callback closures that are
 * called after all registrations have been set up, not at construction time.
 */
export class Container {
    private readonly reg = new Map<string | symbol, Registration<unknown>>();

    registerSingleton<T>(token: string | symbol, factory: Factory<T>): void {
        this.reg.set(token, { factory: factory as Factory<unknown>, singleton: true, cached: undefined });
    }

    registerValue<T>(token: string | symbol, value: T): void {
        const resolved = Promise.resolve(value);
        this.reg.set(token, { factory: () => resolved, singleton: true, cached: resolved });
    }

    resolve<T>(token: string | symbol): Promise<T> {
        const entry = this.reg.get(token);
        if (!entry) throw new Error(`Container: no registration for token "${String(token)}"`);
        if (entry.singleton) {
            if (!entry.cached) entry.cached = entry.factory(this);
            return entry.cached as Promise<T>;
        }
        return entry.factory(this) as Promise<T>;
    }
}

/**
 * Application-lifetime container.
 * Holds singletons that are created once during `EndpointFactory.setup()` and
 * live for the entire lifetime of the application: EventQueue, CryptoApi, the
 * raw WASM Api handle, etc.
 */
export class GlobalContainer extends Container {}

/**
 * Per-connection scoped container.
 * Created once per `EndpointFactory.connect()` / `connectPublic()` call.
 * Holds ThreadApi, StoreApi, KvdbApi, EventApi, InboxApi, StreamApi — all
 * tied to a single authenticated Connection instance.
 */
export class ConnectionContainer extends Container {}

/**
 * Per-stream-session scoped container.
 * Created once per `EndpointFactory.createStreamApi()` call inside a
 * ConnectionContainer.  Holds the entire WebRTC sub-graph: KeyStore,
 * PeerConnectionManager, E2eeWorker, AudioManager, etc.
 */
export class WebRtcContainer extends Container {}
