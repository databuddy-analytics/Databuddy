import crypto, {
	createCipheriv,
	createDecipheriv,
	randomBytes,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * Derives a key from the Better Auth secret using PBKDF2
 */
function deriveKey(secret: string, salt: Buffer): Buffer {
	return crypto.pbkdf2Sync(secret, salt, 100_000, 32, 'sha512');
}

/**
 * Encrypts a token using AES-256-GCM with the Better Auth secret
 */
export function encryptToken(token: string, secret: string): string {
	try {
		const salt = randomBytes(SALT_LENGTH);
		const iv = randomBytes(IV_LENGTH);
		const key = deriveKey(secret, salt);

		const cipher = createCipheriv(ALGORITHM, key, iv);

		let encrypted = cipher.update(token, 'utf8', 'hex');
		encrypted += cipher.final('hex');

		const tag = cipher.getAuthTag();

		// Combine salt + iv + tag + encrypted data
		const combined = Buffer.concat([
			salt,
			iv,
			tag,
			Buffer.from(encrypted, 'hex'),
		]);

		return combined.toString('base64');
	} catch (error) {
		console.error('Token encryption failed:', error);
		throw new Error('Failed to encrypt token');
	}
}

/**
 * Decrypts a token using AES-256-GCM with the Better Auth secret
 */
export function decryptToken(encryptedToken: string, secret: string): string {
	try {
		const combined = Buffer.from(encryptedToken, 'base64');

		// Extract components
		const salt = combined.subarray(0, SALT_LENGTH);
		const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
		const tag = combined.subarray(
			SALT_LENGTH + IV_LENGTH,
			SALT_LENGTH + IV_LENGTH + TAG_LENGTH
		);
		const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

		const key = deriveKey(secret, salt);

		const decipher = createDecipheriv(ALGORITHM, key, iv);
		decipher.setAuthTag(tag);

		let decrypted = decipher.update(encrypted, undefined, 'utf8');
		decrypted += decipher.final('utf8');

		return decrypted;
	} catch (error) {
		console.error('Token decryption failed:', error);
		throw new Error('Failed to decrypt token');
	}
}
