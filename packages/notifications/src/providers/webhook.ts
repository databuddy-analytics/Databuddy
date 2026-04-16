import { validateUrl } from "@databuddy/shared/ssrf-guard";
import type { NotificationPayload, NotificationResult } from "../types";
import { BaseProvider } from "./base";

export interface WebhookProviderConfig {
	headers?: Record<string, string>;
	method?: "GET" | "POST" | "PUT" | "PATCH";
	retries?: number;
	retryDelay?: number;
	timeout?: number;
	transformPayloadAction?: (payload: NotificationPayload) => unknown;
	url: string;
}

export class WebhookProvider extends BaseProvider {
	private readonly url: string;
	private readonly method: "GET" | "POST" | "PUT" | "PATCH";
	private readonly headers?: Record<string, string>;
	private readonly transformPayloadAction?: (
		payload: NotificationPayload
	) => unknown;

	constructor(config: WebhookProviderConfig) {
		super({
			timeout: config.timeout,
			retries: config.retries,
			retryDelay: config.retryDelay,
		});
		this.url = config.url;
		this.method = config.method ?? "POST";
		this.headers = config.headers;
		this.transformPayloadAction = config.transformPayloadAction;
	}

	async send(payload: NotificationPayload): Promise<NotificationResult> {
		if (!this.url) {
			return {
				success: false,
				channel: "webhook",
				error: "Webhook URL not configured",
			};
		}

		const urlCheck = await validateUrl(this.url);
		if (!urlCheck.safe) {
			return {
				success: false,
				channel: "webhook",
				error: `Webhook URL blocked: ${urlCheck.error}`,
			};
		}

		try {
			const body = this.transformPayloadAction
				? this.transformPayloadAction(payload)
				: payload;

			const init: RequestInit = {
				method: this.method,
				headers: {
					"Content-Type": "application/json",
					...this.headers,
				},
			};

			if (this.method !== "GET" && body) {
				init.body = JSON.stringify(body);
			}

			const response = await this.withRetry(async () => {
				const res = await this.fetchWithTimeout(this.url, init);

				if (!res.ok) {
					const text = await res.text().catch(() => "Unable to read response");
					throw new Error(
						`Webhook error: ${res.status} ${res.statusText} - ${text.slice(0, 200)}`
					);
				}

				return res;
			});

			const data = await response.json().catch(() => null);

			return {
				success: true,
				channel: "webhook",
				response: {
					status: response.status,
					statusText: response.statusText,
					data,
				},
			};
		} catch (error) {
			return {
				success: false,
				channel: "webhook",
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}
}
