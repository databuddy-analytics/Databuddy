import { describe, expect, it } from "bun:test";
import {
	compare,
	decrypt,
	decryptBytes,
	encrypt,
	encryptBytes,
	generateKey,
} from "./index";

describe("encryption", () => {
	it("round trips strings", () => {
		const secret = generateKey();
		const ciphertext = encrypt("xoxb-secret", secret);

		expect(ciphertext).not.toContain("xoxb-secret");
		expect(decrypt(ciphertext, secret)).toBe("xoxb-secret");
	});

	it("round trips bytes", () => {
		const secret = generateKey();
		const value = new Uint8Array([1, 2, 3, 4]);

		const ciphertext = encryptBytes(value, secret);

		expect([...decryptBytes(ciphertext, secret)]).toEqual([...value]);
	});

	it("rejects the wrong secret", () => {
		const ciphertext = encrypt("secret", generateKey());

		expect(() => decrypt(ciphertext, generateKey())).toThrow();
	});

	it("compares values without leaking length through timingSafeEqual", () => {
		expect(compare("same", "same")).toBe(true);
		expect(compare("", "")).toBe(true);
		expect(compare("same", "different")).toBe(false);
		expect(compare("same", undefined)).toBe(false);
	});

	it("generates long url-safe keys", () => {
		const key = generateKey();

		expect(key.length).toBeGreaterThanOrEqual(80);
		expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(generateKey()).not.toBe(key);
	});
});
