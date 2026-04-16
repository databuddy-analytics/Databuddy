export interface ClientConfig {
	baseUrl: string;
	defaultHeaders?: Record<string, string>;
	initialRetryDelay?: number;
	maxRetries?: number;
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
		data: any,
		options: RequestInit = {},
		retryCount = 0
	): Promise<T | null> {
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
					return { success: true } as any;
				}
			} catch (e) {
				console.error("Error sending beacon", e);
			}
		}

		try {
			const fetchOptions: RequestInit = {
				method: "POST",
				headers: this.headers,
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

			const text = await response.text();
			if (!text) {
				return null;
			}
			try {
				return JSON.parse(text);
			} catch {
				return null;
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
		options: RequestInit = {},
		queryParams?: Record<string, string>
	): Promise<T | null> {
		let url = `${this.baseUrl}${endpoint}`;
		if (queryParams) {
			const params = new URLSearchParams(queryParams);
			url = `${url}?${params.toString()}`;
		}
		return this.post(url, data, options, 0);
	}
}
