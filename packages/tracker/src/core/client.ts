export interface ClientConfig {
	baseUrl: string;
	defaultHeaders?: Record<string, string>;
	initialRetryDelay?: number;
	maxRetries?: number;
	requestTimeoutMs?: number;
}

export type HttpResult<T> =
	| {
			attempts: number;
			data: T | null;
			ok: true;
			status: number | null;
			transport: "beacon" | "fetch";
	  }
	| {
			attempts: number;
			code: "HTTP_ERROR" | "NETWORK_ERROR" | "REQUEST_ERROR";
			message: string;
			ok: false;
			retryable: boolean;
			status: number | null;
			transport: "fetch";
	  };

function parseResponseBody(text: string): unknown {
	if (!text) {
		return null;
	}
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

function responseErrorMessage(body: unknown, status: number): string {
	if (body && typeof body === "object") {
		const record = body as Record<string, unknown>;
		const message = record.error ?? record.message;
		if (typeof message === "string" && message.trim()) {
			return message;
		}
	}
	if (typeof body === "string" && body.trim()) {
		return body;
	}
	return `HTTP ${status}`;
}

function isRetryableStatus(status: number): boolean {
	return status === 408 || status === 425 || status === 429 || status >= 500;
}

class RequestTimeoutError extends Error {
	readonly timeoutMs: number;

	constructor(timeoutMs: number) {
		super(`Request timed out after ${timeoutMs}ms`);
		this.name = "RequestTimeoutError";
		this.timeoutMs = timeoutMs;
	}
}

export class HttpClient {
	baseUrl: string;
	headers: Record<string, string>;
	maxRetries: number;
	initialRetryDelay: number;
	requestTimeoutMs: number;
	private readonly activeRequests = new Set<AbortController>();

	constructor(config: ClientConfig) {
		this.baseUrl = config.baseUrl;
		this.headers = {
			"Content-Type": "application/json",
			...config.defaultHeaders,
		};
		this.maxRetries = config.maxRetries ?? 3;
		this.initialRetryDelay = config.initialRetryDelay ?? 500;
		this.requestTimeoutMs = config.requestTimeoutMs ?? 10_000;
	}

	async post<T>(
		url: string,
		data: unknown,
		options: RequestInit = {},
		retryCount = 0
	): Promise<HttpResult<T>> {
		const controller = new AbortController();
		const callerSignal = options.signal;
		const abortFromCaller = () => controller.abort();
		let timeout: ReturnType<typeof setTimeout> | undefined;

		if (callerSignal?.aborted) {
			controller.abort();
		} else {
			callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
		}
		this.activeRequests.add(controller);
		if (this.requestTimeoutMs > 0) {
			timeout = setTimeout(() => {
				controller.abort(new RequestTimeoutError(this.requestTimeoutMs));
			}, this.requestTimeoutMs);
			timeout.unref?.();
		}

		try {
			return await this.postAttempt<T>(
				url,
				data,
				{ ...options, signal: controller.signal },
				retryCount
			);
		} finally {
			if (timeout) {
				clearTimeout(timeout);
			}
			this.activeRequests.delete(controller);
			callerSignal?.removeEventListener("abort", abortFromCaller);
		}
	}

	cancelPendingRequests(): void {
		for (const controller of this.activeRequests) {
			controller.abort();
		}
	}

	private async postAttempt<T>(
		url: string,
		data: unknown,
		options: RequestInit,
		retryCount: number
	): Promise<HttpResult<T>> {
		const signal = options.signal;
		if (signal?.aborted) {
			return this.abortedResult(retryCount, signal);
		}

		try {
			const response = await fetch(url, {
				method: "POST",
				headers: this.headers,
				body: JSON.stringify(data ?? {}),
				keepalive: true,
				credentials: "omit",
				...options,
			});
			const text = await response.text();
			if (signal?.aborted) {
				return this.abortedResult(retryCount + 1, signal);
			}
			const body = parseResponseBody(text);

			if (!response.ok) {
				const retryable = isRetryableStatus(response.status);
				if (retryable && retryCount < this.maxRetries) {
					const shouldRetry = await this.waitBeforeRetry(retryCount, signal);
					if (!shouldRetry) {
						return this.abortedResult(retryCount + 1, signal);
					}
					return this.postAttempt(url, data, options, retryCount + 1);
				}
				return {
					ok: false,
					code: "HTTP_ERROR",
					message: responseErrorMessage(body, response.status),
					status: response.status,
					retryable,
					attempts: retryCount + 1,
					transport: "fetch",
				};
			}

			return {
				ok: true,
				data: body as T | null,
				status: response.status,
				attempts: retryCount + 1,
				transport: "fetch",
			};
		} catch (error) {
			if (
				signal?.aborted ||
				(error instanceof Error && error.name === "AbortError")
			) {
				return this.abortedResult(retryCount + 1, signal);
			}
			const isNetworkError =
				error instanceof TypeError ||
				(error instanceof Error && error.name === "NetworkError");

			if (retryCount < this.maxRetries && isNetworkError) {
				const shouldRetry = await this.waitBeforeRetry(retryCount, signal);
				if (!shouldRetry) {
					return this.abortedResult(retryCount + 1, signal);
				}
				return this.postAttempt(url, data, options, retryCount + 1);
			}

			return {
				ok: false,
				code: isNetworkError ? "NETWORK_ERROR" : "REQUEST_ERROR",
				message: error instanceof Error ? error.message : "Request failed",
				status: null,
				retryable: isNetworkError,
				attempts: retryCount + 1,
				transport: "fetch",
			};
		}
	}

	fetch<T>(
		endpoint: string,
		data: unknown,
		options: RequestInit = {},
		queryParams?: Record<string, string>
	): Promise<HttpResult<T>> {
		let url = `${this.baseUrl}${endpoint}`;
		if (queryParams) {
			const params = new URLSearchParams(queryParams);
			url = `${url}?${params.toString()}`;
		}
		return this.post(url, data, options, 0);
	}

	private abortedResult<T>(
		attempts: number,
		signal?: AbortSignal | null
	): HttpResult<T> {
		const timeout = signal?.reason instanceof RequestTimeoutError;
		return {
			ok: false,
			code: timeout ? "NETWORK_ERROR" : "REQUEST_ERROR",
			message: timeout ? signal.reason.message : "Request aborted",
			status: null,
			retryable: timeout,
			attempts,
			transport: "fetch",
		};
	}

	private async waitBeforeRetry(
		retryCount: number,
		signal: AbortSignal | null | undefined
	): Promise<boolean> {
		if (signal?.aborted) {
			return false;
		}
		const jitter = Math.random() * 0.3 + 0.85;
		const delay = this.initialRetryDelay * 2 ** retryCount * jitter;
		return await new Promise((resolve) => {
			let timer: ReturnType<typeof setTimeout> | undefined;
			const handleAbort = () => {
				if (timer !== undefined) {
					clearTimeout(timer);
				}
				signal?.removeEventListener("abort", handleAbort);
				resolve(false);
			};

			timer = setTimeout(() => {
				signal?.removeEventListener("abort", handleAbort);
				resolve(true);
			}, delay);
			signal?.addEventListener("abort", handleAbort, { once: true });
		});
	}
}
