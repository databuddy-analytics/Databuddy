import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100_000;
const HASH_ALGORITHM = "sha512";

type EncryptedData = {
	iv: string;
	data: string;
	tag: string;
};

function getSalt(): string {
	const salt = process.env.BETTER_AUTH_SECRET;

	if (!salt) {
		throw new Error("BETTER_AUTH_SECRET environment variable is not set");
	}

	return salt;
}

function getEncryptionKey(): Buffer {
	const secret = process.env.OPR_API_KEY;

	if (!secret) {
		throw new Error("OPR_API_KEY environment variable is not set");
	}

	return crypto.pbkdf2Sync(
		secret,
		getSalt(),
		ITERATIONS,
		KEY_LENGTH,
		HASH_ALGORITHM
	);
}

function createCipher(key: Buffer, iv: Buffer) {
	return crypto.createCipheriv(ALGORITHM, key, iv);
}

function createDecipher(key: Buffer, iv: Buffer) {
	return crypto.createDecipheriv(ALGORITHM, key, iv);
}

function serializeEncryptedData(data: EncryptedData): string {
	return Buffer.from(JSON.stringify(data)).toString("base64");
}

function deserializeEncryptedData(encrypted: string): EncryptedData {
	try {
		const decoded = Buffer.from(encrypted, "base64").toString("utf8");
		const parsed = JSON.parse(decoded) as EncryptedData;

		const hasRequiredFields = parsed.iv && parsed.data && parsed.tag;
		if (!hasRequiredFields) {
			throw new Error("Invalid encrypted data structure");
		}

		return parsed;
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Failed to deserialize encrypted data: ${error.message}`);
		}
		throw new Error("Failed to deserialize encrypted data: Invalid format");
	}
}

export function encryptConnectionUrl(url: string): string {
	if (!url || url.trim().length === 0) {
		throw new Error("URL cannot be empty");
	}

	const key = getEncryptionKey();
	const iv = crypto.randomBytes(IV_LENGTH);
	const cipher = createCipher(key, iv);

	let encrypted = cipher.update(url, "utf8", "base64");
	encrypted += cipher.final("base64");

	const authTag = cipher.getAuthTag();

	const encryptedData: EncryptedData = {
		iv: iv.toString("base64"),
		data: encrypted,
		tag: authTag.toString("base64"),
	};

	return serializeEncryptedData(encryptedData);
}

export function decryptConnectionUrl(encryptedData: string): string {
	if (!encryptedData || encryptedData.trim().length === 0) {
		throw new Error("Encrypted data cannot be empty");
	}

	const key = getEncryptionKey();

	try {
		const data = deserializeEncryptedData(encryptedData);
		const iv = Buffer.from(data.iv, "base64");
		const authTag = Buffer.from(data.tag, "base64");

		const decipher = createDecipher(key, iv);
		decipher.setAuthTag(authTag);

		let decrypted = decipher.update(data.data, "base64", "utf8");
		decrypted += decipher.final("utf8");

		return decrypted;
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Failed to decrypt connection URL: ${error.message}`);
		}
		throw new Error("Failed to decrypt connection URL: Unknown error");
	}
}
