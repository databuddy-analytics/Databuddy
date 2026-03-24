import type {
	EmailPayload,
	NotificationPayload,
	NotificationResult,
} from "../types";
import { BaseProvider } from "./base";

export interface EmailProviderConfig {
	sendEmailAction: (payload: EmailPayload) => Promise<unknown>;
	defaultTo?: string | string[];
	from?: string;
	timeout?: number;
	retries?: number;
	retryDelay?: number;
}

function escapeHtml(str: string): string {
	return str
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

export class EmailProvider extends BaseProvider {
	private readonly sendEmailAction: (payload: EmailPayload) => Promise<unknown>;
	private readonly defaultTo?: string | string[];
	private readonly from?: string;

	constructor(config: EmailProviderConfig) {
		super({
			timeout: config.timeout,
			retries: config.retries,
			retryDelay: config.retryDelay,
		});
		this.sendEmailAction = config.sendEmailAction;
		this.defaultTo = config.defaultTo;
		this.from = config.from;
	}

	async send(payload: NotificationPayload): Promise<NotificationResult> {
		if (!this.sendEmailAction) {
			return {
				success: false,
				channel: "email",
				error: "Email send function not configured",
			};
		}

		try {
			const emailPayload = this.buildPayload(payload);
			await this.withRetry(async () => this.sendEmailAction(emailPayload));

			return { success: true, channel: "email" };
		} catch (error) {
			return {
				success: false,
				channel: "email",
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	private buildPayload(payload: NotificationPayload): EmailPayload {
		const to =
			(payload.metadata?.to as string | string[] | undefined) ?? this.defaultTo;

		if (!to) {
			throw new Error(
				"Email recipient required: set 'defaultTo' in config or 'metadata.to' in payload"
			);
		}

		const metadataEntries = payload.metadata
			? Object.entries(payload.metadata).filter(([key]) => key !== "to")
			: [];

		const metadataText =
			metadataEntries.length > 0
				? `\n\n${metadataEntries.map(([key, value]) => `${key}: ${String(value)}`).join("\n")}`
				: "";

		const text = `${payload.message}${metadataText}`;

		const metadataHtml =
			metadataEntries.length > 0
				? `<table style="margin-top:16px;border-collapse:collapse">${metadataEntries
						.map(
							([key, value]) =>
								`<tr><td style="padding:4px 12px 4px 0;font-weight:600">${escapeHtml(key)}</td><td style="padding:4px 0">${escapeHtml(String(value))}</td></tr>`
						)
						.join("")}</table>`
				: "";

		const html = `<h1>${escapeHtml(payload.title)}</h1><p>${escapeHtml(payload.message).replaceAll("\n", "<br>")}</p>${metadataHtml}`;

		return {
			to,
			subject: payload.title,
			text,
			html,
			...(this.from && { from: this.from }),
		};
	}
}
