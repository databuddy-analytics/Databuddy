import type { NotificationPayload, NotificationResult } from "../types";

export interface NotificationProvider {
	send(payload: NotificationPayload): Promise<NotificationResult>;
}

export abstract class BaseProvider implements NotificationProvider {
	protected timeout: number;
	protected retries: number;
	protected retryDelay: number;

	constructor(options?: {
		timeout?: number;
		retries?: number;
		retryDelay?: number;
	}) {
		this.timeout = options?.timeout ?? 10_000;
		this.retries = options?.retries ?? 0;
		this.retryDelay = options?.retryDelay ?? 1000;
	}

	abstract send(payload: NotificationPayload): Promise<NotificationResult>;

	protected async withRetry<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
		try {
			return await fn();
		} catch (error) {
			if (attempt < this.retries) {
				const backoff = this.retryDelay * 2 ** attempt + Math.random() * 500;
				await this.delay(backoff);
				return this.withRetry(fn, attempt + 1);
			}
			throw error;
		}
	}

	protected fetchWithTimeout(
		url: string,
		init?: RequestInit
	): Promise<Response> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		return fetch(url, { ...init, signal: controller.signal })
			.then((res) => {
				clearTimeout(timeoutId);
				return res;
			})
			.catch((error) => {
				clearTimeout(timeoutId);
				if (error instanceof Error && error.name === "AbortError") {
					throw new Error(`Request timed out after ${this.timeout}ms`);
				}
				throw error;
			});
	}

	protected delay(ms: number): Promise<void> {
		return new Promise((resolve) => {
			setTimeout(resolve, ms);
		});
	}
}
