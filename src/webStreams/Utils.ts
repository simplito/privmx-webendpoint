import { CryptoFacade } from "../crypto/CryptoFacade";
import { Buffer } from "buffer";

export class Utils {
    public static getRandomString(size: number): string {
        const bytes = crypto.getRandomValues(new Uint8Array(size));
        return Array.from(bytes)
            .map((b) => (b & 0xf).toString(16))
            .join("");
    }

    static genIvAsBuffer() {
        return crypto.getRandomValues(new Uint8Array(12));
    }

    static numAsOneByteUint(num: number) {
        if (num > 255) {
            throw new Error("Out of bounds value");
        }
        const arr = new Uint8Array(1);
        arr[0] = num;
        return arr;
    }
}
