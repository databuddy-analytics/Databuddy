import type { DatabuddyTracker } from "./types";

/**
 * Checks if the Databuddy tracker script has loaded and is available.
 * Use this before calling tracking functions in conditional scenarios.
 *
 * @returns `true` if tracker is available, `false` if not loaded or on server
 *
 * @example
 * ```ts
 * import { isTrackerAvailable, track } from "@databuddy/sdk";
 *
 * if (isTrackerAvailable()) {
 *   track("feature_used", { feature: "export" });
 * }
 * ```
 */
export function isTrackerAvailable(): boolean {
	return typeof window !== "undefined" && (!!window.databuddy || !!window.db);
}

/**
 * Returns the raw Databuddy tracker instance for advanced use cases.
 * Prefer using the exported functions (`track`, `flush`, etc.) instead.
 *
 * @returns Tracker instance or `null` if not available
 *
 * @example
 * ```ts
 * import { getTracker } from "@databuddy/sdk";
 *
 * const tracker = getTracker();
 * if (tracker) {
 *   console.log("Anonymous ID:", tracker.anonymousId);
 *   console.log("Session ID:", tracker.sessionId);
 * }
 * ```
 */
export function getTracker(): DatabuddyTracker | null {
	if (typeof window === "undefined") {
		return null;
	}
	return window.databuddy || null;
}

/**
 * Tracks a custom event with optional properties.
 * Events are batched and sent efficiently to minimize network overhead.
 * Safe to call on server (no-op) or before tracker loads.
 *
 * @param name - Event name (e.g., "button_click", "purchase", "signup")
 * @param properties - Key-value pairs of event data
 *
 * @example
 * ```ts
 * import { track } from "@databuddy/sdk";
 *
 * // Simple event
 * track("signup_started");
 *
 * // Event with properties
 * track("item_purchased", {
 *   itemId: "sku-123",
 *   price: 29.99,
 *   currency: "USD"
 * });
 *
 * // In a React component
 * function CheckoutButton() {
 *   return (
 *     <button onClick={() => track("checkout_clicked", { cartSize: 3 })}>
 *       Checkout
 *     </button>
 *   );
 * }
 * ```
 */
export function track(
	name: string,
	properties?: Record<string, unknown>
): void {
	if (typeof window === "undefined") {
		return;
	}

	const tracker = window.db?.track || window.databuddy?.track;

	if (!tracker) {
		return;
	}

	try {
		tracker(name, properties);
	} catch (error) {
		console.error("Databuddy track error:", error);
	}
}

/** @deprecated Use `track()` instead. Will be removed in v3.0. */
export function trackCustomEvent(
	name: string,
	properties?: Record<string, unknown>
): void {
	track(name, properties);
}

/**
 * Clears the current user session and generates new anonymous/session IDs.
 * Use after logout to ensure the next user gets a fresh identity.
 *
 * @example
 * ```ts
 * import { clear } from "@databuddy/sdk";
 *
 * async function handleLogout() {
 *   await signOut();
 *   clear(); // Reset tracking identity
 *   router.push("/login");
 * }
 * ```
 */
export function clear(): void {
	if (typeof window === "undefined") {
		return;
	}

	const tracker = window.db?.clear || window.databuddy?.clear;

	if (!tracker) {
		return;
	}

	try {
		tracker();
	} catch (error) {
		console.error("Databuddy clear error:", error);
	}
}

/**
 * Forces all queued events to be sent immediately.
 * Useful before navigation or when you need to ensure events are captured.
 *
 * @example
 * ```ts
 * import { track, flush } from "@databuddy/sdk";
 *
 * function handleExternalLink(url: string) {
 *   track("external_link_clicked", { url });
 *   flush(); // Ensure event is sent before leaving
 *   window.location.href = url;
 * }
 * ```
 */
export function flush(): void {
	if (typeof window === "undefined") {
		return;
	}

	const tracker = window.db?.flush || window.databuddy?.flush;

	if (!tracker) {
		return;
	}

	try {
		tracker();
	} catch (error) {
		console.error("Databuddy flush error:", error);
	}
}

