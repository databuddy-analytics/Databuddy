import type {
	EmailPayload,
	NotificationPayload,
	NotificationResult,
} from "../types";
import { BaseProvider } from "./base";

export interface EmailProviderConfig {
	sendEmail: (payload: EmailPayload) => Promise<unknown>;
	from?: string;
	timeout?: number;
	retries?: number;
	retryDelay?: number;
}

export class EmailProvider extends BaseProvider {
	private readonly sendEmail: (payload: EmailPayload) => Promise<unknown>;
	private readonly from?: string;

	constructor(config: EmailProviderConfig) {
		super({
			timeout: config.timeout,
			retries: config.retries,
			retryDelay: config.retryDelay,
		});
		this.sendEmail = config.sendEmail;
		this.from = config.from;
	}

	async send(payload: NotificationPayload): Promise<NotificationResult> {
		if (!this.sendEmail) {
			return {
				success: false,
				channel: "email",
				error: "Email send function not configured",
			};
		}

		try {
			const emailPayload = this.buildEmailPayload(payload);
			await this.withRetry(async () => {
				return await this.sendEmail(emailPayload);
			});

			return {
				success: true,
				channel: "email",
			};
		} catch (error) {
			return {
				success: false,
				channel: "email",
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	private buildEmailPayload(payload: NotificationPayload): EmailPayload {
		const metadataText =
			payload.metadata && Object.keys(payload.metadata).length > 0
				? `\n\nAdditional Information:\n${Object.entries(payload.metadata)
						.map(([key, value]) => `${key}: ${String(value)}`)
						.join("\n")}`
				: "";

		const text = `${payload.message}${metadataText}`;
		const html = `<h1>${payload.title}</h1><p>${payload.message.replace(/\n/g, "<br>")}</p>${
			metadataText ? `<pre>${metadataText.replace(/\n/g, "<br>")}</pre>` : ""
		}`;

		const to = payload.metadata?.to as string | string[] | undefined;
		if (!to) {
			throw new Error(
				"Email 'to' address must be provided in payload.metadata.to"
			);
		}

		const emailPayload: EmailPayload = {
			to,
			subject: payload.title,
			text,
			html,
		};

		if (this.from) {
			emailPayload.from = this.from;
		}

		return emailPayload;
	}
}
