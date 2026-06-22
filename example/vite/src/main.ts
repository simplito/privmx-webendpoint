/**
 * PrivMX Web Endpoint demo - the realistic split:
 *
 *   1. The private key is generated HERE, in the browser, at runtime, and never
 *      leaves the device.
 *   2. Only the PUBLIC key is handed to the "backend" (`./server`), which holds
 *      the Bridge management API key and registers the user in the Context.
 *      WARNING: In this demo `./server` runs in the browser for simplicity - in a real
 *      app it is your server and `registerUser` would be an HTTP call.
 *   3. The browser then connects with its private key and exchanges an
 *      end-to-end encrypted Thread message.
 *
 * Assets load via the zero-config `/auto` entry (`setupAuto`) - no manual copy.
 */
import { Endpoint, setupAuto } from "@simplito/privmx-webendpoint";
import { registerUser } from "./server";

const logEl = document.getElementById("log") as HTMLPreElement;
const userIdEl = document.getElementById("userId") as HTMLInputElement;
const messageEl = document.getElementById("message") as HTMLInputElement;

function log(line: string): void {
    logEl.textContent += `\n${line}`;
}

const utf8 = {
    encode: (s: string) => new TextEncoder().encode(s),
    decode: (b: Uint8Array) => new TextDecoder().decode(b),
};

// Load the WASM core up front. Errors here usually mean the cross-origin
// isolation headers are missing (see vite.config.ts).
const ready = setupAuto()
    .then(() => log("WASM core initialised."))
    .catch((e) => log(`setup failed: ${e.message}`));

document.getElementById("run")!.addEventListener("click", async () => {
    await ready;
    const userId = userIdEl.value.trim();
    if (!userId) {
        log("Enter a user ID.");
        return;
    }

    try {
        // 1. Generate the key pair in the browser. The private key stays here.
        const crypto = await Endpoint.createCryptoApi();
        const privateKey = await crypto.generatePrivateKey();
        const publicKey = await crypto.derivePublicKey(privateKey);
        log(`\nGenerated key pair in-browser (public key ${publicKey.slice(0, 12)}…).`);

        // 2. Hand ONLY the public key to the backend, which registers it in the
        //    Context using the server-side Bridge API key. (Mimicked: in a real
        //    app this is `await fetch("/api/register-user", …)`.)
        const { bridgeUrl, solutionId, contextId } = await registerUser({ userId, pubKey: publicKey });
        log(`Backend registered "${userId}" in context ${contextId}.`);

        // 3. Connect with the private key (never sent anywhere) and run the demo.
        const connection = await Endpoint.connect(privateKey, solutionId, bridgeUrl);
        const me = { userId, pubKey: publicKey };

        const threadApi = await Endpoint.createThreadApi(connection);
        const threadId = await threadApi.createThread(
            contextId,
            [me], // users (read access)
            [me], // managers (manage access)
            utf8.encode(JSON.stringify({ tag: "vite-demo" })), // publicMeta - NOT encrypted
            utf8.encode(JSON.stringify({ title: "Vite demo thread" })), // privateMeta - encrypted
        );
        log(`Thread created: ${threadId}`);

        const text = messageEl.value || "Hello, E2EE world!";
        await threadApi.sendMessage(threadId, new Uint8Array(), new Uint8Array(), utf8.encode(text));
        log(`Message sent (encrypted client-side): "${text}"`);

        const page = await threadApi.listMessages(threadId, { skip: 0, limit: 10, sortOrder: "desc" });
        log(`Read back ${page.readItems.length} message(s):`);
        for (const msg of page.readItems) log(`    • ${utf8.decode(msg.data)}`);

        await connection.disconnect();
        log("Disconnected.");
    } catch (e) {
        log(`${(e as Error).message}`);
    }
});
