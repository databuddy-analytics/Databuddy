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

const PENDING_LIMIT = 100;
const PENDING_POLL_MS = 150;
const PENDING_TIMEOUT_MS = 15_000;

const pendingCalls: Array<() => void> = [];
let pendingPoll: ReturnType<typeof setInterval> | undefined;
let pendingSince = 0;

function flushPendingCalls(): void {
	while (pendingCalls.length > 0) {
		pendingCalls.shift()?.();
	}
}

function enqueueUntilTrackerLoads(replay: () => void, name: string): void {
	if (pendingCalls.length >= PENDING_LIMIT) {
		logger.warn(`${name} dropped: tracker script not loaded and queue full`);
		return;
	}
	pendingCalls.push(replay);
	if (pendingPoll) {
		return;
	}
	pendingSince = Date.now();
	pendingPoll = setInterval(() => {
		if (window.db ?? window.databuddy) {
			clearInterval(pendingPoll);
			pendingPoll = undefined;
			flushPendingCalls();
			return;
		}
		if (Date.now() - pendingSince > PENDING_TIMEOUT_MS) {
			clearInterval(pendingPoll);
			pendingPoll = undefined;
			pendingCalls.length = 0;
			logger.warn("tracker script never loaded — queued calls dropped");
		}
	}, PENDING_POLL_MS);
}

function callTracker(
	name: keyof NonNullable<Window["db"]> & string,
	invoke: (tracker: NonNullable<Window["db"]>) => void
): void {
	if (typeof window === "undefined") {
		return;
	}
	const tracker = window.db ?? window.databuddy;
	if (!tracker) {
		enqueueUntilTrackerLoads(() => callTracker(name, invoke), name);
		return;
	}
	if (typeof tracker[name] !== "function") {
		logger.warn(
			`${name} skipped: the loaded tracker script predates it. A hard refresh loads the current script.`
		);
		return;
	}
	try {
		invoke(tracker);
	} catch (error) {
		logger.error(`${name} error:`, error);
	}
}

/** Track a custom event. Safe to call on server (no-op) or before tracker loads. */
export function track(
	name: string,
	properties?: Record<string, unknown>
): void {
	callTracker("track", (tracker) => tracker.track(name, properties));
}

/** Reset user session — generates new anonymous and session IDs. Call after logout. */
export function clear(): void {
	callTracker("clear", (tracker) => tracker.clear());
}

/** Force send all queued events. Call before navigating to external sites. */
export function flush(): void {
	callTracker("flush", (tracker) => tracker.flush());
}

/** Link this browser to a user ID from your system. Safe to call on server (no-op) or on every page load. */
export function identify(profileId: string, traits?: ProfileTraits): void {
	callTracker("identify", (tracker) => tracker.identify(profileId, traits));
}

/** Merge traits into the identified user's profile. Requires a prior identify(). */
export function setTraits(traits: ProfileTraits): void {
	callTracker("setTraits", (tracker) => tracker.setTraits(traits));
}

/** Set properties attached to ALL future events (plan, role, A/B variant, etc.). */
export function setGlobalProperties(properties: Record<string, unknown>): void {
	callTracker("setGlobalProperties", (tracker) =>
		tracker.setGlobalProperties(properties)
	);
}

/** Forget the identified user (call on logout). Anonymous ID is kept. */
export function clearProfile(): void {
	callTracker("clearProfile", (tracker) => tracker.clearProfile());
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
