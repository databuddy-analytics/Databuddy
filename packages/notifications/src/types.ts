export type NotificationChannel =
	| "slack"
	| "discord"
	| "email"
	| "webhook"
	| "teams"
	| "telegram"
	| "google-chat";

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

export interface DiscordEmbed {
	color?: number;
	description?: string;
	fields?: Array<{
		name: string;
		value: string;
		inline?: boolean;
	}>;
	footer?: { text: string; icon_url?: string };
	image?: { url: string };
	thumbnail?: { url: string };
	timestamp?: string;
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

export interface TeamsCard {
	body: TeamsCardElement[];
	type: "AdaptiveCard";
	version: string;
}

export interface TeamsCardElement {
	color?: string;
	facts?: Array<{ title: string; value: string }>;
	items?: TeamsCardElement[];
	size?: string;
	spacing?: string;
	text?: string;
	type: "TextBlock" | "FactSet" | "Container" | "ColumnSet";
	weight?: string;
	wrap?: boolean;
}

export interface TeamsPayload {
	attachments: Array<{
		contentType: "application/vnd.microsoft.card.adaptive";
		content: TeamsCard;
	}>;
	type: "message";
}

export interface TelegramPayload {
	chat_id: string;
	disable_web_page_preview?: boolean;
	parse_mode: "HTML" | "Markdown";
	text: string;
}

export interface GoogleChatCard {
	header?: {
		title: string;
		subtitle?: string;
		imageUrl?: string;
	};
	sections?: Array<{
		widgets: Array<{
			keyValue?: { topLabel: string; content: string };
			textParagraph?: { text: string };
		}>;
	}>;
}

export interface GoogleChatPayload {
	cards?: GoogleChatCard[];
	text?: string;
}
