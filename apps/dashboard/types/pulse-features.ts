import { PLAN_IDS, type PlanId } from "./features.js";

/**
 * Pulse plan tiers - ordered from lowest to highest
 */
export const PULSE_PLAN_IDS = {
	FREE: "pulse_free",
	PRO: "pulse_pro",
	BUSINESS: "pulse_business",
} as const;

export type PulsePlanId = (typeof PULSE_PLAN_IDS)[keyof typeof PULSE_PLAN_IDS];

/** Plan tier hierarchy (index = tier level, higher = more features) */
export const PULSE_PLAN_HIERARCHY: PulsePlanId[] = [
	PULSE_PLAN_IDS.FREE,
	PULSE_PLAN_IDS.PRO,
	PULSE_PLAN_IDS.BUSINESS,
];

/** Gated features - locked behind specific plans */
export const PULSE_GATED_FEATURES = {
	// Basic checks
	BASIC_UPTIME_CHECKS: "basic_uptime_checks",
	EMAIL_ALERTS: "email_alerts",
	WEBHOOKS: "webhooks",
	PUBLIC_STATUS_PAGE: "public_status_page",
	DASHBOARD_INTEGRATION: "dashboard_integration",
	// Advanced checks
	SSL_CERTIFICATE_CHECKS: "ssl_certificate_checks",
	KEYWORD_CONTENT_MATCH: "keyword_content_match",
	MULTI_LOCATION_CHECKS: "multi_location_checks",
	ONE_MINUTE_FREQUENCY: "one_minute_frequency",
	// Enterprise features
	THIRTY_SECOND_FREQUENCY: "thirty_second_frequency",
	SYNTHETIC_TRANSACTIONS: "synthetic_transactions",
	ALERT_ESCALATION: "alert_escalation",
	SMS_VOICE_ALERTS: "sms_voice_alerts",
	HEARTBEAT_MONITORING: "heartbeat_monitoring",
	N_OUT_OF_M_FALSE_POSITIVE_REDUCTION: "n_out_of_m_false_positive_reduction",
} as const;

export type PulseGatedFeatureId =
	(typeof PULSE_GATED_FEATURES)[keyof typeof PULSE_GATED_FEATURES];

/**
 * Plan feature matrix - edit this to control which features are enabled per plan
 */
export const PULSE_PLAN_FEATURES: Record<
	PulsePlanId,
	Record<PulseGatedFeatureId, boolean>
