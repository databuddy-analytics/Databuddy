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

	it("round trips multibyte text", () => {
		const secret = generateKey();

		expect(decrypt(encrypt("héllo wörld 🚀", secret), secret)).toBe(
			"héllo wörld 🚀"
		);
	});

	it("rejects the wrong secret", () => {
		const ciphertext = encrypt("secret", generateKey());

		expect(() => decrypt(ciphertext, generateKey())).toThrow();
	});

	it("rejects tampered ciphertext", () => {
		const secret = generateKey();
		const [version, iv, tag, ciphertext] = encrypt("payload", secret).split(":");
		const flipped =
			ciphertext[0] === "A" ? `B${ciphertext.slice(1)}` : `A${ciphertext.slice(1)}`;

		expect(() =>
			decrypt([version, iv, tag, flipped].join(":"), secret)
		).toThrow();
	});

	it("rejects a tampered auth tag", () => {
		const secret = generateKey();
		const [version, iv, tag, ciphertext] = encrypt("payload", secret).split(":");
		const flippedTag = tag[0] === "A" ? `B${tag.slice(1)}` : `A${tag.slice(1)}`;

		expect(() =>
			decrypt([version, iv, flippedTag, ciphertext].join(":"), secret)
		).toThrow();
	});

	it.each([
		["not enough segments", "v1:onlyiv"],
		["unknown version", "v2:aaaaaaaaaaaaaaaa:bbbbbbbbbbbbbbbbbbbbbb:cccc"],
		["empty segment", "v1::bbbbbbbbbbbbbbbbbbbbbb:cccc"],
		["wrong iv length", "v1:c2hvcnQ:AAAAAAAAAAAAAAAAAAAAAA:cccc"],
		["plain garbage", "definitely-not-encrypted"],
	])("rejects a malformed payload (%s)", (_label, payload) => {
		expect(() => decrypt(payload, generateKey())).toThrow(
			"Invalid encrypted payload"
		);
	});

	it("produces distinct ciphertexts for the same plaintext (random IV)", () => {
		const secret = generateKey();

		expect(encrypt("same", secret)).not.toBe(encrypt("same", secret));
	});

	it("rejects an empty secret", () => {
		expect(() => encrypt("value", "")).toThrow(
			"Encryption secret cannot be empty"
		);
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

	it.each([[31], [1025], [64.5], [Number.NaN]])(
		"rejects key length %p outside 32-1024 whole bytes",
		(byteLength) => {
			expect(() => generateKey(byteLength)).toThrow(
				"Key length must be an integer between 32 and 1024 bytes"
			);
		}
	);
});
