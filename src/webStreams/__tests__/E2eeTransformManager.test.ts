import { E2eeTransformManager } from "../E2eeTransformManager";
import { WebWorker } from "../WebWorkerHelper";
import {
    WindowWithRTCRtpScriptTransform,
    RTCRtpReceiverWithTransform,
    RTCRtpSenderWithTransform,
} from "../types/WebRtcExtensions";

// ---- minimal window stub (jest runs in "node" env, not jsdom) ----
// Use a mutable reference so individual tests can reset it between runs.
let testWindow: WindowWithRTCRtpScriptTransform;

function resetTestWindow(): void {
    testWindow = {} as WindowWithRTCRtpScriptTransform;
    (global as unknown as { window: WindowWithRTCRtpScriptTransform }).window = testWindow;
}
resetTestWindow();

// ---- helpers ----

interface WorkerMessage {
    operation: string;
    id?: string;
    publisherId?: number;
    readableStream?: unknown;
    writableStream?: unknown;
}

class FakeWorker {
    private listeners: Array<(ev: MessageEvent) => void> = [];
    public postedMessages: Array<{ data: WorkerMessage; transfer?: unknown[] }> = [];

    addEventListener(_type: string, fn: (ev: MessageEvent) => void): void {
        this.listeners.push(fn);
    }
    removeEventListener(_type: string, fn: (ev: MessageEvent) => void): void {
        this.listeners = this.listeners.filter((l) => l !== fn);
    }
    postMessage(data: WorkerMessage, transfer?: unknown[]): void {
        this.postedMessages.push({ data, transfer });
    }
    emit(data: WorkerMessage): void {
        this.listeners.forEach((fn) => fn({ data } as MessageEvent));
    }
}

interface FakeWorkerApi {
    init_e2ee: jest.Mock;
    getWorker: jest.Mock<FakeWorker>;
    setKeys: jest.Mock;
    _worker: FakeWorker;
    onFrame: (frameInfo: { rms: number; publisherId: number }) => void;
}

jest.mock("../WebWorkerHelper", () => {
    return {
        WebWorker: jest.fn().mockImplementation(
            (_assetsDir: string, onFrame: FakeWorkerApi["onFrame"]) => {
                let worker: FakeWorker;
                const api: FakeWorkerApi = {
                    init_e2ee: jest.fn().mockImplementation(() => {
                        worker = new FakeWorker();
                        return Promise.resolve();
                    }),
                    getWorker: jest.fn(() => worker),
                    setKeys: jest.fn().mockResolvedValue(undefined),
                    get _worker() {
                        return worker;
                    },
                    onFrame,
                };
                return api;
            },
        ),
    };
});

function makeReceiver(trackId = "track-1"): RTCRtpReceiverWithTransform {
    return {
        track: { id: trackId },
        transform: undefined,
        createEncodedStreams: jest.fn().mockReturnValue({
            readable: { _type: "readable" },
            writable: { _type: "writable" },
        }),
    } as unknown as RTCRtpReceiverWithTransform;
}

