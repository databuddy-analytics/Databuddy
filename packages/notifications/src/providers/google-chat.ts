import type {
	GoogleChatCard,
	NotificationPayload,
	NotificationResult,
} from "../types";
import { BaseProvider } from "./base";

export interface GoogleChatProviderConfig {
	webhookUrl: string;
	timeout?: number;
	retries?: number;
	retryDelay?: number;
}

export class GoogleChatProvider extends BaseProvider {
	private readonly webhookUrl: string;

	constructor(config: GoogleChatProviderConfig) {
		super({
			timeout: config.timeout,
			retries: config.retries,
			retryDelay: config.retryDelay,
		});
		this.webhookUrl = config.webhookUrl;
	}

	async send(payload: NotificationPayload): Promise<NotificationResult> {
		if (!this.webhookUrl) {
			return {
				success: false,
				channel: "google-chat",
				error: "Google Chat webhook URL not configured",
			};
		}

		try {
			const chatPayload = this.buildPayload(payload);
			const response = await this.withRetry(async () => {
				const res = await this.fetchWithTimeout(this.webhookUrl, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(chatPayload),
				});

				if (!res.ok) {
					const text = await res.text().catch(() => "Unable to read response");
					throw new Error(
						`Google Chat API error: ${res.status} ${res.statusText} - ${text.slice(0, 200)}`
					);
				}

				return res;
			});

			return {
				success: true,
				channel: "google-chat",
				response: {
					status: response.status,
					statusText: response.statusText,
				},
			};
		} catch (error) {
			return {
				success: false,
				channel: "google-chat",
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	private buildPayload(payload: NotificationPayload) {
		const hasPriority = payload.priority && payload.priority !== "normal";

		const widgets: NonNullable<
			NonNullable<GoogleChatCard["sections"]>[number]["widgets"]
		> = [{ textParagraph: { text: payload.message } }];

		if (payload.metadata && Object.keys(payload.metadata).length > 0) {
			for (const [key, value] of Object.entries(payload.metadata)) {
				widgets.push({
					keyValue: { topLabel: key, content: String(value) },
				});
			}
		}

		return {
			cards: [
				{
					header: {
						title: payload.title,
						...(hasPriority && {
							subtitle: `Priority: ${payload.priority?.toUpperCase()}`,
						}),
					},
					sections: [{ widgets }],
				},
			],
		};
	}
}
