export class Utils {
    public static getRandomString(size: number): string {
        const bytes = new Uint8Array(Math.ceil(size / 2));
        globalThis.crypto.getRandomValues(bytes);
        return Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")
            .slice(0, size);
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
