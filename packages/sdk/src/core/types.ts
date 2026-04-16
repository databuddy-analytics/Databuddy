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
 *   samplingRate={0.5}
 * />
 * ```
 */
export interface DatabuddyConfig {
	/**
	 * Custom API endpoint for event ingestion.
	 * Default: 'https://basket.databuddy.cc'
	 */
	apiUrl?: string;

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
	/**
	 * Your Databuddy project client ID.
	 * If not provided, will automatically detect from NEXT_PUBLIC_DATABUDDY_CLIENT_ID environment variable.
	 * Get this from your Databuddy dashboard.
	 * Example: UUID-style or short public id (dashboard client ID).
	 */
	clientId?: string;

	/**
	 * (Advanced) Your Databuddy client secret for server-side operations.
	 * Not required for browser usage.
	 */
	clientSecret?: string;

	/**
	 * Enable debug logging (default: false).
	 */
	debug?: boolean;

	/**
	 * Disable all tracking (default: false).
	 * If true, no events will be sent.
	 */
	disabled?: boolean;

	// --- Batching ---

	/**
	 * Enable event batching (default: true).
	 */
	enableBatching?: boolean;

	/**
	 * Enable retries for failed requests (default: true).
	 */
	enableRetries?: boolean;

	/**
	 * Filter function to conditionally skip events.
	 * Return false to skip the event, true to send it.
	 *
	 * @example
	 * ```ts
	 * filter: (event) => {
	 *   // Skip events from admin pages
	 *   return !event.path?.includes('/admin');
	 * }
	 * ```
	 */
	filter?: (event: any) => boolean;

	/**
	 * Ignore bot detection (default: false).
	 * If true, bot detection will be disabled and bots will be tracked.
	 */
	ignoreBotDetection?: boolean;

	/**
	 * Initial retry delay in milliseconds (default: 500).
	 * Only used if enableRetries is true.
	 */
	initialRetryDelay?: number;

	/** Array of glob patterns to mask sensitive paths (e.g., ['/users/*']) */
	maskPatterns?: string[];

	/**
	 * Maximum number of retries for failed requests (default: 3).
	 * Only used if enableRetries is true.
	 */
	maxRetries?: number;

	// --- Optimization ---

	/**
	 * Sampling rate for events (0.0 to 1.0, default: 1.0).
	 * Example: 0.5 = 50% of events sent.
	 */
	samplingRate?: number;

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

	/** Array of glob patterns to skip tracking on matching paths (e.g., ['/admin/**']) */
	skipPatterns?: string[];

	// --- Interaction Tracking ---

	/**
	 * Track data-* attributes on elements (default: false).
	 */
	trackAttributes?: boolean;

	/**
	 * Track JavaScript errors (default: false).
	 */
	trackErrors?: boolean;

	// --- Core Tracking Features ---

	/**
	 * Track hash changes in the URL (default: false).
	 */
	trackHashChanges?: boolean;

	/**
	 * Track user interactions (default: false).
	 */
	trackInteractions?: boolean;

	/**
	 * Track clicks on outgoing links (default: false).
	 */
	trackOutgoingLinks?: boolean;

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
	 * Use pixel tracking instead of script (default: false).
	 * When enabled, uses a 1x1 pixel image for tracking.
	 */
	usePixel?: boolean;
}

/**
 * Base event properties that can be attached to any event
 */
export interface BaseEventProperties {
	/** Page URL */
	__path?: string;
	/** Referrer URL */
	__referrer?: string;
	/** Event timestamp in milliseconds */
	__timestamp_ms?: number;
	/** Page title */
	__title?: string;
	/** User language */
	language?: string;
	/** Page count in session */
	page_count?: number;
	/** Session ID */
	sessionId?: string;
	/** Session start time */
	sessionStartTime?: number;
	/** User timezone */
	timezone?: string;
	utm_campaign?: string;
	utm_content?: string;
	utm_medium?: string;
	/** UTM parameters */
	utm_source?: string;
	utm_term?: string;
	/** Viewport size */
	viewport_size?: string;
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
export interface EventTypeMap {
	// Interaction events
	button_click: {
		button_text?: string;
		button_type?: string;
		button_id?: string;
		element_class?: string;
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

	form_submit: {
		form_id?: string;
		form_name?: string;
		form_type?: string;
		success?: boolean;
	};

	link_out: {
		href: string;
		text?: string;
		target_domain?: string;
	};

	page_exit: {
		path?: string;
		timestamp?: number;
		time_on_page: number;
		scroll_depth: number;
		interaction_count: number;
		page_count: number;
	};
	// Core events
	screen_view: {
		page_count?: number;
		time_on_page?: number;
		scroll_depth?: number;
		interaction_count?: number;
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
 * // Access tracker options
 * const options = window.databuddy.options;
 * ```
 */
export interface DatabuddyTracker {
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

	/**
	 * Current tracker configuration options.
	 */
	options: DatabuddyConfig;

	/**
	 * Manually track a page view. Called automatically on route changes.
	 * @param properties - Additional properties to attach to the screen view event
	 */
	screenView(properties?: Record<string, unknown>): void;

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
	setGlobalProperties(properties: Record<string, unknown>): void;
	/**
	 * Track a custom event.
	 * @param eventName - Name of the event (e.g., "purchase", "signup")
	 * @param properties - Additional data to attach
	 */
	track(eventName: string, properties?: Record<string, unknown>): void;
}

/**
 * Global window interface extensions
 */
declare global {
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
export interface DataAttributes {
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

export type ScreenViewFunction = (properties?: Record<string, unknown>) => void;

export type SetGlobalPropertiesFunction = (properties: EventProperties) => void;
