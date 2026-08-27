import type {
	DiscordEmbed,
	DiscordEmbedField,
	DiscordPayload,
	NotificationPayload,
	NotificationResult,
} from "../types";
import { BaseProvider } from "./base";
import {
	formatMetadataLabel,
	isUserFacingMetadata,
	truncate,
} from "./payload-utils";

const MAX_TITLE_LENGTH = 256;
const MAX_DESCRIPTION_LENGTH = 4096;
const MAX_FIELD_NAME_LENGTH = 256;
const MAX_FIELD_VALUE_LENGTH = 1024;
const MAX_FIELDS = 25;
const MAX_TOTAL_EMBED_LENGTH = 6000;

const PRIORITY_COLORS: Record<"low" | "high" | "urgent", number> = {
	low: 0x95_a5_a6,
	high: 0xf3_9c_12,
	urgent: 0xed_42_45,
};

export function buildDiscordEmbed(payload: NotificationPayload): DiscordEmbed {
	const title = truncate(payload.title, MAX_TITLE_LENGTH);
	const description = truncate(payload.message, MAX_DESCRIPTION_LENGTH);
	const elevatedPriority =
		payload.priority && payload.priority !== "normal" ? payload.priority : null;
	const priorityStyle = elevatedPriority
		? {
				color: PRIORITY_COLORS[elevatedPriority],
				footer: { text: `Priority: ${elevatedPriority.toUpperCase()}` },
			}
		: null;

	let total =
		title.length +
		description.length +
		(priorityStyle?.footer.text.length ?? 0);

	const fields: DiscordEmbedField[] = [];
	if (payload.metadata) {
		for (const [key, value] of Object.entries(payload.metadata)) {
			if (fields.length >= MAX_FIELDS) {
				break;
			}
			if (!isUserFacingMetadata(key)) {
				continue;
			}

			const name = truncate(formatMetadataLabel(key), MAX_FIELD_NAME_LENGTH);
			const fieldValue = truncate(String(value), MAX_FIELD_VALUE_LENGTH);
			if (!(name && fieldValue)) {
				continue;
			}
			const fieldLength = name.length + fieldValue.length;

			if (total + fieldLength > MAX_TOTAL_EMBED_LENGTH) {
				break;
			}

			fields.push({ inline: true, name, value: fieldValue });
			total += fieldLength;
		}
	}

	return {
		title,
		description,
		...(fields.length > 0 && { fields }),
		...priorityStyle,
	};
}

export interface DiscordProviderConfig {
	avatarUrl?: string;
	retries?: number;
	retryDelay?: number;
	timeout?: number;
	username?: string;
	webhookUrl: string;
}

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
		return {
			embeds: [buildDiscordEmbed(payload)],
			...(this.username && { username: this.username }),
			...(this.avatarUrl && { avatar_url: this.avatarUrl }),
		};
	}
}
