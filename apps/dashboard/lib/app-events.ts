"use client";

import { flush, track } from "@databuddy/sdk";
import type {
	AppEventName,
	AppEventNameWithProperties,
	AppEventProperties,
	EmptyAppEventName,
	OnboardingAttributionProperties,
	SignupEventProperties,
	SignupMethod,
} from "@databuddy/shared/custom-events";
import {
	MARKETING_PARAM_KEYS,
	SIGNUP_METHODS,
	isSignupMethod,
} from "@databuddy/shared/custom-events";

export {
	APP_EVENTS,
	readMarketingProperties,
	readUtmProperties,
} from "@databuddy/shared/custom-events";
export type {
	OnboardingAttributionProperties,
	SignupEventProperties,
	SignupMethod,
} from "@databuddy/shared/custom-events";

const ONBOARDING_ATTRIBUTION_KEY = "databuddy.onboardingAttribution";
const PENDING_SOCIAL_SIGNUP_KEY = "databuddy.pendingSocialSignup";

interface TrackOptions {
	flush?: boolean;
}

export function trackAppEvent<Name extends EmptyAppEventName>(
	name: Name,
	options?: TrackOptions
): void;
export function trackAppEvent<Name extends AppEventNameWithProperties>(
	name: Name,
	properties: AppEventProperties[Name],
	options?: TrackOptions
): void;
export function trackAppEvent<Name extends AppEventName>(
	name: Name,
	propertiesOrOptions?: AppEventProperties[Name] | TrackOptions,
	options?: TrackOptions
) {
	try {
		const properties =
			options || !propertiesOrOptions || !("flush" in propertiesOrOptions)
				? (propertiesOrOptions as Record<string, unknown> | undefined)
				: undefined;
		const trackOptions =
			options ??
			(properties ? undefined : (propertiesOrOptions as TrackOptions));

		track(name, properties);
		if (trackOptions?.flush) {
			flush();
		}
	} catch {
		// SDK may not be loaded yet.
	}
}

const SOCIAL_SIGNUP_METHODS = new Set<SignupMethod>(
	SIGNUP_METHODS.filter(isSocialSignupMethod)
);

export function isSocialSignupMethod(method: SignupMethod): boolean {
	return method.startsWith("social_");
}

function trimStoredString(value: unknown, maxLength = 160): string | undefined {
	if (typeof value !== "string") {
		return;
	}
	const trimmed = value.trim();
	return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

export function toOnboardingAttribution(
	value: unknown
): OnboardingAttributionProperties {
	if (!value || typeof value !== "object") {
		return {};
	}

	const source = value as Record<string, unknown>;
	const properties: OnboardingAttributionProperties = {};
	const plan = trimStoredString(source.plan);
	if (plan) {
		properties.plan = plan;
	}

	for (const key of MARKETING_PARAM_KEYS) {
		const param = trimStoredString(source[key]);
		if (param) {
			properties[key] = param;
		}
	}

	return properties;
}

function hasOnboardingAttribution(
	properties: OnboardingAttributionProperties
): boolean {
	return Boolean(
		properties.plan || MARKETING_PARAM_KEYS.some((key) => properties[key])
	);
}

function readStoredSignupProperties(
	value: unknown
): SignupEventProperties | null {
	if (!value || typeof value !== "object") {
		return null;
	}

	const source = value as Record<string, unknown>;
	const method = source.method;
	if (!(isSignupMethod(method) && SOCIAL_SIGNUP_METHODS.has(method))) {
		return null;
	}

	return { ...toOnboardingAttribution(source), method };
}

export function storeOnboardingAttribution(
	properties: OnboardingAttributionProperties
): void {
	const attribution = toOnboardingAttribution(properties);
	if (!hasOnboardingAttribution(attribution)) {
		clearOnboardingAttribution();
		return;
	}

	try {
		sessionStorage.setItem(
			ONBOARDING_ATTRIBUTION_KEY,
			JSON.stringify(attribution)
		);
	} catch {
		// Session storage can be unavailable in hardened browser contexts.
	}
}

export function readOnboardingAttribution(): OnboardingAttributionProperties {
	try {
		const raw = sessionStorage.getItem(ONBOARDING_ATTRIBUTION_KEY);
		if (!raw) {
			return {};
		}
		return toOnboardingAttribution(JSON.parse(raw));
	} catch {
		return {};
	}
}

export function clearOnboardingAttribution(): void {
	try {
		sessionStorage.removeItem(ONBOARDING_ATTRIBUTION_KEY);
	} catch {
		// Session storage can be unavailable in hardened browser contexts.
	}
}

export function storePendingSocialSignup(
	properties: SignupEventProperties
): void {
	if (!SOCIAL_SIGNUP_METHODS.has(properties.method)) {
		return;
	}

	storeOnboardingAttribution(properties);

	try {
		sessionStorage.setItem(
			PENDING_SOCIAL_SIGNUP_KEY,
			JSON.stringify(properties)
		);
	} catch {
		// Session storage can be unavailable in hardened browser contexts.
	}
}

export function consumePendingSocialSignup(): SignupEventProperties | null {
	try {
		const raw = sessionStorage.getItem(PENDING_SOCIAL_SIGNUP_KEY);
		sessionStorage.removeItem(PENDING_SOCIAL_SIGNUP_KEY);
		if (!raw) {
			return null;
		}
		return readStoredSignupProperties(JSON.parse(raw));
	} catch {
		return null;
	}
}