/**
 * Tracks an error event. Convenience wrapper around `track("error", ...)`.
 *
 * @param message - Error message
 * @param properties - Additional error context (filename, line number, stack trace)
 *
 * @example
 * ```ts
 * import { trackError } from "@databuddy/sdk";
 *
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   trackError(error.message, {
 *     stack: error.stack,
 *     error_type: error.name,
 *     context: "checkout_flow"
 *   });
 * }
 * ```
 */
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

/**
 * Gets the anonymous user ID. Persists across sessions via localStorage.
 * Useful for server-side identification or cross-domain tracking.
 *
 * @param urlParams - Optional URLSearchParams to check for `anonId` param (highest priority)
 * @returns Anonymous ID or `null` if unavailable
 *
 * Priority: URL params → tracker instance → localStorage
 *
 * @example
 * ```ts
 * import { getAnonymousId } from "@databuddy/sdk";
 *
 * // Get from tracker
 * const anonId = getAnonymousId();
 *
 * // Check URL params first (for cross-domain tracking)
 * const params = new URLSearchParams(window.location.search);
 * const anonId = getAnonymousId(params);
 *
 * // Pass to server
 * await fetch("/api/identify", {
 *   body: JSON.stringify({ anonId })
 * });
 * ```
 */
export function getAnonymousId(urlParams?: URLSearchParams): string | null {
	if (typeof window === "undefined") {
		return null;
	}
	return (
		urlParams?.get("anonId") ||
		window.databuddy?.anonymousId ||
		localStorage.getItem("did") ||
		null
	);
}

/**
 * Gets the current session ID. Resets after 30 min of inactivity.
 * Useful for correlating events within a single browsing session.
 *
 * @param urlParams - Optional URLSearchParams to check for `sessionId` param (highest priority)
 * @returns Session ID or `null` if unavailable
 *
 * Priority: URL params → tracker instance → sessionStorage
 *
 * @example
 * ```ts
 * import { getSessionId } from "@databuddy/sdk";
 *
 * const sessionId = getSessionId();
 * console.log("Current session:", sessionId);
 * ```
 */
export function getSessionId(urlParams?: URLSearchParams): string | null {
	if (typeof window === "undefined") {
		return null;
	}
	return (
		urlParams?.get("sessionId") ||
		window.databuddy?.sessionId ||
		sessionStorage.getItem("did_session") ||
		null
	);
}

/**
 * Gets both anonymous ID and session ID in a single call.
 *
 * @param urlParams - Optional URLSearchParams to check for tracking params
 * @returns Object with `anonId` and `sessionId` (either may be null)
 *
 * @example
 * ```ts
 * import { getTrackingIds } from "@databuddy/sdk";
 *
 * const { anonId, sessionId } = getTrackingIds();
 *
 * // Send to your backend
 * await api.identify({ anonId, sessionId, userId: user.id });
 * ```
 */
export function getTrackingIds(urlParams?: URLSearchParams): {
	anonId: string | null;
	sessionId: string | null;
} {
	return {
		anonId: getAnonymousId(urlParams),
		sessionId: getSessionId(urlParams),
	};
}

/**
 * Returns tracking IDs as a URL query string for cross-domain tracking.
 * Append to URLs when linking to other domains you own.
 *
 * @param urlParams - Optional URLSearchParams to preserve existing params
 * @returns Query string like `"anonId=xxx&sessionId=yyy"` or empty string
 *
 * @example
 * ```ts
 * import { getTrackingParams } from "@databuddy/sdk";
 *
 * // Link to subdomain with tracking continuity
 * const params = getTrackingParams();
 * const url = `https://app.example.com/dashboard${params ? `?${params}` : ""}`;
 *
 * // In a component
 * <a href={`https://shop.example.com?${getTrackingParams()}`}>
 *   Visit Shop
 * </a>
 * ```
 */
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
