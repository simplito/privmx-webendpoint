// const Buffer = require('buffer/').Buffer;


export class Utils {
    public static generateNumericId(): number {
        return Math.round(Math.random() * 1000000000000000);
    }

    public static getRandomString(size: number): string {
        return [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    }

    static async encryptSymmetric(plaintext: Uint8Array | string, key: string, iv: string) : Promise<{ciphertext: Buffer, iv: string}> {
        // encode the text you want to encrypt
        let encodedPlaintext: Uint8Array;
        if (typeof plaintext === "string") {
            encodedPlaintext = new TextEncoder().encode(plaintext);
        } else {
            encodedPlaintext = plaintext;
        }
      
        // prepare the secret key for encryption
        const secretKey = await crypto.subtle.importKey('raw', Buffer.from(key, 'base64'), {
            name: 'AES-GCM',
            length: 256
        }, true, ['encrypt', 'decrypt']);
        // encrypt the text with the secret key
        const ciphertext = await crypto.subtle.encrypt({
            name: 'AES-GCM',
            iv: Buffer.from(iv, "base64"),
        }, secretKey, encodedPlaintext);
        
        // return the encrypted text "ciphertext" and the IV
        // encoded in base64
        return ({
            ciphertext: Buffer.from(ciphertext),
            iv: iv
        });
    }

    static async decryptSymmetric(ciphertext: string, iv: string, key: string) {
        // prepare the secret key
        const secretKey = await crypto.subtle.importKey(
            'raw',
            Buffer.from(key, 'base64'), 
            {
            name: 'AES-GCM',
            length: 256
        }, true, ['encrypt', 'decrypt']);
        // decrypt the encrypted text "ciphertext" with the secret key and IV
        const cleartext = await crypto.subtle.decrypt({
            name: 'AES-GCM',
            iv: Buffer.from(iv, 'base64'),
        }, secretKey, Buffer.from(ciphertext, 'base64'));
        // decode the text and return it
        return new TextDecoder().decode(cleartext);
    }

    static genKey(): string {
        return Buffer.from(
            crypto.getRandomValues(new Uint8Array(32))
          ).toString('base64');
    }

    static genIv(): string {
        return Buffer.from(
            crypto.getRandomValues(new Uint8Array(12))
          ).toString('base64');
    }

    static base64abc = [
        "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
        "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
        "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
        "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
        "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "/"
    ];
    
    static base64codes = [
        255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
        255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
        255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 62, 255, 255, 255, 63,
        52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 255, 255, 255, 0, 255, 255,
        255, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
        15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 255, 255, 255, 255, 255,
        255, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
        41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51
    ];

    static bytesToBase64(bytes: Uint8Array) {
        let result = '', i, l = bytes.length;
        for (i = 2; i < l; i += 3) {
            result += Utils.base64abc[bytes[i - 2] >> 2];
            result += Utils.base64abc[((bytes[i - 2] & 0x03) << 4) | (bytes[i - 1] >> 4)];
            result += Utils.base64abc[((bytes[i - 1] & 0x0F) << 2) | (bytes[i] >> 6)];
            result += Utils.base64abc[bytes[i] & 0x3F];
        }
        if (i === l + 1) { // 1 octet yet to write
            result += Utils.base64abc[bytes[i - 2] >> 2];
            result += Utils.base64abc[(bytes[i - 2] & 0x03) << 4];
            result += "==";
        }
        if (i === l) { // 2 octets yet to write
            result += Utils.base64abc[bytes[i - 2] >> 2];
            result += Utils.base64abc[((bytes[i - 2] & 0x03) << 4) | (bytes[i - 1] >> 4)];
            result += Utils.base64abc[(bytes[i - 1] & 0x0F) << 2];
            result += "=";
        }
        return result;
    }

    static isBitOn(byte: number, index: number) {
        return Boolean(byte & (1 << index));
    }

    static getBits(data: Uint8Array, bitOffset: number, numBits: number) {
        const numBits2 = Math.pow(2,numBits) - 1; //this will only work up to 32 bits, of course
        const bytePos = bitOffset/8;
        const bits = bitOffset %= 8;
        return (data[bytePos] >> bits) & numBits2;
    }


    static numToUint8Array(num: number) {
        let arr = new Uint8Array(8);
      
        for (let i = 0; i < 8; i++) {
          arr[i] = num % 256;
          num = Math.floor(num / 256);
        }
      
        return arr;
      }
      
      
      static uint8ArrayToNum(arr: Uint8Array) {
        let num = 0;
      
        for (let i = 7; i >= 0; i--) {
          num = num * 256 + arr[i];
        }
      
        return num;
      }

}

