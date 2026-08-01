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
const DEDUP_FAILURE_COOLDOWN_MS = 5000;
const PENDING_DEDUP_PREFIX = "pending:";
const AMBIGUOUS_PENDING_PREFIX = "ambiguous-pending:";
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
const CLAIM_AMBIGUOUS_DEDUP_RESERVATION = `local value = redis.call("GET", KEYS[1])
if value == ARGV[1] or value == ARGV[2] then
	redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
	return 1
end
if value and string.sub(value, 1, string.len(ARGV[5])) == ARGV[5] then
	local claimed_at = tonumber(string.match(value, "^ambiguous%-pending:(%d+):"))
	if claimed_at and claimed_at <= tonumber(ARGV[4]) then
		redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
		return 1
	end
end
return 0`;
const RESERVE_DEDUP_BATCH = `local states = {}
for i, key in ipairs(KEYS) do
	local value = redis.call("GET", key)
	if value == ARGV[3] then
		states[i] = "delivered"
	elseif value == ARGV[2] or value == ARGV[4] then
		states[i] = "ambiguous-acquired"
	elseif value == ARGV[1] or not value then
		states[i] = "acquired"
	elseif string.sub(value, 1, string.len(ARGV[7])) == ARGV[7] then
		local claimed_at = tonumber(string.match(value, "^ambiguous%-pending:(%d+):"))
		if claimed_at and claimed_at <= tonumber(ARGV[6]) then
			states[i] = "ambiguous-acquired"
		else
			return { "retryable" }
		end
	else
		return { "retryable" }
	end
end
for i, key in ipairs(KEYS) do
	if states[i] == "acquired" then
		redis.call("SET", key, ARGV[1], "EX", ARGV[5])
	elseif states[i] == "ambiguous-acquired" then
		redis.call("SET", key, ARGV[2], "EX", ARGV[7 + i])
	end
end
return states`;
const RECONCILE_LATE_DEDUP_BATCH = `local reconciled = 0
for i, key in ipairs(KEYS) do
	local value = redis.call("GET", key)
	if value == ARGV[1] then
		reconciled = reconciled + redis.call("DEL", key)
	elseif value == ARGV[2] then
		redis.call("SET", key, ARGV[3], "EX", ARGV[3 + i])
		reconciled = reconciled + 1
	end
end
return reconciled`;

const RAW_VISITOR_ID_COUNTRIES = ["US"];
const COUNTRY_CODES: Record<string, string> = {
	USA: "US",
	"UNITED STATES": "US",
	"UNITED STATES OF AMERICA": "US",
};

let dedupUnavailableUntil = 0;

class DeduplicationDeadlineError extends Error {}

