import { DiscordProvider } from "./providers/discord";
import { EmailProvider } from "./providers/email";
import { GoogleChatProvider } from "./providers/google-chat";
import { SlackProvider } from "./providers/slack";
import { TeamsProvider } from "./providers/teams";
import { TelegramProvider } from "./providers/telegram";
import { WebhookProvider } from "./providers/webhook";
import type { NotificationPayload, NotificationResult } from "./types";

export function sendSlackWebhook(
	webhookUrl: string,
	payload: NotificationPayload,
	options?: {
		channel?: string;
		username?: string;
		iconEmoji?: string;
		iconUrl?: string;
		timeout?: number;
		retries?: number;
		retryDelay?: number;
	}
): Promise<NotificationResult> {
	const provider = new SlackProvider({
		webhookUrl,
		channel: options?.channel,
		username: options?.username,
		iconEmoji: options?.iconEmoji,
		iconUrl: options?.iconUrl,
		timeout: options?.timeout,
		retries: options?.retries,
		retryDelay: options?.retryDelay,
	});

	return provider.send(payload);
}

export function sendDiscordWebhook(
	webhookUrl: string,
	payload: NotificationPayload,
	options?: {
		username?: string;
		avatarUrl?: string;
		timeout?: number;
		retries?: number;
		retryDelay?: number;
	}
): Promise<NotificationResult> {
	const provider = new DiscordProvider({
		webhookUrl,
		username: options?.username,
		avatarUrl: options?.avatarUrl,
		timeout: options?.timeout,
		retries: options?.retries,
		retryDelay: options?.retryDelay,
	});

	return provider.send(payload);
}

export function sendEmail(
	sendEmailAction: (payload: {
		to: string | string[];
		subject: string;
		html?: string;
		text?: string;
		from?: string;
	}) => Promise<unknown>,
	payload: NotificationPayload & { to: string | string[] },
	options?: {
		from?: string;
		timeout?: number;
		retries?: number;
		retryDelay?: number;
	}
): Promise<NotificationResult> {
	const provider = new EmailProvider({
		sendEmailAction,
		from: options?.from,
		timeout: options?.timeout,
		retries: options?.retries,
		retryDelay: options?.retryDelay,
	});

	return provider.send({
		...payload,
		metadata: { ...payload.metadata, to: payload.to },
	});
}

export function sendWebhook(
	url: string,
	payload: NotificationPayload,
	options?: {
		method?: "GET" | "POST" | "PUT" | "PATCH";
		headers?: Record<string, string>;
		transformPayloadAction?: (payload: NotificationPayload) => unknown;
		timeout?: number;
		retries?: number;
		retryDelay?: number;
	}
): Promise<NotificationResult> {
	const provider = new WebhookProvider({
		url,
		method: options?.method,
		headers: options?.headers,
		transformPayloadAction: options?.transformPayloadAction,
		timeout: options?.timeout,
		retries: options?.retries,
		retryDelay: options?.retryDelay,
	});

	return provider.send(payload);
}

export function sendTeamsWebhook(
	webhookUrl: string,
	payload: NotificationPayload,
	options?: {
		timeout?: number;
		retries?: number;
		retryDelay?: number;
	}
): Promise<NotificationResult> {
	const provider = new TeamsProvider({
		webhookUrl,
		timeout: options?.timeout,
		retries: options?.retries,
		retryDelay: options?.retryDelay,
	});

	return provider.send(payload);
}

export function sendTelegramMessage(
	botToken: string,
	chatId: string,
	payload: NotificationPayload,
	options?: {
		timeout?: number;
		retries?: number;
		retryDelay?: number;
	}
): Promise<NotificationResult> {
	const provider = new TelegramProvider({
		botToken,
		chatId,
		timeout: options?.timeout,
		retries: options?.retries,
		retryDelay: options?.retryDelay,
	});

	return provider.send(payload);
}

export function sendGoogleChatWebhook(
	webhookUrl: string,
	payload: NotificationPayload,
	options?: {
		timeout?: number;
		retries?: number;
		retryDelay?: number;
	}
): Promise<NotificationResult> {
	const provider = new GoogleChatProvider({
		webhookUrl,
		timeout: options?.timeout,
		retries: options?.retries,
		retryDelay: options?.retryDelay,
	});

	return provider.send(payload);
}
