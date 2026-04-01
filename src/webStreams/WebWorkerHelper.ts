import { Key } from "../Types";
import { InitializeEvent, SetKeysEvent } from "./worker/WorkerEvents";
// export class WebWorkerOld {
//     worker: Worker | undefined;
//     constructor(private encKey: EncKey) {
//         // this.worker = new Worker(new URL("./worker/worker.ts", import.meta.url), {name: "worker"});
//         this.worker = new Worker(new URL("worker.js", import.meta.url), { name: "worker" });
//         this.worker.onerror = e => console.error(e);

//         this.worker.postMessage({
//             operation: 'initialize',
//             key: encKey.key, iv: encKey.iv
//         });
//     }
//     getWorker() {
//         return this.worker;
//     }
// }

interface WorkerLogEvent {
    data:
        | {
              data: Object | String;
              type: "error" | "debug";
          }
        | {
              type: "rms";
              rms: number;
              receiverId: number;
              publisherId: number;
          };
}

export interface FrameInfo {
    rms: number;
    kind: "audio";
    receiverId: number;
    publisherId: number;
}

export class WebWorker {
    worker: Worker | undefined;
    constructor(
        private assetsDir: string,
        private onFrame: (frameInfo: FrameInfo) => void,
    ) {}

    async init_e2ee() {
        this.worker = new Worker(this.assetsDir + "/privmx-worker.js");
        this.worker.onmessage = (event: WorkerLogEvent) => {
            try {
                if (event.data.type === "rms") {
                    if (this.onFrame !== undefined && typeof this.onFrame === "function") {
                        this.onFrame({
                            rms: event.data.rms,
                            kind: "audio",
                            receiverId: event.data.receiverId,
                            publisherId: event.data.publisherId,
                        });
                    }
                }
            } catch (e) {
                console.error("[Worker]: invalid event");
            }
        };
        this.worker.onerror = (e) => console.error(e);

        this.worker.postMessage(<InitializeEvent>{
            operation: "initialize",
        });
    }

    getWorker() {
        return this.worker;
    }

    setKeys(keys: Key[]) {
        if (!this.worker) {
            console.warn("Cannot pass keys to e2ee worker as it is not initialized yet.");
            return;
        }
        this.worker.postMessage(<SetKeysEvent>{
            operation: "setKeys",
            keys,
        });
    }

    createWorkerFromFunction(workerFunction: Function) {
        const blob = new Blob([`(${workerFunction.toString()})()`], {
            type: "application/javascript",
        });
        return new Worker(URL.createObjectURL(blob));
    }

    async createWorkerFromScript(scriptUrl: string) {
        const scriptContent = await fetch(scriptUrl).then((r) => r.text());
        const blob = new Blob([scriptContent], { type: "application/javascript" });
        const workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(workerUrl);

        return worker;
    }
}

// function workerScript() {
//     self.onmessage = WorkerSpec.onmessage;
// }

function workerScript() {
    return "";
}
