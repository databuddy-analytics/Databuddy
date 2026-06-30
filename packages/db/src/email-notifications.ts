import type {
	EmailAlertMode,
	OrganizationEmailNotificationSettings,
	TrackingAlertBlockReason,
} from "./drizzle/schema/auth";

export interface EmailNotificationSettings {
	anomalies: {
		customEventEmails: boolean;
		errorEmails: boolean;
		trafficEmails: boolean;
	};
	billing: {
		usageWarnings: boolean;
	};
	trackingHealth: {
		cooldownMinutes: number;
		ignoredOrigins: string[];
		ignoredReasons: TrackingAlertBlockReason[];
		mode: EmailAlertMode;
	};
	uptime: {
		downEmails: boolean;
		recoveryEmails: boolean;
	};
}

export const DEFAULT_EMAIL_NOTIFICATION_SETTINGS = {
	anomalies: {
		customEventEmails: false,
		errorEmails: true,
		trafficEmails: false,
	},
	billing: {
		usageWarnings: true,
	},
	trackingHealth: {
		cooldownMinutes: 360,
		ignoredOrigins: [],
		ignoredReasons: [],
		mode: "critical_only",
	},
	uptime: {
		downEmails: true,
		recoveryEmails: true,
	},
} satisfies EmailNotificationSettings;

function uniqueStrings(values: string[] | undefined): string[] {
	return [...new Set(values ?? [])];
}

function uniqueReasons(
	values: TrackingAlertBlockReason[] | undefined
): TrackingAlertBlockReason[] {
	return [...new Set(values ?? [])];
}

function clampCooldown(minutes: number | undefined): number {
	if (!Number.isFinite(minutes)) {
		return DEFAULT_EMAIL_NOTIFICATION_SETTINGS.trackingHealth.cooldownMinutes;
	}
	return Math.min(Math.max(Math.round(minutes ?? 360), 15), 7 * 24 * 60);
}

export function normalizeEmailNotificationSettings(
	settings: OrganizationEmailNotificationSettings | null | undefined
): EmailNotificationSettings {
	const current = settings ?? {};
	return {
		anomalies: {
			...DEFAULT_EMAIL_NOTIFICATION_SETTINGS.anomalies,
			...current.anomalies,
		},
		billing: {
			...DEFAULT_EMAIL_NOTIFICATION_SETTINGS.billing,
			...current.billing,
		},
		trackingHealth: {
			...DEFAULT_EMAIL_NOTIFICATION_SETTINGS.trackingHealth,
			...current.trackingHealth,
			cooldownMinutes: clampCooldown(current.trackingHealth?.cooldownMinutes),
			ignoredOrigins: uniqueStrings(current.trackingHealth?.ignoredOrigins),
			ignoredReasons: uniqueReasons(current.trackingHealth?.ignoredReasons),
		},
		uptime: {
			...DEFAULT_EMAIL_NOTIFICATION_SETTINGS.uptime,
			...current.uptime,
		},
	};
}
