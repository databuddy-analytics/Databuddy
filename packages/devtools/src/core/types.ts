export interface DatabuddyTrackerLike {
	clear?: () => void;
	flush?: () => void;
	options?: Record<string, unknown>;
	screenView?: (properties?: Record<string, unknown>) => void;
	setGlobalProperties?: (properties: Record<string, unknown>) => void;
	track?: (name: string, properties?: Record<string, unknown>) => void;
}

export type DatabuddyDevtoolsEventType =
	| "track"
	| "screen_view"
	| "flush"
	| "clear"
	| "status";

export interface DatabuddyDevtoolsEvent {
	id: string;
	name: string;
	properties?: Record<string, unknown>;
	timestamp: number;
	type: DatabuddyDevtoolsEventType;
}

export interface DatabuddyTrackerSnapshot {
	anonymousId: string | null;
	clientId: string | null;
	hasAlias: boolean;
	hasTracker: boolean;
	isDisabled: boolean;
	isOptedOut: boolean;
	options: Record<string, unknown> | null;
	sessionId: string | null;
}

export interface DatabuddyQueueSnapshot {
	available: boolean;
	debugMode: boolean;
	flushing: {
		batch: boolean;
		track: boolean;
		vitals: boolean;
		errors: boolean;
	};
	interactionCount: number | null;
	isLikelyBot: boolean;
	maxScrollDepth: number | null;
	pageCount: number | null;
	pageStartTime: number | null;
	queues: {
		batch: number;
		track: number;
		vitals: number;
		errors: number;
	};
}

export type DatabuddyFlagSource =
	| "server"
	| "cache"
	| "default"
	| "error"
	| "override";

export interface DatabuddyFlagEntry {
	enabled: boolean;
	key: string;
	reason?: string;
	source: DatabuddyFlagSource;
	value: unknown;
	variant?: string;
}

export interface DatabuddyFlagsConfig {
	apiUrl: string | null;
	autoFetch: boolean;
	cacheSize: number;
	cacheTtl: number | null;
	clientId: string | null;
	defaults: Record<string, boolean | string | number>;
	disabled: boolean;
	environment: string | null;
	isPending: boolean;
	skipStorage: boolean;
	staleTime: number | null;
	user: {
		email: string | null;
		organizationId: string | null;
		teamId: string | null;
		userId: string | null;
	} | null;
}

export interface DatabuddyFlagsSnapshot {
	available: boolean;
	config: DatabuddyFlagsConfig | null;
	flags: DatabuddyFlagEntry[];
	isReady: boolean;
}

export interface DatabuddyFlagCatalogVariant {
	description?: string;
	key: string;
	type: "string" | "number" | "json";
	value: string | number;
	weight?: number;
}

export interface DatabuddyFlagCatalogEntry {
	defaultValue: boolean;
	description: string | null;
	id: string;
	key: string;
	status: "active" | "inactive" | "archived";
	type: "boolean" | "rollout" | "multivariant";
	variants?: DatabuddyFlagCatalogVariant[];
}

export type FlagCatalogStatus = "idle" | "loading" | "ready" | "error";

export interface FlagCatalogState {
	entries: DatabuddyFlagCatalogEntry[];
	error: string | null;
	fetchedAt: number | null;
	status: FlagCatalogStatus;
}

export type DiagnosticStatus = "ok" | "warn" | "fail" | "info";

export interface DiagnosticItem {
	hint?: string;
	id: string;
	label: string;
	status: DiagnosticStatus;
}

export interface DatabuddyIdentitySnapshot {
	anonymousId: string | null;
	globalProperties: Record<string, unknown>;
	sessionAgeMs: number | null;
	sessionId: string | null;
	sessionStartedAt: number | null;
	storageKeys: Array<{
		scope: "local" | "session";
		key: string;
		value: string | null;
	}>;
	urlParams: Record<string, string>;
}

export type DatabuddyDebugAction =
	| "clear"
	| "flush"
	| "screenView"
	| "trackTest"
	| "trackCustom"
	| "resetSession"
	| "refreshFlags"
	| "setGlobalProperty"
	| "removeGlobalProperty"
	| "clearGlobalProperties"
	| "setFlagOverride"
	| "clearFlagOverride";

export interface DatabuddyDevtoolsAdapter {
	clearEvents: () => void;
	getDiagnostics: () => DiagnosticItem[];
	getEvents: () => DatabuddyDevtoolsEvent[];
	getFlagsSnapshot: () => DatabuddyFlagsSnapshot;
	getIdentitySnapshot: () => DatabuddyIdentitySnapshot;
	getQueueSnapshot: () => DatabuddyQueueSnapshot;
	getSnapshot: () => DatabuddyTrackerSnapshot;
	instrument: () => void;
	runAction: (
		action: DatabuddyDebugAction,
		properties?: Record<string, unknown>
	) => void;
	subscribe: (listener: () => void) => () => void;
}

declare global {
	interface Window {
		databuddy?: DatabuddyTrackerLike;
		databuddyConfig?: Record<string, unknown>;
		databuddyDisabled?: boolean;
		databuddyOptedOut?: boolean;
		db?: DatabuddyTrackerLike;
	}
}
