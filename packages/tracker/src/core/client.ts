export interface ClientConfig {
	baseUrl: string;
	defaultHeaders?: Record<string, string>;
	initialRetryDelay?: number;
	maxRetries?: number;
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

export class HttpClient {
	baseUrl: string;
	headers: Record<string, string>;
	maxRetries: number;
	initialRetryDelay: number;

	constructor(config: ClientConfig) {
		this.baseUrl = config.baseUrl;
		this.headers = {
			"Content-Type": "application/json",
			...config.defaultHeaders,
		};
		this.maxRetries = config.maxRetries ?? 3;
		this.initialRetryDelay = config.initialRetryDelay ?? 500;
	}

	async post<T>(
		url: string,
		data: unknown,
		options: RequestInit = {},
		retryCount = 0
	): Promise<HttpResult<T>> {
		if (
			retryCount === 0 &&
			typeof navigator !== "undefined" &&
			navigator.sendBeacon &&
			options.keepalive
		) {
			try {
				const blob = new Blob([JSON.stringify(data ?? {})], {
					type: "application/json",
				});
				if (navigator.sendBeacon(url, blob)) {
					return {
						ok: true,
						data: null,
						status: null,
						attempts: 1,
						transport: "beacon",
					};
				}
			} catch {
				// Fall through to fetch so callers receive a verifiable outcome.
			}
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
			const body = parseResponseBody(text);

			if (!response.ok) {
				const retryable = isRetryableStatus(response.status);
				if (retryable && retryCount < this.maxRetries) {
					await this.waitBeforeRetry(retryCount);
					return this.post(url, data, options, retryCount + 1);
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
			const isNetworkError =
				error instanceof TypeError ||
				(error instanceof Error && error.name === "NetworkError");

			if (retryCount < this.maxRetries && isNetworkError) {
				await this.waitBeforeRetry(retryCount);
				return this.post(url, data, options, retryCount + 1);
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

	private async waitBeforeRetry(retryCount: number): Promise<void> {
		const jitter = Math.random() * 0.3 + 0.85;
		const delay = this.initialRetryDelay * 2 ** retryCount * jitter;
		await new Promise((resolve) => setTimeout(resolve, delay));
	}
}
