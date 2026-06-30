import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
	timingSafeEqual,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const DEFAULT_GENERATED_KEY_BYTES = 64;

export type SecretValue = string | Uint8Array;

export function encrypt(plaintext: string, secret: SecretValue): string {
	return encryptBytes(Buffer.from(plaintext, "utf8"), secret);
}

export function decrypt(payload: string, secret: SecretValue): string {
	return Buffer.from(decryptBytes(payload, secret)).toString("utf8");
}

export function encryptBytes(
	plaintext: Uint8Array,
	secret: SecretValue
): string {
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv(ALGORITHM, keyFromSecret(secret), iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	const tag = cipher.getAuthTag();

	return [VERSION, encode(iv), encode(tag), encode(ciphertext)].join(":");
}

export function decryptBytes(payload: string, secret: SecretValue): Uint8Array {
	const { ciphertext, iv, tag } = parsePayload(payload);
	const decipher = createDecipheriv(ALGORITHM, keyFromSecret(secret), iv);
	decipher.setAuthTag(tag);

	return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function compare(
	left: SecretValue | null | undefined,
	right: SecretValue | null | undefined
): boolean {
	if (left == null || right == null) {
		return false;
	}

	return timingSafeEqual(digest(left), digest(right));
}

export function generateKey(byteLength = DEFAULT_GENERATED_KEY_BYTES): string {
	if (
		!Number.isSafeInteger(byteLength) ||
		byteLength < KEY_BYTES ||
		byteLength > 1024
	) {
		throw new Error("Key length must be an integer between 32 and 1024 bytes");
	}

	return randomBytes(byteLength).toString("base64url");
}

function parsePayload(payload: string): {
	ciphertext: Buffer;
	iv: Buffer;
	tag: Buffer;
} {
	const [version, iv, tag, ciphertext] = payload.split(":");
	if (!(version === VERSION && iv && tag && ciphertext)) {
		throw new Error("Invalid encrypted payload");
	}

	const decoded = {
		ciphertext: decode(ciphertext),
		iv: decode(iv),
		tag: decode(tag),
	};

	if (decoded.iv.length !== IV_BYTES || decoded.tag.length !== TAG_BYTES) {
		throw new Error("Invalid encrypted payload");
	}

	return decoded;
}

function keyFromSecret(secret: SecretValue): Buffer {
	const bytes = toBuffer(secret);
	if (bytes.length === 0) {
		throw new Error("Encryption secret cannot be empty");
	}

	return createHash("sha256").update(bytes).digest().subarray(0, KEY_BYTES);
}

function digest(value: SecretValue): Buffer {
	return createHash("sha256").update(toBuffer(value)).digest();
}

function toBuffer(value: SecretValue): Buffer {
	return typeof value === "string"
		? Buffer.from(value, "utf8")
		: Buffer.from(value);
}

function encode(value: Uint8Array): string {
	return Buffer.from(value).toString("base64url");
}

function decode(value: string): Buffer {
	return Buffer.from(value, "base64url");
}
