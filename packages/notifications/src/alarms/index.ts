import type { alarms, alarmLogs } from "@databuddy/db";

export interface AlarmNotificationContext {
	alarm: typeof alarms.$inferSelect;
	triggerReason: string;
	triggerData?: Record<string, any>;
	timestamp: Date;
}

export interface NotificationResult {
	channel: string;
	success: boolean;
	error?: string;
}

/**
 * Send alarm notifications to all configured channels
 */
export async function sendAlarmNotifications(
	context: AlarmNotificationContext
): Promise<NotificationResult[]> {
	const results: NotificationResult[] = [];
	const { alarm, triggerReason, triggerData, timestamp } = context;

	// Send to each enabled channel
	for (const channel of alarm.notificationChannels) {
		try {
			switch (channel) {
				case "slack":
					if (alarm.slackWebhookUrl) {
						await sendSlackNotification(alarm, triggerReason, triggerData, timestamp);
						results.push({ channel: "slack", success: true });
					}
					break;

				case "discord":
					if (alarm.discordWebhookUrl) {
						await sendDiscordNotification(alarm, triggerReason, triggerData, timestamp);
						results.push({ channel: "discord", success: true });
					}
					break;

				case "email":
					if (alarm.emailAddresses && alarm.emailAddresses.length > 0) {
						await sendEmailNotification(alarm, triggerReason, triggerData, timestamp);
						results.push({ channel: "email", success: true });
					}
					break;

				case "webhook":
					if (alarm.webhookUrl) {
						await sendWebhookNotification(alarm, triggerReason, triggerData, timestamp);
						results.push({ channel: "webhook", success: true });
					}
					break;

				case "teams":
					if (alarm.teamsWebhookUrl) {
						await sendTeamsNotification(alarm, triggerReason, triggerData, timestamp);
						results.push({ channel: "teams", success: true });
					}
					break;

				case "telegram":
					if (alarm.telegramBotToken && alarm.telegramChatId) {
						await sendTelegramNotification(alarm, triggerReason, triggerData, timestamp);
						results.push({ channel: "telegram", success: true });
					}
					break;
			}
		} catch (error) {
			results.push({
				channel,
				success: false,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return results;
}

/**
 * Send Slack notification
 */
async function sendSlackNotification(
	alarm: typeof alarms.$inferSelect,
	triggerReason: string,
	triggerData: Record<string, any> | undefined,
	timestamp: Date
): Promise<void> {
	if (!alarm.slackWebhookUrl) {
		throw new Error("Slack webhook URL not configured");
	}

	const payload = {
		text: `🚨 ${alarm.name}`,
		blocks: [
			{
				type: "header",
				text: {
					type: "plain_text",
					text: `🚨 ${alarm.name}`,
				},
			},
			{
				type: "section",
				fields: [
					{
						type: "mrkdwn",
						text: `*Alarm:*\n${alarm.name}`,
					},
					{
						type: "mrkdwn",
						text: `*Type:*\n${alarm.type}`,
					},
					{
						type: "mrkdwn",
						text: `*Time:*\n${timestamp.toISOString()}`,
					},
					{
						type: "mrkdwn",
						text: `*Reason:*\n${triggerReason}`,
					},
				],
			},
		],
	};

	// Add trigger data if available
	if (triggerData && Object.keys(triggerData).length > 0) {
		payload.blocks.push({
			type: "section",
			text: {
				type: "mrkdwn",
				text: `*Details:*\n\`\`\`${JSON.stringify(triggerData, null, 2)}\`\`\``,
			},
		} as any);
	}

	const response = await fetch(alarm.slackWebhookUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		throw new Error(`Slack notification failed: ${response.statusText}`);
	}
}

/**
 * Send Discord notification
 */
async function sendDiscordNotification(
	alarm: typeof alarms.$inferSelect,
	triggerReason: string,
	triggerData: Record<string, any> | undefined,
	timestamp: Date
): Promise<void> {
	if (!alarm.discordWebhookUrl) {
		throw new Error("Discord webhook URL not configured");
	}

	const fields = [
		{
			name: "Alarm",
			value: alarm.name,
			inline: true,
		},
		{
			name: "Type",
			value: alarm.type,
			inline: true,
		},
		{
			name: "Time",
			value: timestamp.toISOString(),
			inline: false,
		},
		{
			name: "Reason",
			value: triggerReason,
			inline: false,
		},
	];

	// Add trigger data if available
	if (triggerData && Object.keys(triggerData).length > 0) {
		fields.push({
			name: "Details",
			value: `\`\`\`json\n${JSON.stringify(triggerData, null, 2)}\n\`\`\``,
			inline: false,
		});
	}

	const payload = {
		embeds: [
			{
				title: `🚨 ${alarm.name}`,
				color: 15158332, // Red color
				fields,
				timestamp: timestamp.toISOString(),
			},
		],
	};

	const response = await fetch(alarm.discordWebhookUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		throw new Error(`Discord notification failed: ${response.statusText}`);
	}
}

/**
 * Send Email notification
 */
async function sendEmailNotification(
	alarm: typeof alarms.$inferSelect,
	triggerReason: string,
	triggerData: Record<string, any> | undefined,
	timestamp: Date
): Promise<void> {
	if (!alarm.emailAddresses || alarm.emailAddresses.length === 0) {
		throw new Error("Email addresses not configured");
	}

	// TODO: Integrate with existing email package
	// For now, this is a placeholder
	console.log("Sending email notification to:", alarm.emailAddresses);
	console.log("Subject:", `🚨 ${alarm.name}`);
	console.log("Body:", {
		alarm: alarm.name,
		type: alarm.type,
		time: timestamp.toISOString(),
		reason: triggerReason,
		data: triggerData,
	});

	// Actual implementation would use the email package:
	// await sendEmail({
	//   to: alarm.emailAddresses,
	//   subject: `🚨 ${alarm.name}`,
	//   html: generateEmailTemplate(alarm, triggerReason, triggerData, timestamp),
	// });
}

/**
 * Send custom webhook notification
 */
async function sendWebhookNotification(
	alarm: typeof alarms.$inferSelect,
	triggerReason: string,
	triggerData: Record<string, any> | undefined,
	timestamp: Date
): Promise<void> {
	if (!alarm.webhookUrl) {
		throw new Error("Webhook URL not configured");
	}

	const payload = {
		alarm: {
			id: alarm.id,
			name: alarm.name,
			type: alarm.type,
		},
		trigger: {
			reason: triggerReason,
			data: triggerData,
			timestamp: timestamp.toISOString(),
		},
	};

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"User-Agent": "Databuddy-Alarms/1.0",
	};

	// Add custom headers if configured
	if (alarm.webhookHeaders) {
		Object.assign(headers, alarm.webhookHeaders);
	}

	const response = await fetch(alarm.webhookUrl, {
		method: alarm.webhookMethod || "POST",
		headers,
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		throw new Error(`Webhook notification failed: ${response.statusText}`);
	}
}

/**
 * Send Microsoft Teams notification
 */
async function sendTeamsNotification(
	alarm: typeof alarms.$inferSelect,
	triggerReason: string,
	triggerData: Record<string, any> | undefined,
	timestamp: Date
): Promise<void> {
	if (!alarm.teamsWebhookUrl) {
		throw new Error("Teams webhook URL not configured");
	}

	const facts = [
		{
			name: "Alarm",
			value: alarm.name,
		},
		{
			name: "Type",
			value: alarm.type,
		},
		{
			name: "Time",
			value: timestamp.toISOString(),
		},
		{
			name: "Reason",
			value: triggerReason,
		},
	];

	// Add trigger data if available
	if (triggerData && Object.keys(triggerData).length > 0) {
		facts.push({
			name: "Details",
			value: JSON.stringify(triggerData, null, 2),
		});
	}

	const payload = {
		"@type": "MessageCard",
		"@context": "https://schema.org/extensions",
		summary: `🚨 ${alarm.name}`,
		themeColor: "FF0000",
		title: `🚨 ${alarm.name}`,
		sections: [
			{
				facts,
			},
		],
	};

	const response = await fetch(alarm.teamsWebhookUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		throw new Error(`Teams notification failed: ${response.statusText}`);
	}
}

/**
 * Send Telegram notification
 */
async function sendTelegramNotification(
	alarm: typeof alarms.$inferSelect,
	triggerReason: string,
	triggerData: Record<string, any> | undefined,
	timestamp: Date
): Promise<void> {
	if (!alarm.telegramBotToken || !alarm.telegramChatId) {
		throw new Error("Telegram bot token or chat ID not configured");
	}

	let message = `🚨 *${alarm.name}*\n\n`;
	message += `*Type:* ${alarm.type}\n`;
	message += `*Time:* ${timestamp.toISOString()}\n`;
	message += `*Reason:* ${triggerReason}\n`;

	if (triggerData && Object.keys(triggerData).length > 0) {
		message += `\n*Details:*\n\`\`\`json\n${JSON.stringify(triggerData, null, 2)}\n\`\`\``;
	}

	const payload = {
		chat_id: alarm.telegramChatId,
		text: message,
		parse_mode: "Markdown",
	};

	const response = await fetch(
		`https://api.telegram.org/bot${alarm.telegramBotToken}/sendMessage`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		}
	);

	if (!response.ok) {
		throw new Error(`Telegram notification failed: ${response.statusText}`);
	}
}

/**
 * Retry notification with exponential backoff
 */
export async function sendNotificationWithRetry(
	context: AlarmNotificationContext,
	maxRetries = 3
): Promise<NotificationResult[]> {
	let lastError: Error | null = null;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			return await sendAlarmNotifications(context);
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			// Wait before retrying (exponential backoff)
			if (attempt < maxRetries - 1) {
				const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
	}

	// All retries failed
	throw lastError || new Error("All notification attempts failed");
}
