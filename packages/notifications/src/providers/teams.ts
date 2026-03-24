import type {
	NotificationPayload,
	NotificationPriority,
	NotificationResult,
	TeamsCardElement,
	TeamsPayload,
} from "../types";
import { BaseProvider } from "./base";

export interface TeamsProviderConfig {
	webhookUrl: string;
	timeout?: number;
	retries?: number;
	retryDelay?: number;
}

const PRIORITY_COLORS: Record<NotificationPriority, string> = {
	urgent: "attention",
	high: "warning",
	normal: "good",
	low: "accent",
};

export class TeamsProvider extends BaseProvider {
	private readonly webhookUrl: string;

	constructor(config: TeamsProviderConfig) {
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
				channel: "teams",
				error: "Teams webhook URL not configured",
			};
		}

		try {
			const teamsPayload = this.buildPayload(payload);
			const response = await this.withRetry(async () => {
				const res = await this.fetchWithTimeout(this.webhookUrl, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(teamsPayload),
				});

				if (!res.ok) {
					const text = await res.text().catch(() => "Unable to read response");
					throw new Error(
						`Teams API error: ${res.status} ${res.statusText} - ${text.slice(0, 200)}`
					);
				}

				return res;
			});

			return {
				success: true,
				channel: "teams",
				response: {
					status: response.status,
					statusText: response.statusText,
				},
			};
		} catch (error) {
			return {
				success: false,
				channel: "teams",
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	private buildPayload(payload: NotificationPayload): TeamsPayload {
		const body: TeamsCardElement[] = [
			{
				type: "TextBlock",
				text: payload.title,
				size: "Large",
				weight: "Bolder",
				wrap: true,
			},
			{
				type: "TextBlock",
				text: payload.message,
				wrap: true,
			},
		];

		if (payload.priority && payload.priority !== "normal") {
			body.push({
				type: "TextBlock",
				text: `Priority: ${payload.priority.toUpperCase()}`,
				color: PRIORITY_COLORS[payload.priority],
				weight: "Bolder",
				spacing: "Small",
			});
		}

		if (payload.metadata && Object.keys(payload.metadata).length > 0) {
			body.push({
				type: "FactSet",
				facts: Object.entries(payload.metadata).map(([title, value]) => ({
					title,
					value: String(value),
				})),
			});
		}

		return {
			type: "message",
			attachments: [
				{
					contentType: "application/vnd.microsoft.card.adaptive",
					content: {
						type: "AdaptiveCard",
						version: "1.4",
						body,
					},
				},
			],
		};
	}
}
