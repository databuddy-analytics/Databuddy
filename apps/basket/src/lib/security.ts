import crypto from "node:crypto";
import { cacheable } from "@databuddy/redis/cacheable";
import { redis } from "@databuddy/redis/redis";
import { captureError, record } from "@lib/tracing";
import { sanitizeString, VALIDATION_LIMITS } from "@utils/validation";
import { CryptoHasher } from "bun";
import { useLogger } from "evlog/elysia";

const EXIT_EVENT_TTL = 172_800;
const STANDARD_EVENT_TTL = 86_400;
const PENDING_DEDUP_TTL = 120;
const DEDUP_RETRY_DELAY_MS = 25;
export const DEDUP_RESERVATION_TIMEOUT_MS = 750;
const DEDUP_BYPASS_COOLDOWN_MS = 5000;
const PENDING_DEDUP_PREFIX = "pending:";
const DELIVERED_DEDUP_VALUE = "delivered";
const AMBIGUOUS_DEDUP_VALUE = "ambiguous";
const RELEASE_PENDING_DEDUP_RESERVATION = `if redis.call("GET", KEYS[1]) == ARGV[1] then
	return redis.call("DEL", KEYS[1])
end
return 0`;
const MARK_PENDING_DEDUP_RESERVATION_DELIVERED = `if redis.call("GET", KEYS[1]) == ARGV[1] then
	return redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
end
return 0`;
const MARK_PENDING_DEDUP_RESERVATION_AMBIGUOUS = `if redis.call("GET", KEYS[1]) == ARGV[1] then
	return redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
end
return 0`;

const RAW_VISITOR_ID_COUNTRIES = ["US"];
const COUNTRY_CODES: Record<string, string> = {
	USA: "US",
	"UNITED STATES": "US",
	"UNITED STATES OF AMERICA": "US",
};

let dedupBypassUntil = 0;
const timedOutReservationKeys = new Map<string, number>();
let timedOutReservationCleanup: ReturnType<typeof setTimeout> | undefined;

class DeduplicationDeadlineError extends Error {}

/** @internal */
export function resetDeduplicationCircuitForTesting(): void {
	dedupBypassUntil = 0;
	timedOutReservationKeys.clear();
	if (timedOutReservationCleanup) {
		clearTimeout(timedOutReservationCleanup);
		timedOutReservationCleanup = undefined;
	}
}

function scheduleTimedOutReservationCleanup(): void {
	if (timedOutReservationCleanup) {
		return;
	}
	const cleanup = () => {
		timedOutReservationCleanup = undefined;
		const now = Date.now();
		let nextExpiry = Number.POSITIVE_INFINITY;
		for (const [key, expiresAt] of timedOutReservationKeys) {
			if (expiresAt <= now) {
				timedOutReservationKeys.delete(key);
			} else {
				nextExpiry = Math.min(nextExpiry, expiresAt);
			}
		}
		if (Number.isFinite(nextExpiry)) {
			timedOutReservationCleanup = setTimeout(
				cleanup,
				Math.max(1, nextExpiry - now)
			);
			timedOutReservationCleanup.unref?.();
		}
	};
	timedOutReservationCleanup = setTimeout(cleanup, DEDUP_BYPASS_COOLDOWN_MS);
	timedOutReservationCleanup.unref?.();
}

function withDedupDeadline<T>(
	operation: Promise<T>,
	timeoutMs = DEDUP_RESERVATION_TIMEOUT_MS
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_resolve, reject) => {
		timeout = setTimeout(() => {
			reject(
				new DeduplicationDeadlineError(
					`Redis deduplication operation exceeded ${timeoutMs}ms`
				)
			);
		}, timeoutMs);
		timeout.unref?.();
	});
	return Promise.race([operation, deadline]).finally(() => {
		if (timeout) {
			clearTimeout(timeout);
		}
	});
}

function getCurrentDay(): number {
	const MS_PER_DAY = 24 * 60 * 60 * 1000;
	return Math.floor(Date.now() / MS_PER_DAY);
}

export const getDailySalt = cacheable(
	(): Promise<string> =>
		record("getDailySalt", async () => {
			const saltKey = `salt:${getCurrentDay()}`;
			try {
				const salt = await redis.get(saltKey);
				if (salt) {
					return salt;
				}

				const newSalt = crypto.randomBytes(32).toString("hex");
				const SALT_TTL = 60 * 60 * 24;
				redis.setex(saltKey, SALT_TTL, newSalt).catch((error) => {
					captureError(error, {
						message: "Failed to set daily salt in Redis",
					});
				});
				return newSalt;
			} catch (error) {
				captureError(error, {
					message: "Failed to get daily salt from Redis",
				});
				return crypto.randomBytes(32).toString("hex");
			}
		}),
	{
		expireInSec: 3600,
		prefix: "daily_salt",
		staleWhileRevalidate: true,
		staleTime: 300,
	}
);

