import type {
	NotificationPayload,
	NotificationResult,
	SlackPayload,
} from "../types";
import { BaseProvider } from "./base";

const MAX_HEADER_LENGTH = 150;
const MAX_MESSAGE_LENGTH = 2900;
const MAX_FIELD_LENGTH = 1900;
const MAX_FIELDS_PER_SECTION = 10;
const FIRST_CHARACTER_PATTERN = /^./;

function truncate(value: string, maxLength: number): string {
	if (value.length <= maxLength) {
		return value;
	}
	return `${value.slice(0, maxLength - 1)}…`;
}

function isUserFacingMetadata(key: string): boolean {
	return !(
		key === "to" ||
		key === "template" ||
		key === "zScore" ||
		key.endsWith("Id")
	);
}

function formatMetadataLabel(key: string): string {
	return key
		.replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replaceAll(/[_-]+/g, " ")
		.replace(FIRST_CHARACTER_PATTERN, (character) => character.toUpperCase());
}

export function buildSlackBlocks(
	payload: NotificationPayload
): NonNullable<SlackPayload["blocks"]> {
	const blocks: NonNullable<SlackPayload["blocks"]> = [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: truncate(payload.title, MAX_HEADER_LENGTH),
			},
		},
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: truncate(payload.message, MAX_MESSAGE_LENGTH),
			},
		},
	];

	const metadataFields = payload.metadata
		? Object.entries(payload.metadata)
				.filter(([key]) => isUserFacingMetadata(key))
				.map(([key, value]) => ({
					type: "mrkdwn" as const,
					text: truncate(
						`*${formatMetadataLabel(key)}*\n${String(value)}`,
						MAX_FIELD_LENGTH
					),
				}))
		: [];
	for (
		let index = 0;
		index < metadataFields.length;
		index += MAX_FIELDS_PER_SECTION
	) {
		blocks.push({
			type: "section",
			fields: metadataFields.slice(index, index + MAX_FIELDS_PER_SECTION),
		});
	}

	if (payload.priority && payload.priority !== "normal") {
		blocks.push({
			type: "context",
			elements: [
				{
					type: "mrkdwn",
					text: `Priority: *${payload.priority.toUpperCase()}*`,
				},
			],
		});
	}

	return blocks;
}

export interface SlackProviderConfig {
	channel?: string;
	iconEmoji?: string;
	iconUrl?: string;
	retries?: number;
	retryDelay?: number;
	timeout?: number;
	username?: string;
	webhookUrl: string;
}

export class SlackProvider extends BaseProvider {
	private readonly webhookUrl: string;
	private readonly channel?: string;
	private readonly username?: string;
	private readonly iconEmoji?: string;
	private readonly iconUrl?: string;

	constructor(config: SlackProviderConfig) {
		super({
			timeout: config.timeout,
			retries: config.retries,
			retryDelay: config.retryDelay,
		});
		this.webhookUrl = config.webhookUrl;
		this.channel = config.channel;
		this.username = config.username;
		this.iconEmoji = config.iconEmoji;
		this.iconUrl = config.iconUrl;
	}

	async send(payload: NotificationPayload): Promise<NotificationResult> {
		if (!this.webhookUrl) {
			return {
				success: false,
				channel: "slack",
				error: "Slack webhook URL not configured",
			};
		}

		try {
			const slackPayload = this.buildPayload(payload);
			const response = await this.withRetry(async () => {
				const res = await this.fetchWithTimeout(this.webhookUrl, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(slackPayload),
				});

				if (!res.ok) {
					const text = await res.text().catch(() => "Unable to read response");
					throw new Error(
						`Slack API error: ${res.status} ${res.statusText} - ${text.slice(0, 200)}`
					);
				}

				return res;
			});

			return {
				success: true,
				channel: "slack",
				response: {
					status: response.status,
					statusText: response.statusText,
				},
			};
		} catch (error) {
			return {
				success: false,
				channel: "slack",
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	private buildPayload(payload: NotificationPayload): SlackPayload {
		return {
			blocks: buildSlackBlocks(payload),
			text: truncate(payload.title, MAX_MESSAGE_LENGTH),
			...(this.channel && { channel: this.channel }),
			...(this.username && { username: this.username }),
			...(this.iconEmoji && { icon_emoji: this.iconEmoji }),
			...(this.iconUrl && { icon_url: this.iconUrl }),
		};
	}
}
