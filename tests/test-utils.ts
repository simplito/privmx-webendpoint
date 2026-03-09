import { Page } from "@playwright/test";
import { CliContext } from "./fixtures";
import { testData } from "./datasets/testData";

export async function setupTestUser(page: Page, cli: CliContext, contextIds: string[]) {
    const userKeys = await page.evaluate(async () => {
        const Endpoint = (window as any).Endpoint;
        await Endpoint.setup("../../assets");
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
    const users = await page.evaluate(async () => {
        const cryptoApi = await window.Endpoint.createCryptoApi();
        const users: { privKey: string; id: string; pubKey: string }[] = [];

        for (let i = 0; i < 3; ++i) {
            const privKey = await cryptoApi.generatePrivateKey();
            const pubKey = await cryptoApi.derivePublicKey(privKey);
            const id = `user-${i + 1}-${Date.now()}`;
            users.push({ privKey, id, pubKey });
        }
        return users;
    });

    for (const u of users) {
        await cli.call("context/addUserToContext", {
            contextId: testData.contextId,
            userId: u.id,
            userPubKey: u.pubKey,
        });
    }
    const usersObj: { [id: string]: any } = {};
    for (const [key, value] of users.entries()) {
        usersObj[`u${key + 1}`] = value;
    }
    return usersObj;
}
