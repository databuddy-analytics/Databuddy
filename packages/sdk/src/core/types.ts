/**
 * Configuration for the `<Databuddy />` component and tracker script.
 *
 * @example
 * ```tsx
 * <Databuddy
 *   clientId="your-client-id"
 *   apiUrl="https://basket.databuddy.cc"
 *   trackWebVitals
 *   trackErrors
 *   trackScrollDepth
 *   samplingRate={0.5}
 * />
 * ```
 */
export type DatabuddyConfig = {
	/**
	 * Your Databuddy project client ID.
	 * If not provided, will automatically detect from NEXT_PUBLIC_DATABUDDY_CLIENT_ID environment variable.
	 * Get this from your Databuddy dashboard.
	 * Example: '3ed1fce1-5a56-4cbc-a917-66864f6d18e3'
	 */
	clientId?: string;

	/**
	 * (Advanced) Your Databuddy client secret for server-side operations.
	 * Not required for browser usage.
	 */
	clientSecret?: string;

	/**
	 * Custom API endpoint for event ingestion.
	 * Default: 'https://basket.databuddy.cc'
	 */
	apiUrl?: string;

	/**
	 * Custom script URL for the Databuddy browser bundle.
	 * Default: 'https://cdn.databuddy.cc/databuddy.js'
	 */
	scriptUrl?: string;

	/**
	 * SDK name for analytics (default: 'web').
	 * Only override if you are building a custom integration.
	 */
	sdk?: string;

	/**
	 * SDK version (defaults to package.json version).
	 * Only override for custom builds.
	 */
	sdkVersion?: string;

	/**
	 * Disable all tracking (default: false).
	 * If true, no events will be sent.
	 */
	disabled?: boolean;

	/**
	 * Enable debug logging (default: false).
	 */
	debug?: boolean;

	// --- Core Tracking Features ---

	/**
	 * Track hash changes in the URL (default: false).
	 */
	trackHashChanges?: boolean;

	// --- Interaction Tracking ---

	/**
	 * Track data-* attributes on elements (default: false).
	 */
	trackAttributes?: boolean;

	/**
	 * Track clicks on outgoing links (default: false).
	 */
	trackOutgoingLinks?: boolean;

	/**
	 * Track user interactions (default: false).
	 */
	trackInteractions?: boolean;

	// --- Engagement Tracking ---

	/**
	 * Track scroll depth (default: false).
	 */
	trackScrollDepth?: boolean;

	// --- Performance Tracking ---

	/**
	 * Track page performance metrics (default: true).
	 */
	trackPerformance?: boolean;

	/**
	 * Track Web Vitals metrics (default: false).
	 */
	trackWebVitals?: boolean;

	/**
	 * Track JavaScript errors (default: false).
	 */
	trackErrors?: boolean;

	// --- Optimization ---

	/**
	 * Sampling rate for events (0.0 to 1.0, default: 1.0).
	 * Example: 0.5 = 50% of events sent.
	 */
	samplingRate?: number;

	/**
	 * Enable retries for failed requests (default: true).
	 */
	enableRetries?: boolean;

	/**
	 * Maximum number of retries for failed requests (default: 3).
	 * Only used if enableRetries is true.
	 */
	maxRetries?: number;

	/**
	 * Initial retry delay in milliseconds (default: 500).
	 * Only used if enableRetries is true.
	 */
	initialRetryDelay?: number;

	// --- Batching ---

	/**
	 * Enable event batching (default: false).
	 */
	enableBatching?: boolean;

	/**
	 * Number of events to batch before sending (default: 10).
	 * Only used if enableBatching is true.
	 * Min: 1, Max: 50
	 */
	batchSize?: number;

	/**
	 * Batch timeout in milliseconds (default: 2000).
	 * Only used if enableBatching is true.
	 * Min: 100, Max: 30000
	 */
	batchTimeout?: number;

	/** Array of glob patterns to skip tracking on matching paths (e.g., ['/admin/**']) */
	skipPatterns?: string[];

	maskPatterns?: string[];
}

/**
 * Base event properties that can be attached to any event
 */
export type BaseEventProperties = {
	/** Page URL */
	__path?: string;
	/** Page title */
	__title?: string;
	/** Referrer URL */
	__referrer?: string;
	/** Event timestamp in milliseconds */
	__timestamp_ms?: number;
	/** Session ID */
	sessionId?: string;
	/** Session start time */
	sessionStartTime?: number;
	/** Page count in session */
	page_count?: number;
	/** Viewport size */
	viewport_size?: string;
	/** User timezone */
	timezone?: string;
	/** User language */
	language?: string;
	/** UTM parameters */
	utm_source?: string;
	utm_medium?: string;
	utm_campaign?: string;
	utm_term?: string;
	utm_content?: string;
}

/**
 * Custom event properties that can be attached to any event
 */
export interface EventProperties extends BaseEventProperties {
	/** Custom properties for the event */
	[key: string]: string | number | boolean | null | undefined;
}

/**
 * Pre-defined event types with their specific properties
 */