/** @internal */
export function resetDeduplicationCircuitForTesting(): void {
	dedupUnavailableUntil = 0;
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
	/** This retry owns a payload whose earlier Kafka acknowledgement was unknown. */
	readonly ambiguous?: true;
	readonly deliveredTtl?: number;
	readonly duplicate: boolean;
	readonly key?: string;
	/**
	 * Redis confirmed that this request did not acquire the reservation. The
	 * caller must retry instead of publishing alongside its current owner.
	 * Redis failures also return this state while the short circuit is open.
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
	| "ambiguous-acquired"
	| "delivered"
	| "pending"
	| "unreserved";

async function readDedupReservationState(
	key: string,
	token: string,
	ambiguousToken: string
): Promise<DedupReservationState> {
	const value = await redis.get(key);
	if (value === DELIVERED_DEDUP_VALUE) {
		return "delivered";
	}
	if (value === ambiguousToken) {
		return "ambiguous-acquired";
	}
	if (
		value === AMBIGUOUS_DEDUP_VALUE ||
		value?.startsWith(AMBIGUOUS_PENDING_PREFIX)
	) {
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
	token: string,
	ambiguousToken: string,
	deliveredTtl: number
): Promise<DedupReservationState> {
	const resolveExistingState = async (): Promise<DedupReservationState> => {
		const state = await readDedupReservationState(key, token, ambiguousToken);
		if (state !== "ambiguous") {
			return state;
		}
		const claimed = await redis.eval(
			CLAIM_AMBIGUOUS_DEDUP_RESERVATION,
			1,
			key,
			AMBIGUOUS_DEDUP_VALUE,
			ambiguousToken,
			deliveredTtl,
			Date.now() - PENDING_DEDUP_TTL * 1000,
			AMBIGUOUS_PENDING_PREFIX
		);
		if (claimed === 1) {
			return "ambiguous-acquired";
		}
		const current = await readDedupReservationState(key, token, ambiguousToken);
		return current === "ambiguous" ? "pending" : current;
	};

	try {
		const result = await redis.set(key, token, "EX", ttl, "NX");
		return result === null ? resolveExistingState() : "acquired";
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
			return await resolveExistingState();
		} catch {
			try {
				const state = await resolveExistingState();
				// A best-effort read can still prove an existing state after both write
				// replies fail. Otherwise propagate the unknown outcome so admission
				// pauses instead of publishing without ownership.
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
		if (now < dedupUnavailableUntil) {
			return { duplicate: false, retryable: true };
		}

		const deliveredTtl = sourceEventId.startsWith("exit_")
			? EXIT_EVENT_TTL
			: STANDARD_EVENT_TTL;
		const tokenId = crypto.randomUUID();
		const token = `${PENDING_DEDUP_PREFIX}${tokenId}`;
		const ambiguousToken = `${AMBIGUOUS_PENDING_PREFIX}${now}:${tokenId}`;

		const reservationOperation = setDedupKey(
			key,
			PENDING_DEDUP_TTL,
			token,
			ambiguousToken,
			deliveredTtl
		);
		try {
			const result = await withDedupDeadline(reservationOperation);
			if (result === "delivered") {
				useLogger().set({
					dedup: { duplicate: true, eventType },
				});
				return { duplicate: true };
			}

			// This request did not acquire a pending key. Publishing without ownership
			// can duplicate a concurrent delivery or overwrite its confirmed state.
			if (result === "pending" || result === "unreserved") {
				return { duplicate: false, retryable: true };
			}

			return {
				...(result === "ambiguous-acquired"
					? { ambiguous: true as const }
					: {}),
				duplicate: false,
				deliveredTtl,
				key,
				token: result === "ambiguous-acquired" ? ambiguousToken : token,
			};
		} catch (error) {
			if (error instanceof DeduplicationDeadlineError) {
				// Redis commands cannot be cancelled. If SET NX succeeds after the
				// caller returns retryable, conditionally reconcile only this attempt's
				// token so it cannot strand an ownerless 120-second reservation.
				reservationOperation
					.then(async (state) => {
						if (state === "ambiguous-acquired") {
							await withDedupDeadline(
								redis.eval(
									MARK_PENDING_DEDUP_RESERVATION_AMBIGUOUS,
									1,
									key,
									ambiguousToken,
									AMBIGUOUS_DEDUP_VALUE,
									deliveredTtl
								)
							);
						} else if (state === "acquired") {
							await withDedupDeadline(
								redis.eval(RELEASE_PENDING_DEDUP_RESERVATION, 1, key, token)
							);
						}
					})
					.catch((cleanupError) => {
						captureError(cleanupError, {
							message: "Failed to clean up a late Redis dedup reservation",
						});
					});
			}
			dedupUnavailableUntil = Date.now() + DEDUP_FAILURE_COOLDOWN_MS;
			captureError(error, {
				message: "Failed to check duplicate event in Redis",
				eventId,
				eventType,
			});
			// Redis writes have unknown outcomes on timeouts and connection resets.
			// Reject admission until the short circuit breaker elapses instead of
			// publishing without an owner and potentially changing delivery sinks.
			return { duplicate: false, retryable: true };
		}
	});
}

export interface DuplicateReservationInput {
	readonly eventId: string;
	readonly eventType: string;
	readonly sourceEventId?: string;
}

function deliveredTtlFor(sourceEventId: string): number {
	return sourceEventId.startsWith("exit_")
		? EXIT_EVENT_TTL
		: STANDARD_EVENT_TTL;
}

type BatchDedupReservationState =
	| "acquired"
	| "ambiguous-acquired"
	| "delivered"
	| "retryable";

function parseBatchReservationStates(
	value: unknown,
	expectedCount: number
): BatchDedupReservationState[] {
	if (!Array.isArray(value)) {
		throw new Error("Redis returned an invalid batch reservation result");
	}
	if (value.length === 1 && value[0] === "retryable") {
		return ["retryable"];
	}
	const validStates = new Set<BatchDedupReservationState>([
		"acquired",
		"ambiguous-acquired",
		"delivered",
	]);
	if (
		value.length !== expectedCount ||
		value.some((state) => !validStates.has(state))
	) {
		throw new Error("Redis returned an invalid batch reservation result");
	}
	return value as BatchDedupReservationState[];
}

/**
 * Atomically reserves a set of stable delivery IDs in one Redis round trip.
 * A pending owner blocks the whole attempt, while delivered items are skipped
 * and ambiguous items are claimed for a Kafka-only retry.
 */
export function reserveDuplicateBatch(
	inputs: DuplicateReservationInput[]
): Promise<DuplicateReservation[]> {
	return record("reserveDuplicateBatch", async () => {
		if (inputs.length === 0) {
			return [];
		}
		const keys = inputs.map(
			({ eventId, eventType }) => `dedup:${eventType}:${eventId}`
		);
		const now = Date.now();
		if (now < dedupUnavailableUntil) {
			return inputs.map(() => ({ duplicate: false, retryable: true }));
		}

		const deliveredTtls = inputs.map((input) =>
			deliveredTtlFor(input.sourceEventId ?? input.eventId)
		);
		const tokenId = crypto.randomUUID();
		const token = `${PENDING_DEDUP_PREFIX}${tokenId}`;
		const ambiguousToken = `${AMBIGUOUS_PENDING_PREFIX}${now}:${tokenId}`;
		const executeReservation = () =>
			redis
				.eval(
					RESERVE_DEDUP_BATCH,
					keys.length,
					...keys,
					token,
					ambiguousToken,
					DELIVERED_DEDUP_VALUE,
					AMBIGUOUS_DEDUP_VALUE,
					PENDING_DEDUP_TTL,
					now - PENDING_DEDUP_TTL * 1000,
					AMBIGUOUS_PENDING_PREFIX,
					...deliveredTtls
				)
				.then((value) => parseBatchReservationStates(value, inputs.length));
		const reservationOperation = (async () => {
			try {
				return await executeReservation();
			} catch (firstError) {
				await wait(DEDUP_RETRY_DELAY_MS);
				try {
					// Retrying with the same normal and ambiguous ownership tokens is
					// idempotent and recovers a reply lost after Redis executed EVAL.
					return await executeReservation();
				} catch {
					throw firstError;
				}
			}
		})();
		const reconcileOwnedReservations = () =>
			redis.eval(
				RECONCILE_LATE_DEDUP_BATCH,
				keys.length,
				...keys,
				token,
				ambiguousToken,
				AMBIGUOUS_DEDUP_VALUE,
				...deliveredTtls
			);

		try {
			const states = await withDedupDeadline(reservationOperation);
			if (states[0] === "retryable") {
				return inputs.map(() => ({ duplicate: false, retryable: true }));
			}
			return inputs.map((_input, index) => {
				const state = states[index];
				if (state === "delivered") {
					return { duplicate: true };
				}
				return {
					...(state === "ambiguous-acquired"
						? { ambiguous: true as const }
						: {}),
					deliveredTtl: deliveredTtls[index],
					duplicate: false,
					key: keys[index],
					token: state === "ambiguous-acquired" ? ambiguousToken : token,
				};
			});
		} catch (error) {
			if (error instanceof DeduplicationDeadlineError) {
				reservationOperation
					.then(() => withDedupDeadline(reconcileOwnedReservations()))
					.catch((cleanupError) => {
						captureError(cleanupError, {
							message: "Failed to clean up late Redis batch reservations",
						});
					});
			} else {
				// The EVAL reply can be lost after mutation. Best-effort reconciliation
				// releases fresh leases and restores Kafka ambiguity provenance.
				withDedupDeadline(reconcileOwnedReservations()).catch(
					(cleanupError) => {
						captureError(cleanupError, {
							message: "Failed to reconcile uncertain Redis batch reservations",
						});
					}
				);
			}
			dedupUnavailableUntil = Date.now() + DEDUP_FAILURE_COOLDOWN_MS;
			captureError(error, {
				message: "Failed to reserve analytics batch in Redis",
				eventCount: inputs.length,
			});
			return inputs.map(() => ({
				duplicate: false,
				retryable: true as const,
			}));
		}
	});
}

/**
 * A Kafka timeout after send is an unknown outcome: the broker may have
 * committed the record even though Basket did not receive the acknowledgement.
 * Preserve that uncertainty per delivery key so a client retry cannot switch
 * the same payload to ClickHouse. The retry remains Kafka-only and reuses its
 * stable delivery identity for downstream idempotency.
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
