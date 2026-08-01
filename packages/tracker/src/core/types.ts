/** biome-ignore-all lint/style/useConsistentTypeDefinitions: Interfaces are needed for declaration merging */
export type TrackerOptions = {
	clientId: string;
	disabled?: boolean;
	anonymizeVisitorIds?: boolean | "auto";
	apiUrl?: string;
	sdk?: string;
	sdkVersion?: string;

	// Features
	trackHashChanges?: boolean;
	trackAttributes?: boolean;
	trackOutgoingLinks?: boolean;
	/** @deprecated Use trackWebVitals. This remains as a compatibility alias. */
	trackPerformance?: boolean;
	trackWebVitals?: boolean;
	trackInteractions?: boolean;
	trackErrors?: boolean;
	ignoreBotDetection?: boolean;
	usePixel?: boolean;

	// Sampling & Retries
	samplingRate?: number;
	enableRetries?: boolean;
	maxRetries?: number;
	initialRetryDelay?: number;

	// Batching
	enableBatching?: boolean;
	batchSize?: number;
	batchTimeout?: number;

	// Filtering & masking
	filter?: (event: any) => boolean;
	skipPatterns?: string[];
	maskPatterns?: string[];
};

export type TrackerSendOutcome =
	| {
			count: number;
			ok: true;
			status: "delivered" | "queued" | "skipped";
	  }
	| {
			attempts: number;
			code: "HTTP_ERROR" | "NETWORK_ERROR" | "REQUEST_ERROR";
			count: number;
			message: string;
			ok: false;
			retryable: boolean;
			status: "failed";
			statusCode: number | null;
	  };

export type EventContext = {
	path: string;
	title: string;
	referrer?: string;
	viewport_size?: string;
	timezone?: string;
	language: string;
	dbid?: string;
	[key: string]: string | undefined;
};

export type BaseEvent = {
	eventId: string;
	name?: string;
	anonymousId?: string;
	anonymizeVisitorIds?: boolean | "auto";
	profileId?: string;
	sessionId?: string;
	sessionStartTime?: number;
	timestamp: number;
	type?: string;
	[key: string]: any;
};

export type WebVitalMetricName = "FCP" | "LCP" | "CLS" | "INP" | "TTFB" | "FPS";

export type WebVitalEvent = {
	eventId?: string;
	timestamp: number;
	path: string;
	metricName: WebVitalMetricName;
	metricValue: number;
	anonymousId?: string;
	anonymizeVisitorIds?: boolean | "auto";
	sessionId?: string;
};

export type ErrorSpan = {
	eventId?: string;
	timestamp: number;
	path: string;
	message: string;
	filename?: string;
	lineno?: number;
	colno?: number;
	stack?: string;
	errorType: string;
	anonymousId?: string;
	anonymizeVisitorIds?: boolean | "auto";
	sessionId?: string;
};

export type TrackEventPayload = {
	name: string;
	timestamp: number;
	path?: string;
	properties?: Record<string, unknown>;
	anonymousId?: string;
	anonymizeVisitorIds?: boolean | "auto";
	profileId?: string;
	sessionId?: string;
	websiteId: string;
	source: "browser";
};

/**
 * User metadata attached via identify()/setTraits(). Scalar values only —
 * nested objects and arrays are rejected by the server. Limits: 50 keys,
 * 2KB serialized. Setting a value to `null` removes that trait.
 *
 * Special keys promoted to profile fields instead of being stored as traits:
 * `email` (lowercased), `username` and `name` (display name; username wins).
 */
export type ProfileTraits = Record<string, string | number | boolean | null>;

export type DatabuddyGlobal = {
	track: (name: string, props?: Record<string, unknown>) => void;
	screenView: (props?: Record<string, unknown>) => void;
	/**
	 * Link this browser to a user ID from your system (max 128 chars, stored
	 * verbatim — pass an opaque ID, not an email). Persists in localStorage
	 * across sessions and attaches to every subsequent event. Safe to call on
	 * every page load: repeat calls with the same ID and no traits are
	 * deduplicated to one request per session. Call clearProfile() on logout.
	 */
	identify: (profileId: string, traits?: ProfileTraits) => void;
	/**
	 * Merge traits into the current user's profile without re-identifying.
	 * Requires a prior identify(); otherwise a no-op (warns in debug builds).
	 */
	setTraits: (traits: ProfileTraits) => void;
	/** Forget the identified user (call on logout). Anonymous ID is kept. */
	clearProfile: () => void;
	/** Currently identified user ID, or null when anonymous. */
	getProfileId: () => string | null;
	clear: () => void;
	flush: () => void;
	setGlobalProperties: (props: Record<string, unknown>) => void;
	options: TrackerOptions;
	__getMaxScrollDepth?: () => number;
};

declare global {
	interface Window {
		__tracker?: unknown;
		_phantom?: unknown;
		callPhantom?: unknown;
		databuddy?: DatabuddyGlobal;
		databuddyConfig?: TrackerOptions;
		databuddyDisabled?: boolean;
		databuddyOptedOut?: boolean;
		databuddyOptIn?: () => void;
		databuddyOptOut?: () => void;
		db?: DatabuddyGlobal;
		selenium?: unknown;
		webdriver?: unknown;
	}

	interface Document {
		prerendering?: boolean;
	}

	interface Navigator {
		globalPrivacyControl?: boolean;
		webdriver?: boolean;
	}
}
