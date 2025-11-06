export type BaseNotification = {
	id: string;
	title: string;
	time: string;
	read: boolean;
	type: string;
};

export type AuditNotification = {
	id: string;
	title: string;
	description: string;
	time: string;
	read: boolean;
	type: "audit";
	details: {
		resourceType: string;
		resourceId: string;
		action: "CREATE" | "UPDATE" | "DELETE" | "SOFT_DELETE";
		changes?: {
			field: string;
			oldValue?: any;
			newValue?: any;
		}[];
		website: string;
		environment: "production" | "staging" | "development";
	};
};

export type AnalyticsNotification = BaseNotification & {
	type: "analytics";
	metric: string;
	value: number;
	previousValue?: number;
	percentageChange?: number;
	trend: "up" | "down" | "neutral";
	website: string;
	environment: "production" | "staging" | "development";
};

export type BillingNotification = BaseNotification & {
	type: "billing";
	amount?: number;
	planName?: string;
	usageMetric?: string;
	usageValue?: number;
	usageLimit?: number;
	website: string;
	environment: "production" | "staging" | "development";
};

export type Notification =
	| AuditNotification
	| AnalyticsNotification
	| BillingNotification;

// Type guard functions
export function isAuditNotification(
	notification: Notification
): notification is AuditNotification {
	return notification.type === "audit";
}

export function isAnalyticsNotification(
	notification: Notification
): notification is AnalyticsNotification {
	return notification.type === "analytics";
}

export function isBillingNotification(
	notification: Notification
): notification is BillingNotification {
	return notification.type === "billing";
}