export function saltAnonymousId(anonymousId: string, salt: string): string {
	try {
		const hasher = new CryptoHasher("sha256");
		hasher.update(anonymousId + salt);
		return hasher.digest("hex");
	} catch (error) {
		captureError(error, {
			message: "Failed to salt anonymous ID",
			anonymousId,
		});
		const fallbackHasher = new CryptoHasher("sha256");
		fallbackHasher.update(anonymousId);
		return fallbackHasher.digest("hex");
	}
}

export function shouldAnonymizeVisitorIds(
	anonymizeVisitorIds: unknown,
	visitorCountry?: unknown
): boolean {
	if (anonymizeVisitorIds === false) {
		return false;
	}

	if (anonymizeVisitorIds !== "auto") {
		return true;
	}

	const country =
		typeof visitorCountry === "string"
			? visitorCountry.trim().toUpperCase()
			: "";
	const code = country.length === 2 ? country : COUNTRY_CODES[country];
	return !RAW_VISITOR_ID_COUNTRIES.includes(code ?? "");
}

export function applyVisitorIdPrivacy(
	anonymousId: unknown,
	anonymizeVisitorIds: boolean,
	salt?: string
): string {
	const sanitized = sanitizeString(
		anonymousId,
		VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
	);
	if (!sanitized) {
		// Required ClickHouse String columns use "" for missing IDs; do not
		// hash an empty value into a fake day-stable visitor.
		return "";
	}

	if (!anonymizeVisitorIds) {
		return sanitized;
	}

	if (!salt) {
		throw new Error(
			"applyVisitorIdPrivacy requires a salt when anonymizeVisitorIds is true"
		);
	}

	return saltAnonymousId(sanitized, salt);
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface DuplicateReservation {
	readonly deliveredTtl?: number;
	readonly duplicate: boolean;
	readonly key?: string;
	/**
	 * Redis confirmed that this request did not acquire the reservation. The
	 * caller must retry instead of publishing alongside its current owner.
	 * Omitted when Redis is unavailable so ingestion remains fail-open.
	 */
	readonly retryable?: true;
	/**
	 * Present only when this request atomically acquired the pending key. It is
	 * required to release the key so an older failed request cannot erase a
	 * newer retry's reservation.
	 */
	readonly token?: string;
}

type DedupReservationState =
	| "acquired"
	| "ambiguous"
	| "delivered"
	| "pending"
	| "unreserved";

async function readDedupReservationState(
	key: string,
	token: string
): Promise<DedupReservationState> {
	const value = await redis.get(key);
	if (value === DELIVERED_DEDUP_VALUE) {
		return "delivered";
	}
	if (value === AMBIGUOUS_DEDUP_VALUE) {
		return "ambiguous";
	}
	if (value === token) {
		return "acquired";
	}
	return value === null || value === undefined ? "unreserved" : "pending";
}

async function setDedupKey(
	key: string,
	ttl: number,
	token: string
): Promise<DedupReservationState> {
	try {
		const result = await redis.set(key, token, "EX", ttl, "NX");
		return result === null ? readDedupReservationState(key, token) : "acquired";
	} catch (firstError) {
		await wait(DEDUP_RETRY_DELAY_MS);
		try {
			const retryResult = await redis.set(key, token, "EX", ttl, "NX");
			if (retryResult !== null) {
				return "acquired";
			}

			// The first SET may have succeeded even though the client saw an error.
			// Seeing our token again proves that this request owns the reservation.
			// Any other pending token is retryable: only a confirmed delivery may
			// suppress the event.
			return await readDedupReservationState(key, token);
		} catch {
			try {
				const state = await readDedupReservationState(key, token);
				// Both writes failed and Redis confirms there is no reservation.
				// Preserve fail-open ingestion instead of converting a write-only
				// Redis degradation into a service-wide 503.
				if (state === "unreserved") {
					throw firstError;
				}
				return state;
			} catch {
				throw firstError;
			}
		}
	}
}

export function reserveDuplicate(
	eventId: string,
	eventType: string,
	sourceEventId = eventId
): Promise<DuplicateReservation> {
	return record("reserveDuplicate", async () => {
		const key = `dedup:${eventType}:${eventId}`;
		const now = Date.now();
		const timedOutUntil = timedOutReservationKeys.get(key);
		if (timedOutUntil && now < timedOutUntil) {
			return { duplicate: false, retryable: true };
		}
		if (timedOutUntil) {
			timedOutReservationKeys.delete(key);
		}
		if (now < dedupBypassUntil) {
			return { duplicate: false };
		}

		const deliveredTtl = sourceEventId.startsWith("exit_")
			? EXIT_EVENT_TTL
			: STANDARD_EVENT_TTL;
		const token = `${PENDING_DEDUP_PREFIX}${crypto.randomUUID()}`;

		const reservationOperation = setDedupKey(key, PENDING_DEDUP_TTL, token);
		try {
			const result = await withDedupDeadline(reservationOperation);
			if (result === "delivered" || result === "ambiguous") {
				useLogger().set({
					dedup: {
						ambiguous: result === "ambiguous",
						duplicate: true,
						eventType,
					},
				});
				return { duplicate: true };
			}

			// This request did not acquire a pending key. Publishing without ownership
			// can duplicate a concurrent delivery or overwrite its confirmed state.
			if (result === "pending" || result === "unreserved") {
				return { duplicate: false, retryable: true };
			}

			return {
				duplicate: false,
				deliveredTtl,
				key,
				token,
			};
		} catch (error) {
			if (error instanceof DeduplicationDeadlineError) {
				// Redis commands cannot be cancelled. If SET NX succeeds after the
				// caller has failed open, conditionally remove only this attempt's
				// token so it cannot strand an ownerless 120-second reservation.
				reservationOperation
					.then(async (state) => {
						if (state !== "acquired") {
							return;
						}
						await withDedupDeadline(
							redis.eval(RELEASE_PENDING_DEDUP_RESERVATION, 1, key, token)
						);
					})
					.catch((cleanupError) => {
						captureError(cleanupError, {
							message: "Failed to clean up a late Redis dedup reservation",
						});
					});
			}
			dedupBypassUntil = Date.now() + DEDUP_BYPASS_COOLDOWN_MS;
			if (error instanceof DeduplicationDeadlineError) {
				timedOutReservationKeys.set(key, dedupBypassUntil);
				scheduleTimedOutReservationCleanup();
			}
			captureError(error, {
				message: "Failed to check duplicate event in Redis",
				eventId,
				eventType,
			});
			if (error instanceof DeduplicationDeadlineError) {
				// The SET outcome is unknown, so this particular payload must not be
				// published fail-open. Distinct events may use the short circuit-breaker
				// bypass while the late operation is reconciled above.
				return { duplicate: false, retryable: true };
			}
			return { duplicate: false };
		}
	});
}

/**
 * A Kafka timeout after send is an unknown outcome: the broker may have
 * committed the record even though Basket did not receive the acknowledgement.
 * Preserve that uncertainty per delivery key so a client retry cannot switch
 * the same payload to ClickHouse or create a new application-level Kafka send.
 */
export function markDuplicateReservationAmbiguous(
	reservation: DuplicateReservation
): Promise<void> {
	return record("markDuplicateReservationAmbiguous", async () => {
		if (!(reservation.deliveredTtl && reservation.key && reservation.token)) {
			return;
		}

		try {
			await withDedupDeadline(
				redis.eval(
					MARK_PENDING_DEDUP_RESERVATION_AMBIGUOUS,
					1,
					reservation.key,
					reservation.token,
					AMBIGUOUS_DEDUP_VALUE,
					reservation.deliveredTtl
				)
			);
		} catch (error) {
			captureError(error, {
				message: "Failed to preserve an ambiguous Kafka delivery reservation",
			});
		}
	});
}

/**
 * Only a confirmed Kafka or ClickHouse acknowledgement may turn a pending
 * retry guard into a duplicate suppression key. The promotion is conditional
 * on the owner's token so a stale request cannot overwrite a newer reservation.
 */
export function markDuplicateReservationDelivered(
	reservation: DuplicateReservation
): Promise<void> {
	return record("markDuplicateReservationDelivered", async () => {
		if (!(reservation.deliveredTtl && reservation.key && reservation.token)) {
			return;
		}

		try {
			await withDedupDeadline(
				redis.eval(
					MARK_PENDING_DEDUP_RESERVATION_DELIVERED,
					1,
					reservation.key,
					reservation.token,
					DELIVERED_DEDUP_VALUE,
					reservation.deliveredTtl
				)
			);
		} catch (error) {
			captureError(error, {
				message: "Failed to confirm duplicate reservation after delivery",
			});
		}
	});
}

export function releaseDuplicateReservation(
	reservation: DuplicateReservation
): Promise<void> {
	return record("releaseDuplicateReservation", async () => {
		if (!(reservation.key && reservation.token)) {
			return;
		}

		try {
			await withDedupDeadline(
				redis.eval(
					RELEASE_PENDING_DEDUP_RESERVATION,
					1,
					reservation.key,
					reservation.token
				)
			);
		} catch (error) {
			captureError(error, {
				message:
					"Failed to release duplicate reservation after delivery failure",
			});
		}
	});
}
