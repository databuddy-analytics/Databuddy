import crypto, { createHash } from "node:crypto";
import { redis } from "@databuddy/redis";

/**
 * Get or generate a daily salt for anonymizing user IDs
 * The salt rotates daily to maintain privacy while allowing same-day tracking
 */
export async function getDailySalt(): Promise<string> {
	const saltKey = `salt:${Math.floor(Date.now() / (24 * 60 * 60 * 1000))}`;
	let salt = await redis.get(saltKey);
	if (!salt) {
		salt = crypto.randomBytes(32).toString("hex");
		await redis.setex(saltKey, 60 * 60 * 24, salt);
	}
	return salt;
}

/**
 * Salt and hash an anonymous ID for privacy
 */
export function saltAnonymousId(anonymousId: string, salt: string): string {
	return createHash("sha256")
		.update(anonymousId + salt)
		.digest("hex");
}

/**
 * Check if an event has already been processed (deduplication)
 * Returns true if duplicate, false if new
 */
export async function checkDuplicate(
	eventId: string,
	eventType: string
): Promise<boolean> {
	const key = `dedup:${eventType}:${eventId}`;
	if (await redis.exists(key)) {
		return true;
	}

	const ttl = eventId.startsWith("exit_") ? 172_800 : 86_400;
	await redis.setex(key, ttl, "1");
	return false;
}
