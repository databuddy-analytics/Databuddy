import type { NotificationProvider } from "./providers/base";
import type { EmailProviderConfig } from "./providers/email";
import { EmailProvider } from "./providers/email";
import type { SlackProviderConfig } from "./providers/slack";
import { SlackProvider } from "./providers/slack";
import type { WebhookProviderConfig } from "./providers/webhook";
import { WebhookProvider } from "./providers/webhook";
import type {
	NotificationChannel,
	NotificationOptions,
	NotificationPayload,
	NotificationResult,
} from "./types";

export interface NotificationClientConfig {
	defaultChannels?: NotificationChannel[];
	defaultRetries?: number;
	defaultRetryDelay?: number;
	defaultTimeout?: number;
	email?: EmailProviderConfig;
	slack?: SlackProviderConfig;
	webhook?: WebhookProviderConfig;
}

export class NotificationClient {
	private readonly providers: Map<NotificationChannel, NotificationProvider>;
	private readonly defaultChannels: NotificationChannel[];

	constructor(config: NotificationClientConfig = {}) {
		this.providers = new Map();
		this.defaultChannels = [...(config.defaultChannels ?? [])];

		const defaults = {
			timeout: config.defaultTimeout ?? 10_000,
			retries: config.defaultRetries ?? 0,
			retryDelay: config.defaultRetryDelay ?? 1000,
		};

		const withDefaults = <
			T extends { timeout?: number; retries?: number; retryDelay?: number },
		>(
			c: T
		) => ({
			...c,
			timeout: c.timeout ?? defaults.timeout,
			retries: c.retries ?? defaults.retries,
			retryDelay: c.retryDelay ?? defaults.retryDelay,
		});

		if (config.slack) {
			this.providers.set(
				"slack",
				new SlackProvider(withDefaults(config.slack))
			);
		}
		if (config.email) {
			this.providers.set(
				"email",
				new EmailProvider(withDefaults(config.email))
			);
		}
		if (config.webhook) {
			this.providers.set(
				"webhook",
				new WebhookProvider(withDefaults(config.webhook))
			);
		}
	}

	async send(
		payload: NotificationPayload,
		options?: NotificationOptions
	): Promise<NotificationResult[]> {
		const channels = [
			...(options?.channels && options.channels.length > 0
				? options.channels
				: this.defaultChannels),
		];

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

		return channels.map((channel, index) => {
			const result = results[index];
			if (!result) {
				return {
					success: false,
					channel,
					error: "Notification provider returned no result",
				} satisfies NotificationResult;
			}
			if (result.status === "fulfilled") {
				return result.value;
			}
			return {
				success: false,
				channel,
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
