const CHANNEL_LABELS: Record<string, string> = {
	email: "Email",
	slack: "Slack",
	webhook: "Webhook",
};

interface DeliveryResult {
	channel: string;
	success: boolean;
}

export interface DeliverySummary {
	description?: string;
	kind: "error" | "success" | "warning";
	title: string;
}

function formatChannels(channels: string[]): string {
	return [...new Set(channels)]
		.map((channel) => CHANNEL_LABELS[channel] ?? channel)
		.join(", ");
}

export function summarizeTestDelivery(
	results: DeliveryResult[]
): DeliverySummary {
	const delivered = results.filter((item) => item.success);
	const failed = results.filter((item) => !item.success);

	if (delivered.length === 0) {
		const channels = formatChannels(failed.map((item) => item.channel));
		return {
			kind: "error",
			title: channels
				? `Test failed for ${channels}`
				: "No test notification was sent",
			description:
				"Check the alert destinations and their credentials, then try again.",
		};
	}

	const deliveredChannels = formatChannels(
		delivered.map((item) => item.channel)
	);
	if (failed.length > 0) {
		const failedChannels = formatChannels(failed.map((item) => item.channel));
		return {
			kind: "warning",
			title: `Test delivered via ${deliveredChannels}`,
			description: `Delivery failed for ${failedChannels}. Check those destinations and try again.`,
		};
	}

	return {
		kind: "success",
		title: `Test delivered via ${deliveredChannels}`,
	};
}
