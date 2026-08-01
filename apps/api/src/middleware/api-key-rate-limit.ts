import {
	type ApiKeyRow,
	extractSecret,
	isApiKeyPresent,
	keys,
	resolveApiKey,
} from "@databuddy/api-keys/resolve";
import {
	getRateLimitHeaders,
	ratelimit,
	type RateLimitResult,
} from "@databuddy/redis/rate-limit";
import { mergeWideEvent } from "@databuddy/ai/lib/tracing";
import { createError } from "evlog";
import { handleAppError } from "@/http/errors";

const API_KEY_RATE_LIMIT_PREFIX = "api-key";
const API_KEY_IN_FLIGHT_RETRY_AFTER_SECONDS = 1;

export const API_KEY_IN_FLIGHT_LIMIT = 20;

/**
 * Admission does not currently have plan data. Enabled keys therefore use the
 * Free-plan ceiling unless they persist an explicit override; paid keys that
 * need the documented 1,200 req/min ceiling must set that override until
 * plan-aware resolution is available here.
 */
export const DEFAULT_API_KEY_RATE_LIMIT = {
	limit: 300,
	windowSeconds: 60,
} as const;

export type ApiKeyAdmissionOutcome =
	| "in_flight_rejected"
	| "redis_fail_open"
	| "rolling_quota_rejected";

export interface ApiKeyAdmissionDependencies {
	consume: (
		identifier: string,
		limit: number,
		windowSeconds: number
	) => Promise<RateLimitResult>;
	inFlightGate: ApiKeyInFlightGate;
	recordAdmissionOutcome: (outcome: ApiKeyAdmissionOutcome) => void;
	resolveApiKey: (headers: Headers) => Promise<ApiKeyRow | null>;
}

export class ApiKeyInFlightGate {
	readonly limit: number;
	readonly #counts = new Map<string, number>();
	readonly #leases = new WeakMap<Request, string>();

	constructor(limit = API_KEY_IN_FLIGHT_LIMIT) {
		if (!Number.isSafeInteger(limit) || limit <= 0) {
			throw new RangeError(
				"API key in-flight limit must be a positive integer"
			);
		}
		this.limit = limit;
	}

	tryAcquire(request: Request, keyFingerprint: string): boolean {
		if (this.#leases.has(request)) {
			return true;
		}

		const current = this.#counts.get(keyFingerprint) ?? 0;
		if (current >= this.limit) {
			return false;
		}

		this.#counts.set(keyFingerprint, current + 1);
		this.#leases.set(request, keyFingerprint);
		return true;
	}

	release(request: Request): void {
		const keyFingerprint = this.#leases.get(request);
		if (!keyFingerprint) {
			return;
		}
		this.#leases.delete(request);

		const current = this.#counts.get(keyFingerprint) ?? 0;
		if (current <= 1) {
			this.#counts.delete(keyFingerprint);
			return;
		}
		this.#counts.set(keyFingerprint, current - 1);
	}
}

const defaultInFlightGate = new ApiKeyInFlightGate();

const defaultDependencies: ApiKeyAdmissionDependencies = {
	consume: ratelimit,
	inFlightGate: defaultInFlightGate,
	recordAdmissionOutcome,
	resolveApiKey: async (headers) => {
		if (!isApiKeyPresent(headers)) {
			return null;
		}
		return (await resolveApiKey(headers)).key;
	},
};

export function releaseApiKeyInFlight(
	request: Request,
	gate: ApiKeyInFlightGate = defaultInFlightGate
): void {
	gate.release(request);
}

export interface EnforceApiKeyRateLimitOptions {
	/** undefined means auth was not pre-resolved; null means it resolved without a key. */
	apiKey?: ApiKeyRow | null;
	dependencies?: ApiKeyAdmissionDependencies;
}

interface ApiKeyRateLimitConfig {
	limit: number;
	windowSeconds: number;
}

export function getApiKeyRateLimitConfig(
	apiKey: ApiKeyRow | null
): ApiKeyRateLimitConfig | null {
	if (!apiKey?.rateLimitEnabled) {
		return null;
	}

	const limit = positiveIntegerOrDefault(
		apiKey.rateLimitMax,
		DEFAULT_API_KEY_RATE_LIMIT.limit
	);
	const windowSeconds = positiveIntegerOrDefault(
		apiKey.rateLimitTimeWindow,
		DEFAULT_API_KEY_RATE_LIMIT.windowSeconds
	);

	return { limit, windowSeconds };
}

