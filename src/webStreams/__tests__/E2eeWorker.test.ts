import { vi } from "vitest";
import { E2eeWorker } from "../E2eeWorker.js";
import { Key } from "../../Types.js";

/** In-process stand-in for a Web Worker; lets the test drive ack/nack replies. */
class FakeWorker {
    static instances: FakeWorker[] = [];
    posted: Array<Record<string, unknown>> = [];
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onerror: ((ev: unknown) => void) | null = null;
    private readonly listeners = new Set<(ev: MessageEvent) => void>();

    constructor(public url: string) {
        FakeWorker.instances.push(this);
    }
    postMessage(msg: Record<string, unknown>): void {
        this.posted.push(msg);
    }
    addEventListener(type: string, fn: (ev: MessageEvent) => void): void {
        if (type === "message") this.listeners.add(fn);
    }
    removeEventListener(type: string, fn: (ev: MessageEvent) => void): void {
        if (type === "message") this.listeners.delete(fn);
    }
    terminate(): void {}
    /** Deliver a worker→main message to all registered handlers. */
    emit(data: unknown): void {
        const ev = { data } as MessageEvent;
        this.onmessage?.(ev);
        for (const fn of this.listeners) fn(ev);
    }
    setKeysCount(): number {
        return this.posted.filter((m) => m.operation === "setKeys").length;
    }
}

// Flush pending microtasks (chained promises + the worker's async get()).
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const aKey: Key = { keyId: "k", key: new Uint8Array(32), type: 0 };

beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal("Worker", FakeWorker);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("E2eeWorker key-update serialization", () => {
    it("keeps only one setKeys in flight; the next posts only after the first acks", async () => {
        const w = new E2eeWorker("worker.js");
        const p1 = w.setKeys([aKey]);
        const p2 = w.setKeys([aKey]);
        await tick();

        const fake = FakeWorker.instances[0];
        expect(fake.setKeysCount()).toBe(1); // p2 held back until p1 settles

        fake.emit({ operation: "setKeys-ack" });
        await expect(p1).resolves.toBeUndefined();
        await tick();
        expect(fake.setKeysCount()).toBe(2); // p2 posted now

        fake.emit({ operation: "setKeys-ack" });
        await expect(p2).resolves.toBeUndefined();
    });

    it("rejects the pending promise on a nack instead of hanging", async () => {
        const w = new E2eeWorker("worker.js");
        const p = w.setKeys([aKey]);
        await tick();
        FakeWorker.instances[0].emit({ operation: "setKeys-nack", error: "bad length" });
        await expect(p).rejects.toThrow(/bad length/);
    });

    it("keeps the update chain alive after a rejection", async () => {
        const w = new E2eeWorker("worker.js");
        const p1 = w.setKeys([aKey]);
        await tick();
        const fake = FakeWorker.instances[0];

        fake.emit({ operation: "setKeys-nack", error: "x" });
        await expect(p1).rejects.toThrow();

        // A subsequent update must still be applied (the chain didn't break).
        const p2 = w.setKeys([aKey]);
        await tick();
        expect(fake.setKeysCount()).toBe(2);
        fake.emit({ operation: "setKeys-ack" });
        await expect(p2).resolves.toBeUndefined();
    });
});
