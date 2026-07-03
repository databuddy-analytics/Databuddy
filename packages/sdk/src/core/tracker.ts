import { logger } from "@/logger";
import type { DatabuddyTracker, ProfileTraits } from "./types";

/** Check if the full tracker instance (`window.databuddy`) is available. */
export function isTrackerAvailable(): boolean {
	return typeof window !== "undefined" && !!(window.databuddy || window.db);
}

/** Returns the `window.databuddy` tracker instance, or `null` if unavailable. */
export function getTracker(): DatabuddyTracker | null {
	if (typeof window === "undefined") {
		return null;
	}
	return window.databuddy || null;
}

/** Track a custom event. Safe to call on server (no-op) or before tracker loads. */
export function track(
	name: string,
	properties?: Record<string, unknown>
): void {
	if (typeof window === "undefined") {
		return;
	}

	const fn = window.db?.track || window.databuddy?.track;
	if (!fn) {
		return;
	}

	try {
		fn(name, properties);
	} catch (error) {
		logger.error("track error:", error);
	}
}

/** Reset user session — generates new anonymous and session IDs. Call after logout. */
export function clear(): void {
	if (typeof window === "undefined") {
		return;
	}

	const fn = window.db?.clear || window.databuddy?.clear;
	if (!fn) {
		return;
	}

	try {
		fn();
	} catch (error) {
		logger.error("clear error:", error);
	}
}

/** Force send all queued events. Call before navigating to external sites. */
export function flush(): void {
	if (typeof window === "undefined") {
		return;
	}

	const fn = window.db?.flush || window.databuddy?.flush;
	if (!fn) {
		return;
	}

	try {
		fn();
	} catch (error) {
		logger.error("flush error:", error);
	}
}

/** Link this browser to a user ID from your system. Safe to call on server (no-op) or on every page load. */
export function identify(profileId: string, traits?: ProfileTraits): void {
	if (typeof window === "undefined") {
		return;
	}

	const fn = window.db?.identify || window.databuddy?.identify;
	if (!fn) {
		return;
	}

	try {
		fn(profileId, traits);
	} catch (error) {
		logger.error("identify error:", error);
	}
}

/** Merge traits into the identified user's profile. Requires a prior identify(). */
export function setTraits(traits: ProfileTraits): void {
	if (typeof window === "undefined") {
		return;
	}

	const fn = window.db?.setTraits || window.databuddy?.setTraits;
	if (!fn) {
		return;
	}

	try {
		fn(traits);
	} catch (error) {
		logger.error("setTraits error:", error);
	}
}

/** Forget the identified user (call on logout). Anonymous ID is kept. */
export function clearProfile(): void {
	if (typeof window === "undefined") {
		return;
	}

	const fn = window.db?.clearProfile || window.databuddy?.clearProfile;
	if (!fn) {
		return;
	}

	try {
		fn();
	} catch (error) {
		logger.error("clearProfile error:", error);
	}
}

/** Currently identified user ID, or null when anonymous. Falls back to localStorage before the tracker loads. */
export function getProfileId(): string | null {
	if (typeof window === "undefined") {
		return null;
	}

	const fn = window.db?.getProfileId || window.databuddy?.getProfileId;
	if (fn) {
		try {
			return fn();
		} catch (error) {
			logger.error("getProfileId error:", error);
		}
	}
	try {
		return localStorage.getItem("did_profile");
	} catch {
		return null;
	}
}

/** Convenience wrapper: `track('error', { message, ...properties })` */
export function trackError(
	message: string,
	properties?: {
		filename?: string;
		lineno?: number;
		colno?: number;
		stack?: string;
		error_type?: string;
		[key: string]: string | number | boolean | null | undefined;
	}
): void {
	track("error", { message, ...properties });
}

/** Get anonymous user ID. Priority: URL params → localStorage. Persists across sessions. */
export function getAnonymousId(urlParams?: URLSearchParams): string | null {
	if (typeof window === "undefined") {
		return null;
	}
	return urlParams?.get("anonId") || localStorage.getItem("did") || null;
}

/** Get current session ID. Priority: URL params → sessionStorage. Resets after 30 min inactivity. */
export function getSessionId(urlParams?: URLSearchParams): string | null {
	if (typeof window === "undefined") {
		return null;
	}
	return (
		urlParams?.get("sessionId") || sessionStorage.getItem("did_session") || null
	);
}

/** Get both anonymous ID and session ID in one call. */
export function getTrackingIds(urlParams?: URLSearchParams): {
	anonId: string | null;
	sessionId: string | null;
} {
	return {
		anonId: getAnonymousId(urlParams),
		sessionId: getSessionId(urlParams),
	};
}

/** Returns tracking IDs as a URL query string for cross-domain tracking. */
export function getTrackingParams(urlParams?: URLSearchParams): string {
	const anonId = getAnonymousId(urlParams);
	const sessionId = getSessionId(urlParams);
	const params = new URLSearchParams();
	if (anonId) {
		params.set("anonId", anonId);
	}
	if (sessionId) {
		params.set("sessionId", sessionId);
	}
	return params.toString();
}
