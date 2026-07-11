import type {
	FlagResult,
	FlagsConfig,
	FlagsRequestFailure,
	UserContext,
} from "./types";

const CACHE_CONTEXT_SEPARATOR = "::databuddy-context::";

export const DEFAULT_RESULT: FlagResult = {
	enabled: false,
	value: false,
	payload: null,
	reason: "DEFAULT",
};

export function getCacheContext(
	user?: UserContext,
	environment?: string
): string {
	const params = new URLSearchParams();

	if (user?.userId) {
		params.set("userId", user.userId);
	}
	if (user?.email) {
		params.set("email", user.email);
	}
	if (user?.organizationId) {
		params.set("organizationId", user.organizationId);
	}
	if (user?.teamId) {
		params.set("teamId", user.teamId);
	}
	if (user?.properties) {
		params.set("properties", JSON.stringify(user.properties));
	}
	if (environment) {
		params.set("environment", environment);
	}

	return params.toString();
}

export function getCacheKey(
	key: string,
	user?: UserContext,
	environment?: string
): string {
	const context = getCacheContext(user, environment);
	if (!context) {
		return key;
	}
	return `${key}${CACHE_CONTEXT_SEPARATOR}${context}`;
}

export function getFlagKey(cacheKey: string): string {
	const index = cacheKey.indexOf(CACHE_CONTEXT_SEPARATOR);
	return index === -1 ? cacheKey : cacheKey.slice(0, index);
}

export function cacheKeyBelongsToContext(
	cacheKey: string,
	user?: UserContext,
	environment?: string
): boolean {
	const context = getCacheContext(user, environment);
	if (!context) {
		return !cacheKey.includes(CACHE_CONTEXT_SEPARATOR);
	}
	return cacheKey.endsWith(`${CACHE_CONTEXT_SEPARATOR}${context}`);
}

export function buildQueryParams(config: FlagsConfig): URLSearchParams {
	const params = new URLSearchParams();
	params.set("clientId", config.clientId);
	if (config.environment) {
		params.set("environment", config.environment);
	}

	return params;
}

export interface FlagEvaluationRequest {
	clientId: string;
	email?: string;
	environment?: string;
	organizationId?: string;
	properties?: Record<string, unknown>;
	teamId?: string;
	userId?: string;
}

export function buildEvaluationRequest(
	config: FlagsConfig,
	user?: UserContext
): FlagEvaluationRequest {
	const context = user ?? config.user;
	return {
		clientId: config.clientId,
		...(context?.userId ? { userId: context.userId } : {}),
		...(context?.email ? { email: context.email } : {}),
		...(context?.organizationId
			? { organizationId: context.organizationId }
			: {}),
		...(context?.teamId ? { teamId: context.teamId } : {}),
		...(context?.properties ? { properties: context.properties } : {}),
		...(config.environment ? { environment: config.environment } : {}),
	};
}

export class FlagsRequestError extends Error {
	readonly code: FlagsRequestFailure["code"];
	readonly requestId?: string;
	readonly retryable: boolean;
	readonly status: number | null;

	constructor(failure: FlagsRequestFailure) {
		super(failure.message);
		this.name = "FlagsRequestError";
		this.code = failure.code;
		this.status = failure.status;
		this.retryable = failure.retryable;
		this.requestId = failure.requestId;
	}

	toFailure(): FlagsRequestFailure {
		return {
			code: this.code,
			message: this.message,
			status: this.status,
			retryable: this.retryable,
			...(this.requestId ? { requestId: this.requestId } : {}),
		};
	}
}