export type EventTypeMap = {
	// Core events
	screen_view: {
		time_on_page?: number;
		scroll_depth?: number;
		interaction_count?: number;
		has_exit_intent?: boolean;
		is_bounce?: 0 | 1;
	};

	page_exit: {
		time_on_page: number;
		scroll_depth: number;
		interaction_count: number;
		has_exit_intent: boolean;
		page_count: number;
		is_bounce: 0 | 1;
	};

	// Interaction events
	button_click: {
		button_text?: string;
		button_type?: string;
		button_id?: string;
		element_class?: string;
	};

	link_out: {
		href: string;
		text?: string;
		target_domain?: string;
	};

	form_submit: {
		form_id?: string;
		form_name?: string;
		form_type?: string;
		success?: boolean;
	};

	// Performance events
	web_vitals: {
		fcp?: number; // First Contentful Paint
		lcp?: number; // Largest Contentful Paint
		cls?: string; // Cumulative Layout Shift
		fid?: number; // First Input Delay
		ttfb?: number; // Time to First Byte
		load_time?: number;
		dom_ready_time?: number;
		render_time?: number;
		request_time?: number;
	};

	// Error events
	error: {
		message: string;
		filename?: string;
		lineno?: number;
		colno?: number;
		stack?: string;
		error_type?: string;
	};

	// Custom events (catch-all)
	[eventName: string]: EventProperties;
}

/**
 * Available event names
 */
export type EventName = keyof EventTypeMap;

/**
 * Properties for a specific event type
 */
export type PropertiesForEvent<T extends EventName> =
	T extends keyof EventTypeMap
	? EventTypeMap[T] & EventProperties
	: EventProperties;

/**
 * The global tracker instance available at `window.databuddy` or `window.db`.
 *
 * @example
 * ```ts
 * // Direct access (prefer SDK functions instead)
 * window.databuddy.track("signup", { plan: "pro" });
 * window.databuddy.flush();
 *
 * // Access IDs for server-side identification
 * const { anonymousId, sessionId } = window.databuddy;
 * ```
 */
export type DatabuddyTracker = {
	/** Persistent user ID (stored in localStorage, survives sessions) */
	anonymousId: string;

	/** Current session ID (resets after 30 min inactivity) */
	sessionId: string;

	/**
	 * Track a custom event.
	 * @param eventName - Name of the event (e.g., "purchase", "signup")
	 * @param properties - Additional data to attach
	 */
	track(eventName: string, properties?: Record<string, unknown>): void;

	/**
	 * Manually track a page view. Called automatically on route changes.
	 * @param path - Override the current path
	 * @param properties - Additional properties
	 */
	screenView(path?: string, properties?: EventProperties): void;

	/**
	 * Set properties that will be attached to ALL future events.
	 * Useful for user traits like plan, role, or A/B test variants.
	 *
	 * @example
	 * ```ts
	 * window.databuddy.setGlobalProperties({
	 *   plan: "enterprise",
	 *   abVariant: "checkout-v2"
	 * });
	 * ```
	 */
	setGlobalProperties(properties: EventProperties): void;

	/**
	 * Reset the user session. Generates new anonymous and session IDs.
	 * Call after logout to ensure clean slate for next user.
	 */
	clear(): void;

	/**
	 * Force send all queued events immediately.
	 * Call before navigation to external sites.
	 */
	flush(): void;
}

/**
 * Global window interface extensions
 */
declare global {
	// biome-ignore lint/style/useConsistentTypeDefinitions: It's needed here
	interface Window {
		databuddy?: DatabuddyTracker;
		db?: {
			track: DatabuddyTracker["track"];
			screenView: DatabuddyTracker["screenView"];
			clear: DatabuddyTracker["clear"];
			flush: DatabuddyTracker["flush"];
			setGlobalProperties: DatabuddyTracker["setGlobalProperties"];
		};
	}
}

/**
 * HTML data attributes for declarative click tracking.
 * Add these to any clickable element to track without JavaScript.
 *
 * @example
 * ```tsx
 * // Track button clicks with properties
 * <button
 *   data-track="cta_clicked"
 *   data-button-text="Get Started"
 *   data-location="hero"
 * >
 *   Get Started
 * </button>
 *
 * // Properties are auto-converted to camelCase:
 * // { buttonText: "Get Started", location: "hero" }
 * ```
 *
 * @example
 * ```tsx
 * // Track navigation
 * <a href="/pricing" data-track="nav_link_clicked" data-destination="pricing">
 *   Pricing
 * </a>
 * ```
 */
export type DataAttributes = {
	/** Event name to track when element is clicked */
	"data-track": string;
	/** Additional data attributes (auto-converted from kebab-case to camelCase) */
	[key: `data-${string}`]: string;
}

/**
 * Utility types for creating typed event tracking functions
 */
export type TrackFunction = <T extends EventName>(
	eventName: T,
	properties?: PropertiesForEvent<T>
) => Promise<void>;

export type ScreenViewFunction = (
	path?: string,
	properties?: EventProperties
) => void;

export type SetGlobalPropertiesFunction = (properties: EventProperties) => void;
