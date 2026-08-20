export type NotificationChannel = "slack" | "discord" | "email" | "webhook";

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export interface NotificationPayload {
	message: string;
	metadata?: Record<string, unknown>;
	priority?: NotificationPriority;
	title: string;
}

export interface NotificationResult {
	channel: NotificationChannel;
	error?: string;
	response?: unknown;
	success: boolean;
}

export interface NotificationOptions {
	channels?: NotificationChannel[];
	retries?: number;
	retryDelay?: number;
	timeout?: number;
}

export interface SlackTextElement {
	text: string;
	type: "plain_text" | "mrkdwn";
}

export interface SlackBlock {
	elements?: SlackTextElement[];
	fields?: SlackTextElement[];
	text?: SlackTextElement;
	type: "header" | "section" | "context" | "divider" | "actions";
}

export interface SlackPayload {
	blocks?: SlackBlock[];
	channel?: string;
	icon_emoji?: string;
	icon_url?: string;
	text?: string;
	username?: string;
}

export interface DiscordEmbedField {
	inline?: boolean;
	name: string;
	value: string;
}

export interface DiscordEmbed {
	color?: number;
	description?: string;
	fields?: DiscordEmbedField[];
	footer?: { text: string };
	title?: string;
}

export interface DiscordPayload {
	avatar_url?: string;
	content?: string;
	embeds?: DiscordEmbed[];
	username?: string;
}

export interface EmailPayload {
	from?: string;
	html?: string;
	subject: string;
	text?: string;
	to: string | string[];
}

export interface WebhookPayload {
	body?: unknown;
	headers?: Record<string, string>;
	method?: "GET" | "POST" | "PUT" | "PATCH";
	timeout?: number;
	url: string;
}