function positiveIntegerOrDefault(
	value: number | null,
	fallback: number
): number {
	return value !== null && Number.isSafeInteger(value) && value > 0
		? value
		: fallback;
}

/**
 * Acquire a per-process lease before API-key cache or database auth resolution.
 * The gate retains only keypal's one-way key hash, never the presented secret.
 */
export function enforceApiKeyInFlightLimit(
	request: Request,
	setHeader: (name: string, value: string) => void,
	dependencies: ApiKeyAdmissionDependencies = defaultDependencies
): Response | undefined {
	if (request.method === "OPTIONS" || request.method === "HEAD") {
		return;
	}

	const secret = extractSecret(request.headers);
	if (!secret) {
		return;
	}
	const fingerprint = keys.hashKey(secret);
	if (dependencies.inFlightGate.tryAcquire(request, fingerprint)) {
		return;
	}
	dependencies.recordAdmissionOutcome("in_flight_rejected");

	return createRateLimitRejection(
		request,
		setHeader,
		{
			limit: dependencies.inFlightGate.limit,
			remaining: 0,
			reset: Date.now() + API_KEY_IN_FLIGHT_RETRY_AFTER_SECONDS * 1000,
			success: false,
		},
		"Too many concurrent API key requests"
	);
}

/**
 * Enforce an API key's configured distributed rolling-window limit after auth
 * resolution. rateLimitEnabled controls only this quota; every presented key
 * has already passed through the local in-flight gate above.
 */
export async function enforceApiKeyRateLimit(
	request: Request,
	setHeader: (name: string, value: string) => void,
	options: EnforceApiKeyRateLimitOptions = {}
): Promise<Response | undefined> {
	if (request.method === "OPTIONS" || request.method === "HEAD") {
		return;
	}

	const dependencies = options.dependencies ?? defaultDependencies;
	const apiKey =
		options.apiKey === undefined
			? await dependencies.resolveApiKey(request.headers)
			: options.apiKey;
	if (!apiKey) {
		return;
	}
	const config = getApiKeyRateLimitConfig(apiKey);
	if (!config) {
		return;
	}

	const result = await dependencies.consume(
		`${API_KEY_RATE_LIMIT_PREFIX}:${apiKey.id}`,
		config.limit,
		config.windowSeconds
	);
	if (result.degraded) {
		dependencies.recordAdmissionOutcome("redis_fail_open");
	}
	if (result.success) {
		setRateLimitHeaders(result, setHeader);
		return;
	}
	dependencies.recordAdmissionOutcome("rolling_quota_rejected");
	return createRateLimitRejection(
		request,
		setHeader,
		result,
		"API key rate limit exceeded"
	);
}

function recordAdmissionOutcome(outcome: ApiKeyAdmissionOutcome): void {
	const fields: Record<string, boolean | string> = {
		api_key_admission_outcome: outcome,
	};
	if (outcome === "in_flight_rejected") {
		fields.api_key_in_flight_rejected = true;
	} else if (outcome === "rolling_quota_rejected") {
		fields.api_key_rolling_quota_rejected = true;
	} else {
		fields.api_key_rate_limit_degraded = true;
	}
	mergeWideEvent(fields);
}

function createRateLimitRejection(
	request: Request,
	setHeader: (name: string, value: string) => void,
	result: RateLimitResult,
	message: string
): Response {
	const headers = setRateLimitHeaders(result, setHeader);
	const response = handleAppError({
		error: createError({
			code: "RATE_LIMITED",
			message,
			status: 429,
		}),
		request,
	});
	for (const [name, value] of Object.entries(headers)) {
		response.headers.set(name, value);
	}
	return response;
}

function setRateLimitHeaders(
	result: RateLimitResult,
	setHeader: (name: string, value: string) => void
): Record<string, string> {
	const headers = getRateLimitHeaders(result);
	for (const [name, value] of Object.entries(headers)) {
		setHeader(name, value);
	}
	return headers;
}
