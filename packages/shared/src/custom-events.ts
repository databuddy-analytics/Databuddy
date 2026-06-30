export const APP_EVENTS = {
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
	| typeof APP_EVENTS.onboardingCompleted
	| typeof APP_EVENTS.onboardingStarted
	| typeof APP_EVENTS.onboardingTrackingCheckStatus
	| typeof APP_EVENTS.onboardingTrackingVerified
	| typeof APP_EVENTS.onboardingWebsiteCreated;
export type AppEventNameWithProperties = Exclude<
	AppEventName,
	EmptyAppEventName
>;
export type UtmParamKey = (typeof UTM_PARAM_KEYS)[number];
export type UtmProperties = Partial<Record<UtmParamKey, string>>;
export type SignupMethod = (typeof SIGNUP_METHODS)[number];
export type OnboardingStepId = "website" | "tracking" | "team" | "explore";

type EmptyProperties = Record<never, never>;

export interface SignupEventProperties extends UtmProperties {
	method: SignupMethod;
	plan?: string;
}

export interface AppEventProperties {
	[APP_EVENTS.onboardingCompleted]: EmptyProperties;
	[APP_EVENTS.onboardingInviteSent]: {
		invite_count: number;
		role: "admin" | "member";
	};
	[APP_EVENTS.onboardingSkipped]: {
		skipped_at_step: OnboardingStepId;
		step_number: number;
	};
	[APP_EVENTS.onboardingStarted]: EmptyProperties;
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
	[APP_EVENTS.onboardingWebsiteCreated]: EmptyProperties;
	[APP_EVENTS.signupCompleted]: SignupEventProperties;
	[APP_EVENTS.signupStarted]: SignupEventProperties;
}

export function readUtmProperties(params: URLSearchParams): UtmProperties {
	const properties: UtmProperties = {};

	for (const key of UTM_PARAM_KEYS) {
		const value = params.get(key)?.trim();
		if (value) {
			properties[key] = value.slice(0, 160);
		}
	}

	return properties;
}

export function isSignupMethod(value: unknown): value is SignupMethod {
	return (
		typeof value === "string" &&
		(SIGNUP_METHODS as readonly string[]).includes(value)
	);
}
