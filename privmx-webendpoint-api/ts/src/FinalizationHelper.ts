import { ApiStatic } from "./api/ApiStatic";
import { ExtKeyNative } from "./api/ExtKeyNative";

interface NativeObjInfo {
    ptr: number;
    onFree: () => Promise<void>;
}

export class FinalizationHelper {
    private static instance: FinalizationHelper;
    private static wasmLib: any;

    public static init(wasmLib: any) {
        FinalizationHelper.wasmLib = wasmLib;
    }
    public static getInstance() {
        if (!FinalizationHelper.wasmLib) {
            throw new Error("Initialize first with the WASM Library object");
        }
        if (!this.instance) {
            this.instance = new FinalizationHelper(FinalizationHelper.wasmLib);
        }
        return this.instance;
    }

    private finalizationRegistry: FinalizationRegistry<NativeObjInfo>;
    private finalizationQueue: (() => Promise<void> | null)[] = [];
    private scheduler: any = null;

    private constructor(private wasmLib: any) {
        this.finalizationRegistry = new FinalizationRegistry(onCleanup => {
            const api = ApiStatic.getInstance();
            this.finalizationQueue.push(onCleanup.onFree);
            console.log("Object queued to be freed..", onCleanup);
            this.scheduleCleanup();
        });
    }

    private scheduleCleanup() {
        if (this.scheduler) {
            return;
        }
        console.log("cleanup scheduled..");
        this.scheduler = setTimeout(async () => {
            console.log("cleanup fired.");
            for (const freeCall of this.finalizationQueue) {
                await freeCall();
            }
            this.finalizationQueue = [];
            clearTimeout(this.scheduler);
            this.scheduler = null;
            console.log("cleanup ended");
        }, 1000);
    }

    public register(target: WeakKey, info: NativeObjInfo) {
        this.finalizationRegistry.register(target, info, target);
    }
}