> = {
	[PULSE_PLAN_IDS.FREE]: {
		[PULSE_GATED_FEATURES.BASIC_UPTIME_CHECKS]: true,
		[PULSE_GATED_FEATURES.EMAIL_ALERTS]: true,
		[PULSE_GATED_FEATURES.WEBHOOKS]: true,
		[PULSE_GATED_FEATURES.PUBLIC_STATUS_PAGE]: true,
		[PULSE_GATED_FEATURES.DASHBOARD_INTEGRATION]: true,
		[PULSE_GATED_FEATURES.SSL_CERTIFICATE_CHECKS]: false,
		[PULSE_GATED_FEATURES.KEYWORD_CONTENT_MATCH]: false,
		[PULSE_GATED_FEATURES.MULTI_LOCATION_CHECKS]: false,
		[PULSE_GATED_FEATURES.ONE_MINUTE_FREQUENCY]: false,
		[PULSE_GATED_FEATURES.THIRTY_SECOND_FREQUENCY]: false,
		[PULSE_GATED_FEATURES.SYNTHETIC_TRANSACTIONS]: false,
		[PULSE_GATED_FEATURES.ALERT_ESCALATION]: false,
		[PULSE_GATED_FEATURES.SMS_VOICE_ALERTS]: false,
		[PULSE_GATED_FEATURES.HEARTBEAT_MONITORING]: false,
		[PULSE_GATED_FEATURES.N_OUT_OF_M_FALSE_POSITIVE_REDUCTION]: false,
	},
	[PULSE_PLAN_IDS.PRO]: {
		[PULSE_GATED_FEATURES.BASIC_UPTIME_CHECKS]: true,
		[PULSE_GATED_FEATURES.EMAIL_ALERTS]: true,
		[PULSE_GATED_FEATURES.WEBHOOKS]: true,
		[PULSE_GATED_FEATURES.PUBLIC_STATUS_PAGE]: true,
		[PULSE_GATED_FEATURES.DASHBOARD_INTEGRATION]: true,
		[PULSE_GATED_FEATURES.SSL_CERTIFICATE_CHECKS]: true,
		[PULSE_GATED_FEATURES.KEYWORD_CONTENT_MATCH]: true,
		[PULSE_GATED_FEATURES.MULTI_LOCATION_CHECKS]: true,
		[PULSE_GATED_FEATURES.ONE_MINUTE_FREQUENCY]: true,
		[PULSE_GATED_FEATURES.THIRTY_SECOND_FREQUENCY]: false,
		[PULSE_GATED_FEATURES.SYNTHETIC_TRANSACTIONS]: false,
		[PULSE_GATED_FEATURES.ALERT_ESCALATION]: false,
		[PULSE_GATED_FEATURES.SMS_VOICE_ALERTS]: false,
		[PULSE_GATED_FEATURES.HEARTBEAT_MONITORING]: false,
		[PULSE_GATED_FEATURES.N_OUT_OF_M_FALSE_POSITIVE_REDUCTION]: false,
	},
	[PULSE_PLAN_IDS.BUSINESS]: {
		[PULSE_GATED_FEATURES.BASIC_UPTIME_CHECKS]: true,
		[PULSE_GATED_FEATURES.EMAIL_ALERTS]: true,
		[PULSE_GATED_FEATURES.WEBHOOKS]: true,
		[PULSE_GATED_FEATURES.PUBLIC_STATUS_PAGE]: true,
		[PULSE_GATED_FEATURES.DASHBOARD_INTEGRATION]: true,
		[PULSE_GATED_FEATURES.SSL_CERTIFICATE_CHECKS]: true,
		[PULSE_GATED_FEATURES.KEYWORD_CONTENT_MATCH]: true,
		[PULSE_GATED_FEATURES.MULTI_LOCATION_CHECKS]: true,
		[PULSE_GATED_FEATURES.ONE_MINUTE_FREQUENCY]: true,
		[PULSE_GATED_FEATURES.THIRTY_SECOND_FREQUENCY]: true,
		[PULSE_GATED_FEATURES.SYNTHETIC_TRANSACTIONS]: true,
		[PULSE_GATED_FEATURES.ALERT_ESCALATION]: true,
		[PULSE_GATED_FEATURES.SMS_VOICE_ALERTS]: true,
		[PULSE_GATED_FEATURES.HEARTBEAT_MONITORING]: true,
		[PULSE_GATED_FEATURES.N_OUT_OF_M_FALSE_POSITIVE_REDUCTION]: true,
	},
};

/** Plan limits and configuration */
export type PulsePlanLimits = {
	/** Number of monitors included */
	includedMonitors: number;
	/** Check frequency in minutes (or seconds for Business) */
	checkFrequencyMinutes?: number;
	checkFrequencySeconds?: number;
	/** Data retention period */
	dataRetentionDays?: number;
	dataRetentionMonths?: number;
	/** Number of check locations for multi-location checks */
	checkLocations?: number;
};

/** Plan metadata including pricing and target audience */
export type PulsePlanMetadata = {
	name: string;
	priceUsdMonthly: number;
	targetUser: string;
	limits: PulsePlanLimits;
};

/**
 * Plan metadata - pricing, limits, and target audience
 */
