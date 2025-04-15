
interface NativeObjInfo {
    ptr: number;
    apiId: string;
}

export class FinalizationHelper {
    private static instance: FinalizationHelper;
    public static getInstance(wasmApi: any) {
        if (!this.instance) {
            this.instance = new FinalizationHelper(wasmApi);
        }
    }

    private finalizationRegistry: FinalizationRegistry<NativeObjInfo>;

    private constructor(private wasmApi: any) {
        this.finalizationRegistry = new FinalizationRegistry(onCleanup => {
            console.log("Object freed..", onCleanup);
        });
    }

    public register(target: WeakKey, info: NativeObjInfo) {
        this.finalizationRegistry.register(target, info, target);
    }
}