function isRetryableStatus(status: number): boolean {
	return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function readFlagsResponse(
	response: Response
): Promise<Record<string, FlagResult>> {
	const text = await response.text();
	let data: unknown = null;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		data = text;
	}

	if (!response.ok) {
		const record =
			data && typeof data === "object"
				? (data as Record<string, unknown>)
				: null;
		const message = record?.error ?? record?.message;
		throw new FlagsRequestError({
			code: "HTTP_ERROR",
			message:
				typeof message === "string" && message.trim()
					? message
					: `Flag evaluation failed with HTTP ${response.status}`,
			status: response.status,
			retryable: isRetryableStatus(response.status),
			requestId:
				response.headers.get("x-request-id") ??
				(typeof record?.requestId === "string" ? record.requestId : undefined),
		});
	}

	if (!(data && typeof data === "object" && "flags" in data)) {
		throw new FlagsRequestError({
			code: "INVALID_RESPONSE",
			message: "Flag evaluation returned an invalid response",
			status: response.status,
			retryable: false,
		});
	}

	const flags = (data as { flags?: unknown }).flags;
	if (!(flags && typeof flags === "object" && !Array.isArray(flags))) {
		return {};
	}
	return flags as Record<string, FlagResult>;
}

async function requestFlags(
	apiUrl: string,
	request: FlagEvaluationRequest,
	keys?: string[]
): Promise<Record<string, FlagResult>> {
	try {
		const response = await fetch(`${apiUrl}/public/v1/flags/bulk`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ ...request, ...(keys ? { keys } : {}) }),
		});
		return await readFlagsResponse(response);
	} catch (error) {
		if (error instanceof FlagsRequestError) {
			throw error;
		}
		throw new FlagsRequestError({
			code: "NETWORK_ERROR",
			message: error instanceof Error ? error.message : "Flag request failed",
			status: null,
			retryable: true,
		});
	}
}

export function fetchFlags(
	apiUrl: string,
	keys: string[],
	request: FlagEvaluationRequest
): Promise<Record<string, FlagResult>> {
	return requestFlags(apiUrl, request, keys);
}

export function fetchAllFlags(
	apiUrl: string,
	request: FlagEvaluationRequest
): Promise<Record<string, FlagResult>> {
	return requestFlags(apiUrl, request);
}

export class RequestBatcher {
	private readonly pending = new Map<
		string,
		{ resolve: (r: FlagResult) => void; reject: (e: Error) => void }[]
	>();
	private timer: ReturnType<typeof setTimeout> | null = null;
	private readonly batchDelayMs: number;
	private readonly apiUrl: string;
	private readonly onIdle?: () => void;
	private readonly requestBody: FlagEvaluationRequest;

	constructor(
		apiUrl: string,
		request: FlagEvaluationRequest,
		batchDelayMs = 10,
		onIdle?: () => void
	) {
		this.apiUrl = apiUrl;
		this.requestBody = request;
		this.batchDelayMs = batchDelayMs;
		this.onIdle = onIdle;
	}

	request(key: string): Promise<FlagResult> {
		return new Promise((resolve, reject) => {
			const existing = this.pending.get(key);
			if (existing) {
				existing.push({ resolve, reject });
			} else {
				this.pending.set(key, [{ resolve, reject }]);
			}

			if (!this.timer) {
				this.timer = setTimeout(() => this.flush(), this.batchDelayMs);
			}
		});
	}

	private async flush(): Promise<void> {
		this.timer = null;

		const keys = [...this.pending.keys()];
		const callbacks = new Map(this.pending);
		this.pending.clear();

		if (keys.length === 0) {
			this.onIdle?.();
			return;
		}

		try {
			const results = await fetchFlags(this.apiUrl, keys, this.requestBody);

			for (const [key, cbs] of callbacks) {
				const result = results[key] ?? {
					...DEFAULT_RESULT,
					reason: "NOT_FOUND",
				};
				for (const cb of cbs) {
					cb.resolve(result);
				}
			}
		} catch (err) {
			const error = err instanceof Error ? err : new Error("Fetch failed");
			for (const cbs of callbacks.values()) {
				for (const cb of cbs) {
					cb.reject(error);
				}
			}
		} finally {
			if (!(this.timer || this.pending.size)) {
				this.onIdle?.();
			}
		}
	}

	destroy(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		this.pending.clear();
	}
}
