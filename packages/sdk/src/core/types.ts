export interface DatabuddyConfig {
	/** Whether Databuddy anonymizes visitor IDs before storage. Default: true. */
	anonymizeVisitorIds?: boolean | "auto";
	/** Event ingestion endpoint. Default: `'https://basket.databuddy.cc'` */
	apiUrl?: string;
	/** Events per batch before sending (default: 10, max: 50). Only used when `enableBatching` is true. */
	batchSize?: number;
	/** Batch flush interval in ms (default: 5000). Only used when `enableBatching` is true. */
	batchTimeout?: number;
	/** Databuddy Client ID. Auto-detected from `NEXT_PUBLIC_DATABUDDY_CLIENT_ID` env var if omitted. */
	clientId?: string;
	/** Server-side only. Not required for browser usage. */
	clientSecret?: string;
	/** Enable debug logging (default: false) */
	debug?: boolean;
	/** Disable all tracking (default: false) */
	disabled?: boolean;
	/** Enable event batching (default: true) */
	enableBatching?: boolean;
	/** Enable retries for failed requests (default: true) */
	enableRetries?: boolean;
	/** Return `false` to skip the event, `true` to send it. */
	filter?: (event: any) => boolean;
	/** Track bots when true (default: false) */
	ignoreBotDetection?: boolean;
	/** Initial retry delay in ms (default: 500). Only used when `enableRetries` is true. */
	initialRetryDelay?: number;
	/** Glob patterns to mask sensitive paths (e.g. `['/users/*']`) */
	maskPatterns?: string[];
	/** Max retries for failed requests (default: 3). Only used when `enableRetries` is true. */
	maxRetries?: number;
	/** Sampling rate 0.0–1.0 (default: 1.0). Example: `0.5` = 50% of events sent. */
	samplingRate?: number;
	/** Custom browser bundle URL. Default: `'https://cdn.databuddy.cc/databuddy.js'` */
	scriptUrl?: string;
	/** SDK name for analytics (default: `'web'`). Override for custom integrations only. */
	sdk?: string;
	/** SDK version. Defaults to package.json version. */
	sdkVersion?: string;
	/** Glob patterns to skip tracking on matching paths (e.g. `['/admin/**']`) */
	skipPatterns?: string[];
	trackAttributes?: boolean;
	trackErrors?: boolean;
	trackHashChanges?: boolean;
	trackInteractions?: boolean;
	trackOutgoingLinks?: boolean;
	/** Track page performance metrics (default: true) */
	trackPerformance?: boolean;
	trackWebVitals?: boolean;
	/** Use 1x1 pixel image for tracking instead of script (default: false) */
	usePixel?: boolean;
}

export interface BaseEventProperties {
	__path?: string;
	__referrer?: string;
	__timestamp_ms?: number;
	__title?: string;
	language?: string;
	page_count?: number;
	sessionId?: string;
	sessionStartTime?: number;
	timezone?: string;
	utm_campaign?: string;
	utm_content?: string;
	utm_medium?: string;
	utm_source?: string;
	utm_term?: string;
	viewport_size?: string;
}

export interface EventProperties extends BaseEventProperties {
	[key: string]: string | number | boolean | null | undefined;
}

export interface EventTypeMap {
	button_click: {
		button_text?: string;
		button_type?: string;
		button_id?: string;
		element_class?: string;
	};

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

	screen_view: {
		page_count?: number;
		time_on_page?: number;
		scroll_depth?: number;
		interaction_count?: number;
	};

	web_vitals: {
		fcp?: number;
		lcp?: number;
		cls?: string;
		fid?: number;
		ttfb?: number;
		load_time?: number;
		dom_ready_time?: number;
		render_time?: number;
		request_time?: number;
	};

	[eventName: string]: EventProperties;
}

export type EventName = keyof EventTypeMap;

export type PropertiesForEvent<T extends EventName> =
	T extends keyof EventTypeMap
		? EventTypeMap[T] & EventProperties
		: EventProperties;

/** The global tracker instance at `window.databuddy` or `window.db`. */
export interface DatabuddyTracker {
	/** Reset user session — generates new anonymous and session IDs. */
	clear(): void;
	/** Force send all queued events immediately. */
	flush(): void;
	options: DatabuddyConfig;
	/** Manually track a page view. Called automatically on route changes. */
	screenView(properties?: Record<string, unknown>): void;
	/** Set properties attached to ALL future events (plan, role, A/B variant, etc.). */
	setGlobalProperties(properties: Record<string, unknown>): void;
	/** Track a custom event. */
	track(eventName: string, properties?: Record<string, unknown>): void;
}

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

/** HTML data attributes for declarative click tracking. Add `data-track="event_name"` to any element. */
export interface DataAttributes {
	"data-track": string;
	[key: `data-${string}`]: string;
}

export type TrackFunction = <T extends EventName>(
	eventName: T,
	properties?: PropertiesForEvent<T>
) => Promise<void>;

export type ScreenViewFunction = (properties?: Record<string, unknown>) => void;

export type SetGlobalPropertiesFunction = (properties: EventProperties) => void;
