import type { NotificationProvider } from "./providers/base";
import type { DiscordProviderConfig } from "./providers/discord";
import { DiscordProvider } from "./providers/discord";
import type { EmailProviderConfig } from "./providers/email";
import { EmailProvider } from "./providers/email";
import type { GoogleChatProviderConfig } from "./providers/google-chat";
import { GoogleChatProvider } from "./providers/google-chat";
import type { SlackProviderConfig } from "./providers/slack";
import { SlackProvider } from "./providers/slack";
import type { TeamsProviderConfig } from "./providers/teams";
import { TeamsProvider } from "./providers/teams";
import type { TelegramProviderConfig } from "./providers/telegram";
import { TelegramProvider } from "./providers/telegram";
import type { WebhookProviderConfig } from "./providers/webhook";
import { WebhookProvider } from "./providers/webhook";
import type {
	NotificationChannel,
	NotificationOptions,
	NotificationPayload,
	NotificationResult,
} from "./types";

export interface NotificationClientConfig {
	slack?: SlackProviderConfig;
	discord?: DiscordProviderConfig;
	email?: EmailProviderConfig;
	webhook?: WebhookProviderConfig;
	teams?: TeamsProviderConfig;
	telegram?: TelegramProviderConfig;
	googleChat?: GoogleChatProviderConfig;
	defaultChannels?: NotificationChannel[];
	defaultTimeout?: number;
	defaultRetries?: number;
	defaultRetryDelay?: number;
}

export class NotificationClient {
	private readonly providers: Map<NotificationChannel, NotificationProvider>;
	private readonly defaultChannels: NotificationChannel[];

	constructor(config: NotificationClientConfig = {}) {
		this.providers = new Map();
		this.defaultChannels = config.defaultChannels ?? [];

		const defaults = {
			timeout: config.defaultTimeout ?? 10_000,
			retries: config.defaultRetries ?? 0,
			retryDelay: config.defaultRetryDelay ?? 1000,
		};

		if (config.slack) {
			this.providers.set(
				"slack",
				new SlackProvider({
					...config.slack,
					timeout: config.slack.timeout ?? defaults.timeout,
					retries: config.slack.retries ?? defaults.retries,
					retryDelay: config.slack.retryDelay ?? defaults.retryDelay,
				})
			);
		}

		if (config.discord) {
			this.providers.set(
				"discord",
				new DiscordProvider({
					...config.discord,
					timeout: config.discord.timeout ?? defaults.timeout,
					retries: config.discord.retries ?? defaults.retries,
					retryDelay: config.discord.retryDelay ?? defaults.retryDelay,
				})
			);
		}

		if (config.email) {
			this.providers.set(
				"email",
				new EmailProvider({
					...config.email,
					timeout: config.email.timeout ?? defaults.timeout,
					retries: config.email.retries ?? defaults.retries,
					retryDelay: config.email.retryDelay ?? defaults.retryDelay,
				})
			);
		}

		if (config.webhook) {
			this.providers.set(
				"webhook",
				new WebhookProvider({
					...config.webhook,
					timeout: config.webhook.timeout ?? defaults.timeout,
					retries: config.webhook.retries ?? defaults.retries,
					retryDelay: config.webhook.retryDelay ?? defaults.retryDelay,
				})
			);
		}

		if (config.teams) {
			this.providers.set(
				"teams",
				new TeamsProvider({
					...config.teams,
					timeout: config.teams.timeout ?? defaults.timeout,
					retries: config.teams.retries ?? defaults.retries,
					retryDelay: config.teams.retryDelay ?? defaults.retryDelay,
				})
			);
		}

		if (config.telegram) {
			this.providers.set(
				"telegram",
				new TelegramProvider({
					...config.telegram,
					timeout: config.telegram.timeout ?? defaults.timeout,
					retries: config.telegram.retries ?? defaults.retries,
					retryDelay: config.telegram.retryDelay ?? defaults.retryDelay,
				})
			);
		}

		if (config.googleChat) {
			this.providers.set(
				"google-chat",
				new GoogleChatProvider({
					...config.googleChat,
					timeout: config.googleChat.timeout ?? defaults.timeout,
					retries: config.googleChat.retries ?? defaults.retries,
					retryDelay: config.googleChat.retryDelay ?? defaults.retryDelay,
				})
			);
		}
	}

	async send(
		payload: NotificationPayload,
		options?: NotificationOptions
	): Promise<NotificationResult[]> {
		const channels =
			options?.channels && options.channels.length > 0
				? options.channels
				: this.defaultChannels;

		if (channels.length === 0) {
			return [];
		}

		const results = await Promise.allSettled(
			channels.map((channel) => {
				const provider = this.providers.get(channel);
				if (!provider) {
					return Promise.resolve({
						success: false,
						channel,
						error: `Provider for channel '${channel}' not configured`,
					} satisfies NotificationResult);
				}

				return provider.send(payload);
			})
		);

		return results.map((result, index) => {
			if (result.status === "fulfilled") {
				return result.value;
			}
			return {
				success: false,
				channel: channels[index],
				error:
					result.reason instanceof Error
						? result.reason.message
						: String(result.reason),
			} satisfies NotificationResult;
		});
	}

	sendToChannel(
		channel: NotificationChannel,
		payload: NotificationPayload
	): Promise<NotificationResult> {
		const provider = this.providers.get(channel);
		if (!provider) {
			return Promise.resolve({
				success: false,
				channel,
				error: `Provider for channel '${channel}' not configured`,
			});
		}

		return provider.send(payload);
	}

	hasChannel(channel: NotificationChannel): boolean {
		return this.providers.has(channel);
	}

	getConfiguredChannels(): NotificationChannel[] {
		return Array.from(this.providers.keys());
	}
}
