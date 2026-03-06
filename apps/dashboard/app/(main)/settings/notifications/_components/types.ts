export interface Alarm {
	id: string;
	name: string;
	description: string | null;
	enabled: boolean;
	notificationChannels: unknown;
	slackWebhookUrl: string | null;
	discordWebhookUrl: string | null;
	emailAddresses: unknown;
	webhookUrl: string | null;
	webhookHeaders: unknown;
	triggerType: string;
	triggerConditions: unknown;
	websiteId: string | null;
	organizationId: string | null;
	userId: string | null;
	createdBy: string;
	createdAt: Date | string;
	updatedAt: Date | string;
	deletedAt: Date | string | null;
}
