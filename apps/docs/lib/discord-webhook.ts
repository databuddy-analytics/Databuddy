interface DiscordEmbed {
	title?: string;
	description?: string;
	color?: number;
	fields?: Array<{
		name: string;
		value: string;
		inline?: boolean;
	}>;
	timestamp?: string;
	footer?: {
		text: string;
	};
}

interface DiscordWebhookMessage {
	content?: string;
	embeds?: DiscordEmbed[];
	username?: string;
	avatar_url?: string;
}

class DiscordWebhook {
	private webhookUrl: string;

	constructor(webhookUrl: string) {
		this.webhookUrl = webhookUrl;
	}

	private async sendMessage(message: DiscordWebhookMessage): Promise<boolean> {
		if (!this.webhookUrl) {
			console.warn('Discord webhook URL not configured');
			return false;
		}

		try {
			const response = await fetch(this.webhookUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(message),
			});

			if (!response.ok) {
				console.error(
					`Discord webhook failed: ${response.status} ${response.statusText}`
				);
				return false;
			}

			return true;
		} catch (error) {
			console.error('Failed to send Discord webhook:', error);
			return false;
		}
	}

	async logSuccess(
		title: string,
		message: string,
		metadata?: Record<string, unknown>
	): Promise<boolean> {
		return await this.sendMessage({
			embeds: [
				{
					title: `✅ ${title}`,
					description: message,
					color: 0x00_ff_00, // Green
					fields: metadata ? this.formatMetadata(metadata) : undefined,
					timestamp: new Date().toISOString(),
					footer: {
						text: 'Databuddy Docs',
					},
				},
			],
		});
	}

	async logWarning(
		title: string,
		message: string,
		metadata?: Record<string, unknown>
	): Promise<boolean> {
		return await this.sendMessage({
			embeds: [
				{
					title: `⚠️ ${title}`,
					description: message,
					color: 0xff_a5_00, // Orange
					fields: metadata ? this.formatMetadata(metadata) : undefined,
					timestamp: new Date().toISOString(),
					footer: {
						text: 'Databuddy Docs',
					},
				},
			],
		});
	}

	async logError(
		title: string,
		message: string,
		metadata?: Record<string, unknown>
	): Promise<boolean> {
		return await this.sendMessage({
			embeds: [
				{
					title: `❌ ${title}`,
					description: message,
					color: 0xff_00_00, // Red
					fields: metadata ? this.formatMetadata(metadata) : undefined,
					timestamp: new Date().toISOString(),
					footer: {
						text: 'Databuddy Docs',
					},
				},
			],
		});
	}

	async logException(
		error: Error,
		context?: Record<string, unknown>
	): Promise<boolean> {
		const errorMetadata = {
			error: error.message,
			stack: error.stack ? `${error.stack.slice(0, 500)}...` : 'No stack trace',
			...context,
		};

		return await this.logError(
			'Exception Occurred',
			error.message,
			errorMetadata
		);
	}

	private formatMetadata(metadata: Record<string, unknown>) {
		return Object.entries(metadata)
			.filter(([, value]) => value !== undefined && value !== null)
			.slice(0, 10) // Discord embed limit
			.map(([key, value]) => ({
				name: key,
				value: `${String(value).slice(0, 1024)}`, // Discord field value limit
				inline: true,
			}));
	}
}

// Create webhook instance
const webhookUrl = process.env.DISCORD_WEBHOOK_URL || '';
const discordWebhook = new DiscordWebhook(webhookUrl);

export const logger = {
	success: (
		title: string,
		message: string,
		metadata?: Record<string, unknown>
	) => discordWebhook.logSuccess(title, message, metadata),
	warning: (
		title: string,
		message: string,
		metadata?: Record<string, unknown>
	) => discordWebhook.logWarning(title, message, metadata),
	error: (title: string, message: string, metadata?: Record<string, unknown>) =>
		discordWebhook.logError(title, message, metadata),
	exception: (error: Error, context?: Record<string, unknown>) =>
		discordWebhook.logException(error, context),
};
