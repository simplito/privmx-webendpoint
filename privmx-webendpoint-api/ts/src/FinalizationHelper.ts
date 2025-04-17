import { ApiStatic } from "./api/ApiStatic";
import { ExtKeyNative } from "./api/ExtKeyNative";

interface NativeObjInfo {
    ptr: number;
    apiId: string;
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

    private constructor(private wasmLib: any) {
        this.finalizationRegistry = new FinalizationRegistry(onCleanup => {
            const api = ApiStatic.getInstance();

            if (onCleanup.apiId === "extKey") {
                const nativeApi = new ExtKeyNative(api);
                nativeApi.deleteExtKey(onCleanup.ptr);
                console.log("Object freed..", onCleanup);
            }
            
        });
    }

    public register(target: WeakKey, info: NativeObjInfo) {
        this.finalizationRegistry.register(target, info, target);
    }
}