describe("E2eeTransformManager", () => {
    let manager: E2eeTransformManager;
    let onFrameSpy: jest.Mock;

    beforeEach(() => {
        resetTestWindow();
        onFrameSpy = jest.fn();
        manager = new E2eeTransformManager("/assets", onFrameSpy);
        (WebWorker as jest.Mock).mockClear();
    });

    async function getWorkerAndApi(): Promise<{ worker: FakeWorker; api: FakeWorkerApi }> {
        await manager.getWorker();
        const api = (await manager.getWorkerApi()) as unknown as FakeWorkerApi;
        return { worker: api._worker, api };
    }

    describe("getWorker", () => {
        it("lazily initialises WebWorker on first call", async () => {
            await manager.getWorker();
            expect(WebWorker).toHaveBeenCalledTimes(1);
        });

        it("returns the same worker on subsequent calls", async () => {
            const w1 = await manager.getWorker();
            const w2 = await manager.getWorker();
            expect(w1).toBe(w2);
            expect(WebWorker).toHaveBeenCalledTimes(1);
        });
    });

    describe("setKeys", () => {
        it("delegates to WebWorker.setKeys", async () => {
            const { api } = await getWorkerAndApi();
            const keys = [{ keyId: "k1", key: new Uint8Array(32), type: 0 }];
            await manager.setKeys(keys);
            expect(api.setKeys).toHaveBeenCalledWith(keys);
        });
    });

    describe("initPipeline", () => {
        it("posts init-pipeline and resolves when the worker echoes back", async () => {
            const { worker } = await getWorkerAndApi();
            const promise = manager.initPipeline("track-abc", 7);

            // initPipeline does `await this.getWorker()` internally — let that
            // microtask settle so the message listener is registered before we emit.
            await Promise.resolve();
            worker.emit({ operation: "init-pipeline", id: "track-abc" });

            await expect(promise).resolves.toBeUndefined();

            const sent = worker.postedMessages.find((m) => m.data.operation === "init-pipeline");
            expect(sent?.data).toMatchObject({
                operation: "init-pipeline",
                id: "track-abc",
                publisherId: 7,
            });
        });

        it("does not resolve when a different track id is echoed", async () => {
            const { worker } = await getWorkerAndApi();
            let resolved = false;
            manager.initPipeline("track-A", 1).then(() => {
                resolved = true;
            });

            await Promise.resolve();
            worker.emit({ operation: "init-pipeline", id: "track-B" }); // wrong id
            await Promise.resolve();
            expect(resolved).toBe(false);
        });
    });

    describe("setupSenderTransform — RTCRtpScriptTransform unavailable", () => {
        it("posts an encode message with the encoded streams", async () => {
            const { worker } = await getWorkerAndApi();
            const readable = { _type: "readable" };
            const writable = { _type: "writable" };
            const sender: RTCRtpSenderWithTransform = {
                createEncodedStreams: jest.fn().mockReturnValue({ readable, writable }),
            } as unknown as RTCRtpSenderWithTransform;

            await manager.setupSenderTransform(sender);

            const msg = worker.postedMessages.find((m) => m.data.operation === "encode");
            expect(msg?.data).toMatchObject({
                operation: "encode",
                readableStream: readable,
                writableStream: writable,
            });
            expect(msg?.transfer).toEqual([readable, writable]);
        });
    });

    describe("setupSenderTransform — RTCRtpScriptTransform available", () => {
        beforeEach(() => {
            testWindow.RTCRtpScriptTransform = jest
                .fn()
                .mockImplementation(() => ({ _isTransform: true }));
        });

        it("assigns a transform on the sender instead of posting a message", async () => {
            const { worker } = await getWorkerAndApi();
            const sender = {} as RTCRtpSenderWithTransform;

            await manager.setupSenderTransform(sender);

            expect(sender.transform).toBeDefined();
            const encodeMsg = worker.postedMessages.find((m) => m.data.operation === "encode");
            expect(encodeMsg).toBeUndefined();
        });
    });

    describe("setupReceiverTransform — EncodedStreams fallback", () => {
        it("calls createEncodedStreams and posts a decode message", async () => {
            const { worker } = await getWorkerAndApi();
            const receiver = makeReceiver("track-recv");

            setTimeout(() => {
                worker.emit({ operation: "init-pipeline", id: "track-recv" });
            }, 0);

            await manager.setupReceiverTransform(receiver, 99);

            const decodeMsg = worker.postedMessages.find((m) => m.data.operation === "decode");
            expect(decodeMsg?.data).toMatchObject({
                operation: "decode",
                id: "track-recv",
                publisherId: 99,
            });
        });

        it("does not call createEncodedStreams a second time for the same receiver", async () => {
            const { worker } = await getWorkerAndApi();
            const receiver = makeReceiver("track-dedup");
            const createStreamsSpy = receiver.createEncodedStreams as jest.Mock;

            setTimeout(() => worker.emit({ operation: "init-pipeline", id: "track-dedup" }), 0);
            await manager.setupReceiverTransform(receiver, 1);
            await manager.setupReceiverTransform(receiver, 1);

            expect(createStreamsSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe("setupReceiverTransform — RTCRtpScriptTransform available", () => {
        beforeEach(() => {
            testWindow.RTCRtpScriptTransform = jest
                .fn()
                .mockImplementation(() => ({ _isTransform: true }));
        });

        it("assigns a transform on the receiver", async () => {
            const receiver = makeReceiver("track-script");
            await manager.setupReceiverTransform(receiver, 5);
            expect(receiver.transform).toBeDefined();
        });

        it("does not call createEncodedStreams", async () => {
            const receiver = makeReceiver("track-script2");
            const createStreamsSpy = receiver.createEncodedStreams as jest.Mock;
            await manager.setupReceiverTransform(receiver, 5);
            expect(createStreamsSpy).not.toHaveBeenCalled();
        });
    });

    describe("teardownReceiver", () => {
        it("posts a stop message for a receiver that was set up", async () => {
            const { worker } = await getWorkerAndApi();
            const receiver = makeReceiver("track-tear");

            setTimeout(() => worker.emit({ operation: "init-pipeline", id: "track-tear" }), 0);
            await manager.setupReceiverTransform(receiver, 2);
            await manager.teardownReceiver(receiver);

            const stopMsg = worker.postedMessages.find((m) => m.data.operation === "stop");
            expect(stopMsg?.data).toMatchObject({ operation: "stop", id: "track-tear" });
        });

        it("is a no-op for a receiver that was never set up", async () => {
            await getWorkerAndApi();
            const receiver = makeReceiver("unknown");
            await expect(manager.teardownReceiver(receiver)).resolves.toBeUndefined();
        });
    });

    describe("onFrame callback", () => {
        it("forwards publisherId and rms to the provided callback", async () => {
            const { api } = await getWorkerAndApi();
            api.onFrame({ rms: 0.42, publisherId: 3 });
            expect(onFrameSpy).toHaveBeenCalledWith(3, 0.42);
        });
    });
});
