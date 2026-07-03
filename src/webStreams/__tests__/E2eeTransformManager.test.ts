import type { Mock, Mocked } from "vitest";
import { E2eeTransformManager } from "../E2eeTransformManager.js";
import { E2eeWorker } from "../E2eeWorker.js";
import {
    WindowWithRTCRtpScriptTransform,
    RTCRtpReceiverWithTransform,
    RTCRtpSenderWithTransform,
} from "../types/WebRtcExtensions.js";

// ---- window stub (Jest runs in node, not jsdom) ------------------------------

let testWindow: WindowWithRTCRtpScriptTransform;

function resetTestWindow(): void {
    testWindow = {} as WindowWithRTCRtpScriptTransform;
    (global as unknown as { window: WindowWithRTCRtpScriptTransform }).window = testWindow;
}
resetTestWindow();

// ---- E2eeWorker mock --------------------------------------------------------

function makeMockWorker(): Mocked<E2eeWorker> {
    return {
        get: vi.fn().mockResolvedValue({ _fakeWorker: true }),
        setKeys: vi.fn().mockResolvedValue(undefined),
        sendRms: vi.fn().mockResolvedValue(undefined),
        postEncode: vi.fn().mockResolvedValue(undefined),
        postDecode: vi.fn().mockResolvedValue(undefined),
        postStop: vi.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<E2eeWorker>;
}

// ---- RTCRtp stubs -----------------------------------------------------------

function makeSender(): RTCRtpSenderWithTransform {
    return {
        transform: undefined,
        createEncodedStreams: vi.fn().mockReturnValue({
            readable: { _type: "readable" },
            writable: { _type: "writable" },
        }),
    } as unknown as RTCRtpSenderWithTransform;
}

function makeReceiver(trackId = "track-1", kind = "audio"): RTCRtpReceiverWithTransform {
    return {
        track: { id: trackId, kind },
        transform: undefined,
        createEncodedStreams: vi.fn().mockReturnValue({
            readable: { _type: "readable" },
            writable: { _type: "writable" },
        }),
    } as unknown as RTCRtpReceiverWithTransform;
}

// ---- tests ------------------------------------------------------------------

describe("E2eeTransformManager", () => {
    let worker: Mocked<E2eeWorker>;
    let manager: E2eeTransformManager;

    beforeEach(() => {
        resetTestWindow();
        worker = makeMockWorker();
        manager = new E2eeTransformManager(worker);
    });

    // -------------------------------------------------------------------------
    // setupSenderTransform
    // -------------------------------------------------------------------------

    describe("setupSenderTransform - RTCRtpScriptTransform available", () => {
        beforeEach(() => {
            testWindow.RTCRtpScriptTransform = vi.fn(function () {
                return { _isTransform: true };
            });
        });

        it("assigns a transform on the sender", async () => {
            const sender = makeSender();
            await manager.setupSenderTransform(sender, "audio");
            expect(sender.transform).toBeDefined();
        });

        it("does NOT call createEncodedStreams", async () => {
            const sender = makeSender();
            await manager.setupSenderTransform(sender, "audio");
            expect(sender.createEncodedStreams).not.toHaveBeenCalled();
        });

        it("calls e2eeWorker.get() to obtain the worker instance", async () => {
            await manager.setupSenderTransform(makeSender(), "audio");
            expect(worker.get).toHaveBeenCalledTimes(1);
        });

        it("constructs RTCRtpScriptTransform with operation=encode", async () => {
            await manager.setupSenderTransform(makeSender(), "audio");
            expect(testWindow.RTCRtpScriptTransform).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ operation: "encode" }),
            );
        });
    });

    describe("setupSenderTransform - EncodedStreams fallback", () => {
        it("calls createEncodedStreams and posts encode to worker", async () => {
            const sender = makeSender();
            const { readable, writable } = sender.createEncodedStreams();
            (sender.createEncodedStreams as Mock).mockClear();

            await manager.setupSenderTransform(sender, "audio");

            expect(sender.createEncodedStreams).toHaveBeenCalledTimes(1);
            expect(worker.postEncode).toHaveBeenCalledWith(readable, writable, "audio");
        });

        it("does NOT assign sender.transform", async () => {
            const sender = makeSender();
            await manager.setupSenderTransform(sender, "audio");
            expect(sender.transform).toBeUndefined();
        });
    });

    // -------------------------------------------------------------------------
    // setupReceiverTransform
    // -------------------------------------------------------------------------

    describe("setupReceiverTransform - RTCRtpScriptTransform available", () => {
        beforeEach(() => {
            testWindow.RTCRtpScriptTransform = vi.fn(function () {
                return { _isTransform: true };
            });
        });

        it("assigns a transform on the receiver", async () => {
            const receiver = makeReceiver("track-rx");
            await manager.setupReceiverTransform(receiver, 5);
            expect(receiver.transform).toBeDefined();
        });

        it("does NOT call createEncodedStreams", async () => {
            const receiver = makeReceiver("track-rx");
            await manager.setupReceiverTransform(receiver, 5);
            expect(receiver.createEncodedStreams).not.toHaveBeenCalled();
        });

        it("constructs RTCRtpScriptTransform with operation=decode, correct id and publisherId", async () => {
            const receiver = makeReceiver("track-rx-id");
            await manager.setupReceiverTransform(receiver, 42);
            expect(testWindow.RTCRtpScriptTransform).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    operation: "decode",
                    id: "track-rx-id",
                    publisherId: 42,
                }),
            );
        });

        it("falls through to EncodedStreams when transform is already assigned", async () => {
            const receiver = makeReceiver("track-already-transformed");
            (receiver as any).transform = { _existing: true };

            await manager.setupReceiverTransform(receiver, 1);

            // RTCRtpScriptTransform constructor should not have been called
            expect(testWindow.RTCRtpScriptTransform).not.toHaveBeenCalled();
        });
    });

    describe("setupReceiverTransform - EncodedStreams fallback", () => {
        it("calls createEncodedStreams and posts decode to worker", async () => {
            const receiver = makeReceiver("track-enc");
            await manager.setupReceiverTransform(receiver, 99);

            expect(receiver.createEncodedStreams).toHaveBeenCalledTimes(1);
            expect(worker.postDecode).toHaveBeenCalledWith(
                "track-enc",
                99,
                expect.anything(),
                expect.anything(),
                "audio",
            );
        });

        it("does not call createEncodedStreams a second time for the same receiver", async () => {
            const receiver = makeReceiver("track-dedup-enc");
            await manager.setupReceiverTransform(receiver, 1);
            await manager.setupReceiverTransform(receiver, 1);

            expect(receiver.createEncodedStreams).toHaveBeenCalledTimes(1);
            expect(worker.postDecode).toHaveBeenCalledTimes(1);
        });

        it("is a no-op when createEncodedStreams is not a function", async () => {
            const receiver = makeReceiver("track-no-api");
            delete (receiver as any).createEncodedStreams;

            await expect(manager.setupReceiverTransform(receiver, 1)).resolves.toBeUndefined();
            expect(worker.postDecode).not.toHaveBeenCalled();
        });
    });

    // -------------------------------------------------------------------------
    // teardownReceiver
    // -------------------------------------------------------------------------

    describe("teardownReceiver", () => {
        it("posts a stop message for a receiver set up via EncodedStreams", async () => {
            const receiver = makeReceiver("track-tear");
            await manager.setupReceiverTransform(receiver, 7);
            await manager.teardownReceiver(receiver);

            expect(worker.postStop).toHaveBeenCalledWith("track-tear");
        });

        it("is a no-op for a receiver that was never set up", async () => {
            const receiver = makeReceiver("unknown");
            await expect(manager.teardownReceiver(receiver)).resolves.toBeUndefined();
            expect(worker.postStop).not.toHaveBeenCalled();
        });

        it("removes the receiver from the registry so a second teardown is also a no-op", async () => {
            const receiver = makeReceiver("track-double-tear");
            await manager.setupReceiverTransform(receiver, 3);
            await manager.teardownReceiver(receiver);
            await manager.teardownReceiver(receiver);

            expect(worker.postStop).toHaveBeenCalledTimes(1);
        });
    });
});
