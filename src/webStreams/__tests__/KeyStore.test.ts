import { setGlobalEmCrypto } from "../../crypto/index.js";
import { Key } from "../../Types.js";
import { KeyStore } from "../KeyStore.js";

beforeAll(() => {
    setGlobalEmCrypto();
});

function key(keyId: string, byte: number, type: number): Key {
    return { keyId, key: new Uint8Array(32).fill(byte), type };
}

describe("KeyStore", () => {
    it("registers a key and resolves it by id and epoch", async () => {
        const ks = new KeyStore();
        await ks.setKeys([key("k1", 0x01, 0)]);

        expect(ks.hasKey("k1")).toBe(true);
        expect(ks.getEncryptionExternalKeyId()).toBe("k1");

        // The active encryption key is among the candidates for its own epoch.
        const epoch = ks.getEncryptionEpoch();
        expect(ks.resolveInternalKeyIdsByEpoch(epoch)).toContain(ks.getEncryptionKeyId());
    });

    it("rotation retains a still-present key and drops removed ones", async () => {
        const ks = new KeyStore();
        await ks.setKeys([key("k1", 0x01, 0)]);

        // Rotate: k1 kept (now remote), k2 becomes the encryption key.
        await ks.setKeys([key("k1", 0x01, 1), key("k2", 0x02, 0)]);
        expect(ks.hasKey("k1")).toBe(true);
        expect(ks.hasKey("k2")).toBe(true);
        expect(ks.getEncryptionExternalKeyId()).toBe("k2");
        expect(() => ks.resolveKeyId("k1")).not.toThrow();

        // Rotate again to a disjoint set: k1/k2 gone, k3 active.
        await ks.setKeys([key("k3", 0x03, 0)]);
        expect(ks.hasKey("k1")).toBe(false);
        expect(ks.hasKey("k2")).toBe(false);
        expect(ks.hasKey("k3")).toBe(true);
        expect(ks.getEncryptionExternalKeyId()).toBe("k3");
    });

    describe("atomic rekey (#5)", () => {
        it("rejects an invalid batch without disturbing the live key set", async () => {
            const ks = new KeyStore();
            await ks.setKeys([key("good", 0x01, 0)]);

            const internalBefore = ks.getEncryptionKeyId();
            const epochBefore = ks.getEncryptionEpoch();

            // Batch contains a key with the wrong length -> the whole call rejects.
            await expect(
                ks.setKeys([
                    key("new", 0x02, 0),
                    { keyId: "bad", key: new Uint8Array(16), type: 1 },
                ]),
            ).rejects.toThrow(/Invalid key length/);

            // The previous key set is completely intact - no window, no partial state.
            expect(ks.hasKey("good")).toBe(true);
            expect(ks.hasKey("new")).toBe(false);
            expect(ks.hasKey("bad")).toBe(false);
            expect(ks.getEncryptionKeyId()).toBe(internalBefore);
            expect(ks.getEncryptionEpoch()).toBe(epochBefore);
            expect(ks.getEncryptionExternalKeyId()).toBe("good");
        });
    });

    it("throws for accessors when no encryption key is set", async () => {
        const ks = new KeyStore();
        await ks.setKeys([key("only-remote", 0x01, 1)]); // no type-0 key
        expect(() => ks.getEncryptionKeyId()).toThrow(/No encryption key/);
        expect(() => ks.getEncryptionEpoch()).toThrow(/No encryption key/);
        expect(() => ks.getEncryptionExternalKeyId()).toThrow(/No encryption key/);
        // ...but the remote key is still resolvable for decryption.
        expect(ks.hasKey("only-remote")).toBe(true);
    });
});
