import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
	const secret = process.env.OPR_API_KEY;

	if (!secret) {
		throw new Error("OPR_API_KEY environment variable is not set");
	}

	return crypto.pbkdf2Sync(
		secret,
		"databuddy-db-connections",
		100_000,
		32,
		"sha512"
	);
}

export function encryptConnectionUrl(url: string): string {
	const key = getEncryptionKey();
	const iv = crypto.randomBytes(16);

	const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

	let encrypted = cipher.update(url, "utf8", "base64");
	encrypted += cipher.final("base64");

	const authTag = cipher.getAuthTag();

	const combined = {
		iv: iv.toString("base64"),
		data: encrypted,
		tag: authTag.toString("base64"),
	};

	return Buffer.from(JSON.stringify(combined)).toString("base64");
}

export function decryptConnectionUrl(encryptedData: string): string {
	const key = getEncryptionKey();

	try {
		const combined = JSON.parse(
			Buffer.from(encryptedData, "base64").toString("utf8")
		);

		const iv = Buffer.from(combined.iv, "base64");
		const authTag = Buffer.from(combined.tag, "base64");

		const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
		decipher.setAuthTag(authTag);

		let decrypted = decipher.update(combined.data, "base64", "utf8");
		decrypted += decipher.final("utf8");

		return decrypted;
	} catch {
		throw new Error("Failed to decrypt connection URL");
	}
}
