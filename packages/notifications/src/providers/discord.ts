import type {
	DiscordEmbed,
	DiscordPayload,
	NotificationPayload,
	NotificationPriority,
	NotificationResult,
} from "../types";
import { BaseProvider } from "./base";

export interface DiscordProviderConfig {
	webhookUrl: string;
	username?: string;
	avatarUrl?: string;
	timeout?: number;
	retries?: number;
	retryDelay?: number;
}

const PRIORITY_COLORS: Record<NotificationPriority, number> = {
	urgent: 0xe7_4c_3c,
	high: 0xf3_9c_12,
	normal: 0x57_f2_87,
	low: 0x58_65_f2,
};

export class DiscordProvider extends BaseProvider {
	private readonly webhookUrl: string;
	private readonly username?: string;
	private readonly avatarUrl?: string;

	constructor(config: DiscordProviderConfig) {
		super({
			timeout: config.timeout,
			retries: config.retries,
			retryDelay: config.retryDelay,
		});
		this.webhookUrl = config.webhookUrl;
		this.username = config.username;
		this.avatarUrl = config.avatarUrl;
	}

	async send(payload: NotificationPayload): Promise<NotificationResult> {
		if (!this.webhookUrl) {
			return {
				success: false,
				channel: "discord",
				error: "Discord webhook URL not configured",
			};
		}

		try {
			const discordPayload = this.buildPayload(payload);
			const response = await this.withRetry(async () => {
				const res = await this.fetchWithTimeout(this.webhookUrl, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(discordPayload),
				});

				if (!res.ok) {
					const text = await res.text().catch(() => "Unable to read response");
					throw new Error(
						`Discord API error: ${res.status} ${res.statusText} - ${text.slice(0, 200)}`
					);
				}

				return res;
			});

			return {
				success: true,
				channel: "discord",
				response: {
					status: response.status,
					statusText: response.statusText,
				},
			};
		} catch (error) {
			return {
				success: false,
				channel: "discord",
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	private buildPayload(payload: NotificationPayload): DiscordPayload {
		const embed: DiscordEmbed = {
			title: payload.title,
			description: payload.message,
			color: PRIORITY_COLORS[payload.priority ?? "normal"],
			timestamp: new Date().toISOString(),
		};

		if (payload.metadata && Object.keys(payload.metadata).length > 0) {
			embed.fields = Object.entries(payload.metadata).map(([name, value]) => ({
				name,
				value: String(value),
				inline: true,
			}));
		}

		return {
			embeds: [embed],
			...(this.username && { username: this.username }),
			...(this.avatarUrl && { avatar_url: this.avatarUrl }),
		};
	}
}
