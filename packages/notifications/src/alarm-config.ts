import type { NotificationChannel } from "./types";

interface AlarmDestination {
	config: unknown;
	identifier: string;
	type: string;
}

export function buildAlarmNotificationConfig(destinations: AlarmDestination[]) {
	const clientConfig: Record<string, Record<string, unknown>> = {};
	const channels: NotificationChannel[] = [];

	for (const dest of destinations) {
		const cfg = (dest.config ?? {}) as Record<string, unknown>;

		if (dest.type === "slack") {
			clientConfig.slack = { webhookUrl: dest.identifier };
			channels.push("slack");
		} else if (dest.type === "webhook") {
			clientConfig.webhook = {
				url: dest.identifier,
				headers: cfg.headers as Record<string, string> | undefined,
			};
			channels.push("webhook");
		} else if (dest.type === "email") {
			clientConfig.email = {
				defaultTo: dest.identifier,
				from: (cfg.from as string) || "Databuddy <alerts@databuddy.cc>",
				sendEmailAction: async (payload: {
					to: string | string[];
					subject: string;
					html?: string;
					text?: string;
					from?: string;
				}) => {
					const { Resend } = await import("resend");
					const apiKey = process.env.RESEND_API_KEY;
					if (!apiKey) return;
					const resend = new Resend(apiKey);
					await resend.emails.send({
						from:
							payload.from || "Databuddy <alerts@databuddy.cc>",
						to: Array.isArray(payload.to)
							? payload.to
							: [payload.to],
						subject: payload.subject,
						html: payload.html || payload.text || "",
					});
				},
			};
			channels.push("email");
		}
	}

	return { clientConfig, channels };
}
