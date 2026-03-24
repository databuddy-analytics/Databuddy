import type {
	NotificationPayload,
	NotificationPriority,
	NotificationResult,
	TelegramPayload,
} from "../types";
import { BaseProvider } from "./base";

export interface TelegramProviderConfig {
	botToken: string;
	chatId: string;
	timeout?: number;
	retries?: number;
	retryDelay?: number;
}

const PRIORITY_LABELS: Record<NotificationPriority, string> = {
	urgent: "🔴 URGENT",
	high: "🟠 HIGH",
	normal: "",
	low: "🔵 LOW",
};

function escapeHtml(str: string): string {
	return str
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

export class TelegramProvider extends BaseProvider {
	private readonly botToken: string;
	private readonly chatId: string;

	constructor(config: TelegramProviderConfig) {
		super({
			timeout: config.timeout,
			retries: config.retries,
			retryDelay: config.retryDelay,
		});
		this.botToken = config.botToken;
		this.chatId = config.chatId;
	}

	async send(payload: NotificationPayload): Promise<NotificationResult> {
		if (!(this.botToken && this.chatId)) {
			return {
				success: false,
				channel: "telegram",
				error: "Telegram botToken and chatId are required",
			};
		}

		try {
			const telegramPayload = this.buildPayload(payload);
			const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

			const response = await this.withRetry(async () => {
				const res = await this.fetchWithTimeout(url, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(telegramPayload),
				});

				if (!res.ok) {
					const text = await res.text().catch(() => "Unable to read response");
					throw new Error(
						`Telegram API error: ${res.status} ${res.statusText} - ${text.slice(0, 200)}`
					);
				}

				return res;
			});

			return {
				success: true,
				channel: "telegram",
				response: {
					status: response.status,
					statusText: response.statusText,
				},
			};
		} catch (error) {
			return {
				success: false,
				channel: "telegram",
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	private buildPayload(payload: NotificationPayload): TelegramPayload {
		const priorityLabel = PRIORITY_LABELS[payload.priority ?? "normal"];
		const prefix = priorityLabel ? `${priorityLabel}\n` : "";

		let text = `${prefix}<b>${escapeHtml(payload.title)}</b>\n\n${escapeHtml(payload.message)}`;

		if (payload.metadata && Object.keys(payload.metadata).length > 0) {
			const metadataLines = Object.entries(payload.metadata)
				.map(
					([key, value]) =>
						`<b>${escapeHtml(key)}:</b> ${escapeHtml(String(value))}`
				)
				.join("\n");
			text += `\n\n${metadataLines}`;
		}

		return {
			chat_id: this.chatId,
			text,
			parse_mode: "HTML",
			disable_web_page_preview: true,
		};
	}
}