export const PULSE_PLAN_METADATA: Record<PulsePlanId, PulsePlanMetadata> = {
	[PULSE_PLAN_IDS.FREE]: {
		name: "Pulse Free",
		priceUsdMonthly: 0,
		targetUser: "Hobbyists, Personal Projects",
		limits: {
			includedMonitors: 5,
			checkFrequencyMinutes: 5,
			dataRetentionDays: 30,
		},
	},
	[PULSE_PLAN_IDS.PRO]: {
		name: "Pulse Pro",
		priceUsdMonthly: 15,
		targetUser: "SMBs, Small Agencies",
		limits: {
			includedMonitors: 50,
			checkFrequencyMinutes: 1,
			dataRetentionMonths: 12,
			checkLocations: 3,
		},
	},
	[PULSE_PLAN_IDS.BUSINESS]: {
		name: "Pulse Business",
		priceUsdMonthly: 49,
		targetUser: "Growing SaaS, Dev Teams",
		limits: {
			includedMonitors: 200,
			checkFrequencySeconds: 30,
			dataRetentionMonths: 24,
		},
	},
};

type PulseFeatureMeta = {
	name: string;
	description: string;
	upgradeMessage: string;
	minPlan?: PulsePlanId;
};

export const PULSE_FEATURE_METADATA: Record<
	PulseGatedFeatureId,
	PulseFeatureMeta
> = {
	[PULSE_GATED_FEATURES.BASIC_UPTIME_CHECKS]: {
		name: "Basic Uptime Checks",
		description: "HTTP/S, Ping, and Port monitoring",
		upgradeMessage: "Basic uptime checks are available on all plans",
	},
	[PULSE_GATED_FEATURES.EMAIL_ALERTS]: {
		name: "Email Alerts",
		description: "Receive email notifications when monitors go down",
		upgradeMessage: "Email alerts are available on all plans",
	},
	[PULSE_GATED_FEATURES.WEBHOOKS]: {
		name: "Webhooks",
		description: "Integrate with external services via webhooks",
		upgradeMessage: "Webhooks are available on all plans",
	},
	[PULSE_GATED_FEATURES.PUBLIC_STATUS_PAGE]: {
		name: "Public Status Page",
		description: "Share your service status publicly",
		upgradeMessage: "Public status pages are available on all plans",
	},
	[PULSE_GATED_FEATURES.DASHBOARD_INTEGRATION]: {
		name: "Dashboard Integration",
		description: "View monitor status in your dashboard",
		upgradeMessage: "Dashboard integration is available on all plans",
	},
	[PULSE_GATED_FEATURES.SSL_CERTIFICATE_CHECKS]: {
		name: "SSL Certificate Expiry Checks",
		description: "Monitor SSL certificate expiration dates",
		upgradeMessage: "Upgrade to Pro for SSL certificate checks",
		minPlan: PULSE_PLAN_IDS.PRO,
	},
	[PULSE_GATED_FEATURES.KEYWORD_CONTENT_MATCH]: {
		name: "Keyword/Content Match",
		description: "Verify specific content appears on monitored pages",
		upgradeMessage: "Upgrade to Pro for keyword/content matching",
		minPlan: PULSE_PLAN_IDS.PRO,
	},
	[PULSE_GATED_FEATURES.MULTI_LOCATION_CHECKS]: {
		name: "Multi-Location Checks",
		description: "Monitor from multiple geographic locations",
		upgradeMessage: "Upgrade to Pro for multi-location checks",
		minPlan: PULSE_PLAN_IDS.PRO,
	},
	[PULSE_GATED_FEATURES.ONE_MINUTE_FREQUENCY]: {
		name: "1-Minute Check Frequency",
		description: "Check your monitors every minute",
		upgradeMessage: "Upgrade to Pro for 1-minute check frequency",
		minPlan: PULSE_PLAN_IDS.PRO,
	},
	[PULSE_GATED_FEATURES.THIRTY_SECOND_FREQUENCY]: {
		name: "30-Second Check Frequency",
		description: "Check your monitors every 30 seconds",
		upgradeMessage: "Upgrade to Business for 30-second check frequency",
		minPlan: PULSE_PLAN_IDS.BUSINESS,
	},
	[PULSE_GATED_FEATURES.SYNTHETIC_TRANSACTIONS]: {
		name: "Synthetic Transactions",
		description: "Multi-step checks that simulate user workflows",
		upgradeMessage: "Upgrade to Business for synthetic transactions",
		minPlan: PULSE_PLAN_IDS.BUSINESS,
	},
	[PULSE_GATED_FEATURES.ALERT_ESCALATION]: {
		name: "Alert Escalation Policies",
		description: "Configure alert escalation rules",
		upgradeMessage: "Upgrade to Business for alert escalation",
		minPlan: PULSE_PLAN_IDS.BUSINESS,
	},
	[PULSE_GATED_FEATURES.SMS_VOICE_ALERTS]: {
		name: "SMS/Voice Call Alerts",
		description: "Receive alerts via SMS or voice calls via Twilio",
		upgradeMessage: "Upgrade to Business for SMS/voice alerts",
		minPlan: PULSE_PLAN_IDS.BUSINESS,
	},
	[PULSE_GATED_FEATURES.HEARTBEAT_MONITORING]: {
		name: "Heartbeat Monitoring",
		description: "Monitor applications that send heartbeat signals",
		upgradeMessage: "Upgrade to Business for heartbeat monitoring",
		minPlan: PULSE_PLAN_IDS.BUSINESS,
	},
	[PULSE_GATED_FEATURES.N_OUT_OF_M_FALSE_POSITIVE_REDUCTION]: {
		name: "N-out-of-M False Positive Reduction",
		description:
			"Reduce false positives by requiring N failures out of M checks",
		upgradeMessage:
			"Upgrade to Business for N-out-of-M false positive reduction",
		minPlan: PULSE_PLAN_IDS.BUSINESS,
	},
};

