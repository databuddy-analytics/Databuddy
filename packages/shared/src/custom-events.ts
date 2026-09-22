export const APP_EVENTS = {
	checkoutCompleted: "checkout_completed",
	feedbackCreditsRedeemed: "feedback_credits_redeemed",
	firstReviewCompleted: "first_review_completed",
	firstReviewStarted: "first_review_started",
	firstReviewViewed: "first_review_viewed",
	invitationAccepted: "invitation_accepted",
	onboardingCompleted: "onboarding_completed",
	onboardingInviteSent: "onboarding_invite_sent",
	onboardingSkipped: "onboarding_skipped",
	onboardingStarted: "onboarding_started",
	onboardingStepCompleted: "onboarding_step_completed",
	onboardingStepViewed: "onboarding_step_viewed",
	onboardingTrackingCheckStatus: "onboarding_tracking_check_status",
	onboardingTrackingCopied: "onboarding_tracking_copied",
	onboardingTrackingVerified: "onboarding_tracking_verified",
	onboardingWebsiteCreated: "onboarding_website_created",
	signupCompleted: "signup_completed",
	signupStarted: "signup_started",
	topupPurchaseStarted: "topup_purchase_started",
	twoFactorDisabled: "two_factor_disabled",
	twoFactorEnabled: "two_factor_enabled",
	websiteCreated: "website_created",
	websiteTransferred: "website_transferred",
} as const;

export const UTM_PARAM_KEYS = [
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"utm_term",
	"utm_content",
] as const;

export const MARKETING_PARAM_KEYS = [
	...UTM_PARAM_KEYS,
	"gclid",
	"fbclid",
	"ttclid",
	"twclid",
	"li_fat_id",
	"msclkid",
	"oppref",
	"wolref",
] as const;

export const SIGNUP_METHODS = [
	"email",
	"social_github",
	"social_google",
] as const;

export type AppEventName = (typeof APP_EVENTS)[keyof typeof APP_EVENTS];
export type EmptyAppEventName =
	| typeof APP_EVENTS.onboardingTrackingCheckStatus
	| typeof APP_EVENTS.onboardingTrackingVerified
	| typeof APP_EVENTS.twoFactorDisabled
	| typeof APP_EVENTS.twoFactorEnabled;
export type AppEventNameWithProperties = Exclude<
	AppEventName,
	EmptyAppEventName
>;
export type UtmParamKey = (typeof UTM_PARAM_KEYS)[number];
export type UtmProperties = Partial<Record<UtmParamKey, string>>;
export type MarketingParamKey = (typeof MARKETING_PARAM_KEYS)[number];
export type MarketingProperties = Partial<Record<MarketingParamKey, string>>;
export type SignupMethod = (typeof SIGNUP_METHODS)[number];
export type OnboardingStepId = "website" | "tracking" | "team" | "explore";

type EmptyProperties = Record<never, never>;

export interface SignupEventProperties extends MarketingProperties {
	method: SignupMethod;
	plan?: string;
}

export interface OnboardingAttributionProperties extends MarketingProperties {
	plan?: string;
}

export interface AppEventProperties {
	[APP_EVENTS.checkoutCompleted]: {
		source: "stripe";
	};
	[APP_EVENTS.feedbackCreditsRedeemed]: {
		reward: "agent_credits" | "events";
		tier: number;
	};
	[APP_EVENTS.firstReviewCompleted]: {
		published_insights: number;
		website_id: string;
	};
	[APP_EVENTS.firstReviewStarted]: {
		website_id: string;
	};
	[APP_EVENTS.firstReviewViewed]: {
		website_id: string;
	};
	[APP_EVENTS.invitationAccepted]: {
		role: string;
	};
	[APP_EVENTS.onboardingCompleted]: OnboardingAttributionProperties;
	[APP_EVENTS.onboardingInviteSent]: {
		invite_count: number;
		role: "admin" | "member";
	};
	[APP_EVENTS.onboardingSkipped]: {
		skipped_at_step: OnboardingStepId;
		step_number: number;
	};
	[APP_EVENTS.onboardingStarted]: OnboardingAttributionProperties;
	[APP_EVENTS.onboardingStepCompleted]: {
		step: OnboardingStepId;
		verified?: boolean;
	};
	[APP_EVENTS.onboardingStepViewed]: {
		step: OnboardingStepId;
		step_number: number;
	};
	[APP_EVENTS.onboardingTrackingCheckStatus]: EmptyProperties;
	[APP_EVENTS.onboardingTrackingCopied]: {
		block: string;
		method: "ai" | "script" | "sdk";
	};
	[APP_EVENTS.onboardingTrackingVerified]: EmptyProperties;
	[APP_EVENTS.onboardingWebsiteCreated]: OnboardingAttributionProperties;
	[APP_EVENTS.signupCompleted]: SignupEventProperties;
	[APP_EVENTS.signupStarted]: SignupEventProperties;
	[APP_EVENTS.topupPurchaseStarted]: {
		feature: "agent_credits" | "investigation_runs";
		quantity: number;
	};
	[APP_EVENTS.twoFactorDisabled]: EmptyProperties;
	[APP_EVENTS.twoFactorEnabled]: EmptyProperties;
	[APP_EVENTS.websiteCreated]: {
		source: "dialog";
	};
	[APP_EVENTS.websiteTransferred]: {
		target: "organization" | "personal";
	};
}

function readParamProperties<const Key extends string>(
	params: URLSearchParams,
	keys: readonly Key[]
): Partial<Record<Key, string>> {
	const properties: Partial<Record<Key, string>> = {};

	for (const key of keys) {
		const value = params.get(key)?.trim();
		if (value) {
			properties[key] = value.slice(0, 160);
		}
	}

	return properties;
}

export function readMarketingProperties(
	params: URLSearchParams
): MarketingProperties {
	return readParamProperties(params, MARKETING_PARAM_KEYS);
}

export function readUtmProperties(params: URLSearchParams): UtmProperties {
	return readParamProperties(params, UTM_PARAM_KEYS);
}

export function isSignupMethod(value: unknown): value is SignupMethod {
	return (
		typeof value === "string" &&
		(SIGNUP_METHODS as readonly string[]).includes(value)
	);
}
