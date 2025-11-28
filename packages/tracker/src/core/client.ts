export type ClientConfig = {
	baseUrl: string;
	defaultHeaders?: Record<string, string | (() => string | Promise<string>)>;
	maxRetries?: number;
	initialRetryDelay?: number;
};

export class HttpClient {
	baseUrl: string;
	staticHeaders: Record<string, string> = {};
	dynamicHeaderFns: Record<string, () => string | Promise<string>> = {};
	maxRetries: number;
	initialRetryDelay: number;

	constructor(config: ClientConfig) {
		this.baseUrl = config.baseUrl;
		const headers = {
			"Content-Type": "application/json",
			...config.defaultHeaders,
		};

		for (const [key, value] of Object.entries(headers)) {
			if (typeof value === "function") {
				this.dynamicHeaderFns[key] = value;
			} else {
				this.staticHeaders[key] = value as string;
			}
		}

		this.maxRetries = config.maxRetries ?? 3;
		this.initialRetryDelay = config.initialRetryDelay ?? 500;
	}

	async resolveHeaders(): Promise<Record<string, string>> {
		const dynamicEntries = await Promise.all(
			Object.entries(this.dynamicHeaderFns).map(async ([key, fn]) => [
				key,
				await fn(),
			])
		);
		return { ...this.staticHeaders, ...Object.fromEntries(dynamicEntries) };
	}

	async post<T>(
		url: string,
		data: any,
		options: RequestInit = {},
		retryCount = 0
	): Promise<T | null> {
		if (retryCount === 0 && typeof navigator !== "undefined" && navigator.sendBeacon && options.keepalive) {
			try {
				const blob = new Blob([JSON.stringify(data ?? {})], {
					type: "application/json",
				});
				if (navigator.sendBeacon(url, blob)) {
					return { success: true } as any;
				}
			} catch (e) {
				console.error("Error sending beacon", e);
			}
		}

		try {
			const fetchOptions: RequestInit = {
				method: "POST",
				headers: await this.resolveHeaders(),
				body: JSON.stringify(data ?? {}),
				keepalive: true,
				credentials: "omit",
				...options,
			};

			const response = await fetch(url, fetchOptions);

			if (response.status === 401) {
				return null;
			}

			if (response.status !== 200 && response.status !== 202) {
				if (
					((response.status >= 500 && response.status < 600) ||
						response.status === 429) &&
					retryCount < this.maxRetries
				) {
					const jitter = Math.random() * 0.3 + 0.85;
					const delay = this.initialRetryDelay * 2 ** retryCount * jitter;
					await new Promise((resolve) => setTimeout(resolve, delay));
					return this.post(url, data, options, retryCount + 1);
				}
				throw new Error(
					`HTTP error! status: ${response.status} for URL: ${url}`
				);
			}

			try {
				return await response.json();
			} catch (_e) {
				const text = await response.text();
				return text ? JSON.parse(text) : null;
			}
		} catch (error) {
			const isNetworkError =
				error instanceof TypeError ||
				(error instanceof Error && error.name === "NetworkError");

			if (retryCount < this.maxRetries && isNetworkError) {
				const jitter = Math.random() * 0.3 + 0.85;
				const delay = this.initialRetryDelay * 2 ** retryCount * jitter;
				await new Promise((resolve) => setTimeout(resolve, delay));
				return this.post(url, data, options, retryCount + 1);
			}
			return null;
		}
	}

	fetch<T>(
		endpoint: string,
		data: any,
		options: RequestInit = {}
	): Promise<T | null> {
		const url = `${this.baseUrl}${endpoint}`;
		return this.post(url, data, options, 0);
	}
}