/**
 * Map Pulse plan to equivalent regular plan for feature checks
 * Pulse Free maps to regular Free plan
 */
export function getRegularPlanForPulsePlan(
	pulsePlanId: PulsePlanId | string | null
): PlanId {
	const pulsePlan = (pulsePlanId ?? PULSE_PLAN_IDS.FREE) as PulsePlanId;

	if (pulsePlan === PULSE_PLAN_IDS.FREE) {
		return PLAN_IDS.FREE;
	}

	// For other Pulse plans, return free as default
	// You can extend this mapping if needed
	return PLAN_IDS.FREE;
}

/** Check if a plan has access to a gated feature */
export function isPulsePlanFeatureEnabled(
	planId: PulsePlanId | string | null,
	feature: PulseGatedFeatureId
): boolean {
	const plan = (planId ?? PULSE_PLAN_IDS.FREE) as PulsePlanId;
	return PULSE_PLAN_FEATURES[plan]?.[feature] ?? false;
}

/** Get the minimum plan required for a feature */
export function getMinimumPulsePlanForFeature(
	feature: PulseGatedFeatureId
): PulsePlanId | null {
	for (const plan of PULSE_PLAN_HIERARCHY) {
		if (PULSE_PLAN_FEATURES[plan][feature]) {
			return plan;
		}
	}
	return null;
}

/** Get plan metadata */
export function getPulsePlanMetadata(
	planId: PulsePlanId | string | null
): PulsePlanMetadata {
	const plan = (planId ?? PULSE_PLAN_IDS.FREE) as PulsePlanId;
	return PULSE_PLAN_METADATA[plan] ?? PULSE_PLAN_METADATA[PULSE_PLAN_IDS.FREE];
}

/** Get plan limits */
export function getPulsePlanLimits(
	planId: PulsePlanId | string | null
): PulsePlanLimits {
	const metadata = getPulsePlanMetadata(planId);
	return metadata.limits;
}

/** Product information */
export const PULSE_PRODUCT_INFO = {
	productName: "Databuddy Pulse",
	coreValueProposition:
		"Integrated, Privacy-First Uptime Monitoring: Know when your site is down, and why, without compromising user privacy.",
} as const;
