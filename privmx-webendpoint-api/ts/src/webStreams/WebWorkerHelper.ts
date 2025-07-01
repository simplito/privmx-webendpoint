import { EncKey } from "./WebRtcClientTypes";
import * as WorkerSpec from "./worker/worker";
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

export class WebWorker {
    worker: Worker | undefined;
    constructor(private encKey: EncKey) {
        // this.worker = new Worker(new URL("./worker/worker.ts", import.meta.url), {name: "worker"});
        this.worker = this.createWorkerFromFunction(workerScript);
        this.worker.onerror = e => console.error(e);

        this.worker.postMessage({
            operation: 'initialize',
            key: encKey.key, iv: encKey.iv
        });
    }
    getWorker() {
        return this.worker;
    }
    createWorkerFromFunction(workerFunction: Function) {
        const blob = new Blob([`(${workerFunction.toString()})()`], {
            type: 'application/javascript'
        });
        return new Worker(URL.createObjectURL(blob));
    }
}

function workerScript() {
    self.onmessage = WorkerSpec.onmessage;
}