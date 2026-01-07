import { Page } from "@playwright/test";
import { CliContext } from "./fixtures";
import { testData } from "./datasets/testData";

export async function setupTestUser(page: Page, cli: CliContext, contextIds: string[]) {
    const userKeys = await page.evaluate(async () => {
        const Endpoint = (window as any).Endpoint;
        await Endpoint.setup("../../dist/assets");
        const cryptoApi = await Endpoint.createCryptoApi();
        const privKey = await cryptoApi.generatePrivateKey();

        return {
            privKey: privKey,
            pubKey: await cryptoApi.derivePublicKey(privKey),
        };
    });

    const userId = `user-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    for (const contextId of contextIds) {
        if (!contextId) continue;

        try {
            await cli.call("context/addUserToContext", {
                contextId: contextId,
                userId: userId,
                userPubKey: userKeys.pubKey,
            });
        } catch (e) {
            console.warn(`Failed to add user to context ${contextId}:`, e);
        }
    }

    return { ...userKeys, userId };
}

export async function setupUsers(page: any, cli: CliContext) {
    const user2Keys = await page.evaluate(async () => {
        const cryptoApi = await window.Endpoint.createCryptoApi();
        const privKey = await cryptoApi.generatePrivateKey();
        return {
            privKey: privKey,
            pubKey: await cryptoApi.derivePublicKey(privKey),
        };
    });

    const user2Id = `user2-${Date.now()}`;

    await cli.call("context/addUserToContext", {
        contextId: testData.contextId,
        userId: user2Id,
        userPubKey: user2Keys.pubKey,
    });

    return {
        u1: { privKey: testData.userPrivKey, id: testData.userId, pubKey: testData.userPubKey },
        u2: { privKey: user2Keys.privKey, id: user2Id, pubKey: user2Keys.pubKey },
    };
}
