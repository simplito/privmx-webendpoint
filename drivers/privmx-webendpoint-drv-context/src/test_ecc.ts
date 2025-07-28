import { EmCrypto } from "./crypto/EmCrypto";

export class TesterEcc {
    async run() {
        const ourCrypto = new EmCrypto();
        const pair = await ourCrypto.methodCaller("ecc_genPair", {});
        const data = new Uint8Array(1024).fill(0);

        const privKey = new Uint8Array(pair.privateKey);
        const pubKey = new Uint8Array(pair.publicKey);

        console.log({pair});
        const signature = new Uint8Array(await ourCrypto.methodCaller("ecc_sign", {privateKey: privKey, data: data}));
        
        console.log({signature});


        // test
        const times = 1000;
        let total = 0;
        let start0 = Date.now();
        for (let i = 0; i < times; i++) {
            const startTime = Date.now();
            const verifyResult = await ourCrypto.methodCaller("ecc_verify", {
                publicKey: pubKey,
                data: data,
                signature: signature
            });
            // const signature = new Uint8Array(await ourCrypto.methodCaller("ecc_sign", {privateKey: privKey, data: data}));

            const elapsed = Date.now() - startTime;
            // console.log(`Elapsed (${i}): ${elapsed}`);
            total += elapsed;
        }
        let total0 = Date.now() - start0;
        console.log(`Elapsed (total): ${total} / avg: ${total / times}`);
        console.log(`Elapsed (total0): ${total0}`);


    }
}
new TesterEcc().run();