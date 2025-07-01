// import { EncKey } from "./WebRtcClientTypes";

// export class WebWorker {
//     worker: Worker | undefined;
//     constructor(private encKey: EncKey) {
//       // this.worker = new Worker(new URL("./worker/worker.ts", import.meta.url), {name: "worker"});
//       this.worker = new Worker(new URL("worker.js", import.meta.url), {name: "worker"});
//       this.worker.onerror = e => console.error(e);

//       this.worker.postMessage({
//           operation: 'initialize',
//           key: encKey.key, iv: encKey.iv
//       });
//     }
//     getWorker() {
//       return this.worker;
//     }
// }