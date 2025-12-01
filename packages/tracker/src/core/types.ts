/** biome-ignore-all lint/style/useConsistentTypeDefinitions: Interfaces are needed for declaration merging */
export type TrackerOptions = {
	clientId: string;
	disabled?: boolean;
	apiUrl?: string;
	sdk?: string;
	sdkVersion?: string;

	// Features
	trackHashChanges?: boolean;
	trackAttributes?: boolean;
	trackOutgoingLinks?: boolean;
	trackPerformance?: boolean;
	trackWebVitals?: boolean;
	trackScrollDepth?: boolean;
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

export type EventContext = {
	path: string;
	title: string;
	referrer?: string;
	viewport_size?: string;
	timezone?: string;
	language: string;
	utm_source?: string;
	utm_medium?: string;
	utm_campaign?: string;
	utm_term?: string;
	utm_content?: string;
	dbid?: string;
};

export type BaseEvent = {
	eventId: string;
	name?: string;
	anonymousId?: string;
	sessionId?: string;
	sessionStartTime?: number;
	timestamp: number;
	type?: string;
	[key: string]: any;
};

export type TrackEvent = BaseEvent & {
	name: string;
};

export type WebVitalMetricName = "FCP" | "LCP" | "CLS" | "INP" | "TTFB" | "FPS";

export type WebVitalEvent = {
	timestamp: number;
	path: string;
	metricName: WebVitalMetricName;
	metricValue: number;
	anonymousId?: string;
	sessionId?: string;
};

export type ErrorSpan = {
	timestamp: number;
	path: string;
	message: string;
	filename?: string;
	lineno?: number;
	colno?: number;
	stack?: string;
	errorType: string;
	anonymousId?: string;
	sessionId?: string;
};

export type CustomEventSpan = {
	timestamp: number;
	path: string;
	eventName: string;
	anonymousId?: string;
	sessionId?: string;
	properties?: Record<string, unknown>;
};

export type DatabuddyGlobal = {
	track: (name: string, props?: Record<string, unknown>) => void;
	screenView: (props?: Record<string, unknown>) => void;
	clear: () => void;
	flush: () => void;
	setGlobalProperties: (props: Record<string, unknown>) => void;
	options: TrackerOptions;
};

declare global {
	interface Window {
		databuddy?: DatabuddyGlobal;
		db?: DatabuddyGlobal;
		databuddyOptedOut?: boolean;
		databuddyDisabled?: boolean;
		databuddyConfig?: TrackerOptions;
		databuddyOptOut?: () => void;
		databuddyOptIn?: () => void;
		callPhantom?: unknown;
		_phantom?: unknown;
		selenium?: unknown;
		webdriver?: unknown;
	}

	interface Document {
		prerendering?: boolean;
	}

	interface Navigator {
		webdriver?: boolean;
	}
}
