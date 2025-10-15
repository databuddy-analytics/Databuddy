/**
 * Configuration options for the Databuddy SDK and <Databuddy /> component.
 * All options are passed as data attributes to the injected script.
 */
export interface DatabuddyConfig {
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

	/**
	 * Wait for user profile before sending events (advanced, default: false).
	 */
	waitForProfile?: boolean;

	// --- Core Tracking Features ---

	/**
	 * Automatically track screen/page views (default: true).
	 */
	trackScreenViews?: boolean;

	/**
	 * Track hash changes in the URL (default: false).
	 */
	trackHashChanges?: boolean;

	/**
	 * Track user sessions (default: true).
	 */
	trackSessions?: boolean;

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
	 * Track user engagement metrics (default: false).
	 */
	trackEngagement?: boolean;

	/**
	 * Track scroll depth (default: false).
	 */
	trackScrollDepth?: boolean;

	/**
	 * Track exit intent (default: false).
	 */
	trackExitIntent?: boolean;

	/**
	 * Track bounce rate (default: false).
	 */
	trackBounceRate?: boolean;

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

	// --- Observability ---

	/**
	 * Enable observability features (logging, error tracking, tracing) (default: false).
	 */
	enableObservability?: boolean;

	/**
	 * Service name for observability events.
	 */
	observabilityService?: string;

	/**
	 * Environment for observability events.
	 */
	observabilityEnvironment?: string;

	/**
	 * Service version for observability events.
	 */
	observabilityVersion?: string;

	/**
	 * Enable structured logging (default: false).
	 */
	enableLogging?: boolean;

	/**
	 * Enable distributed tracing (default: false).
	 */
	enableTracing?: boolean;

	/**
	 * Enable error tracking (default: false).
	 */
	enableErrorTracking?: boolean;

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
export interface BaseEventProperties {
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
	/** Screen resolution */
	screen_resolution?: string;
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
export interface EventTypeMap {
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
 * Databuddy tracker instance interface
 */
export interface DatabuddyTracker {
	/**
	 * Track a custom event
	 */
	track<T extends EventName>(
		eventName: T,
		properties?: PropertiesForEvent<T>
	): Promise<void>;

	/**
	 * Track a screen/page view
	 */
	screenView(path?: string, properties?: EventProperties): void;

	/**
	 * Set global properties that will be attached to all events
	 */
	setGlobalProperties(properties: EventProperties): void;

	/**
	 * Clear the current user session and generate new IDs
	 */
	clear(): void;

	/**
	 * Flush any queued events immediately
	 */
	flush(): void;

	/**
	 * Track a custom event with full type safety
	 */
	trackCustomEvent(eventName: string, properties?: EventProperties): void;
}

/**
 * Global window interface extensions
 */
declare global {
	interface Window {
		databuddy?: DatabuddyTracker;
		db?: {
			track: DatabuddyTracker['track'];
			screenView: DatabuddyTracker['screenView'];
			clear: DatabuddyTracker['clear'];
			flush: DatabuddyTracker['flush'];
			setGlobalProperties: DatabuddyTracker['setGlobalProperties'];
			trackCustomEvent: DatabuddyTracker['trackCustomEvent'];
		};
	}
}

/**
 * Helper type for HTML data attributes for automatic tracking
 */
export interface DataAttributes {
	/** Event name to track when element is clicked */
	'data-track': string;
	/** Additional data attributes (converted to camelCase) */
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
