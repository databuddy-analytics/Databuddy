export interface Alarm {
	id: string;
	userId: string | null;
	organizationId: string | null;
	websiteId: string | null;
	name: string;
	description: string | null;
	enabled: boolean;
	notificationChannels: string[];
	slackWebhookUrl: string | null;
	discordWebhookUrl: string | null;
	emailAddresses: string[] | null;
	webhookUrl: string | null;
	webhookHeaders: Record<string, string> | null;
	triggerType: string;
	triggerConditions: Record<string, unknown>;
	createdAt: Date;
	updatedAt: Date;
}

export type NotificationChannel = "slack" | "discord" | "email" | "webhook";
export type TriggerType =
	| "uptime"
	| "traffic_spike"
	| "error_rate"
	| "goal"
	| "custom";
