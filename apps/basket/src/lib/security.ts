import crypto, { createHash } from "node:crypto";
import { cacheable, redis } from "@databuddy/redis";
import { captureError } from "./tracing";

const EXIT_EVENT_TTL = 172_800;
const STANDARD_EVENT_TTL = 86_400;

function getCurrentDay(): number {
	const MS_PER_DAY = 24 * 60 * 60 * 1000;
	return Math.floor(Date.now() / MS_PER_DAY);
}

export const getDailySalt = cacheable(
	async (): Promise<string> => {
		const saltKey = `salt:${getCurrentDay()}`;
		try {
			const salt = await redis.get(saltKey);
			if (salt) {
				return salt;
			}

			const newSalt = crypto.randomBytes(32).toString("hex");
			const SALT_TTL = 60 * 60 * 24;
			redis.setex(saltKey, SALT_TTL, newSalt).catch((error) => {
				captureError(error, { message: "Failed to set daily salt in Redis" });
			});
			return newSalt;
		} catch (error) {
			captureError(error, { message: "Failed to get daily salt from Redis" });
			return crypto.randomBytes(32).toString("hex");
		}
	},
	{
		expireInSec: 3600,
		prefix: "daily_salt",
		staleWhileRevalidate: true,
		staleTime: 300,
	}
);

export function saltAnonymousId(anonymousId: string, salt: string): string {
	try {
		return createHash("sha256")
			.update(anonymousId + salt)
			.digest("hex");
	} catch (error) {
		captureError(error, {
			message: "Failed to salt anonymous ID",
			anonymousId,
		});
		return createHash("sha256").update(anonymousId).digest("hex");
	}
}

export async function checkDuplicate(
	eventId: string,
	eventType: string
): Promise<boolean> {
	const key = `dedup:${eventType}:${eventId}`;
	const ttl = eventId.startsWith("exit_") ? EXIT_EVENT_TTL : STANDARD_EVENT_TTL;

	try {
		const result = await redis.set(key, "1", "EX", ttl, "NX");
		return result === null;
	} catch (error) {
		captureError(error, {
			message: "Failed to check duplicate event in Redis",
			eventId,
			eventType,
		});
		return false;
	}
}
