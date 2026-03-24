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
	title: string;
	message: string;
	priority?: NotificationPriority;
	metadata?: Record<string, unknown>;
}

export interface NotificationResult {
	success: boolean;
	channel: NotificationChannel;
	error?: string;
	response?: unknown;
}

export interface NotificationOptions {
	channels?: NotificationChannel[];
	timeout?: number;
	retries?: number;
	retryDelay?: number;
}

export interface SlackTextElement {
	type: "plain_text" | "mrkdwn";
	text: string;
}

export interface SlackBlock {
	type: "header" | "section" | "context" | "divider" | "actions";
	text?: SlackTextElement;
	fields?: SlackTextElement[];
	elements?: SlackTextElement[];
}

export interface SlackPayload {
	text?: string;
	blocks?: SlackBlock[];
	channel?: string;
	username?: string;
	icon_emoji?: string;
	icon_url?: string;
}

export interface DiscordEmbed {
	title?: string;
	description?: string;
	color?: number;
	fields?: Array<{
		name: string;
		value: string;
		inline?: boolean;
	}>;
	timestamp?: string;
	footer?: { text: string; icon_url?: string };
	thumbnail?: { url: string };
	image?: { url: string };
}

export interface DiscordPayload {
	content?: string;
	embeds?: DiscordEmbed[];
	username?: string;
	avatar_url?: string;
}

export interface EmailPayload {
	to: string | string[];
	subject: string;
	html?: string;
	text?: string;
	from?: string;
}

export interface WebhookPayload {
	url: string;
	method?: "GET" | "POST" | "PUT" | "PATCH";
	headers?: Record<string, string>;
	body?: unknown;
	timeout?: number;
}

export interface TeamsCard {
	type: "AdaptiveCard";
	version: string;
	body: TeamsCardElement[];
}

export interface TeamsCardElement {
	type: "TextBlock" | "FactSet" | "Container" | "ColumnSet";
	text?: string;
	size?: string;
	weight?: string;
	color?: string;
	wrap?: boolean;
	spacing?: string;
	facts?: Array<{ title: string; value: string }>;
	items?: TeamsCardElement[];
}

export interface TeamsPayload {
	type: "message";
	attachments: Array<{
		contentType: "application/vnd.microsoft.card.adaptive";
		content: TeamsCard;
	}>;
}

export interface TelegramPayload {
	chat_id: string;
	text: string;
	parse_mode: "HTML" | "Markdown";
	disable_web_page_preview?: boolean;
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
	text?: string;
	cards?: GoogleChatCard[];
}
