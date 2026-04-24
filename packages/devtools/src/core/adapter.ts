import type {
	DatabuddyDebugAction,
	DatabuddyDevtoolsAdapter,
	DatabuddyDevtoolsEvent,
	DatabuddyFlagEntry,
	DatabuddyFlagsConfig,
	DatabuddyFlagsSnapshot,
	DatabuddyIdentitySnapshot,
	DatabuddyQueueSnapshot,
	DatabuddyTrackerLike,
	DatabuddyTrackerSnapshot,
	DiagnosticItem,
} from "./types";

const MAX_EVENTS = 100;
const PATCHED = Symbol.for("databuddy.devtools.patched");

const STORAGE_KEYS = {
	local: [
		"did",
		"did_params",
		"db-flags",
		"databuddy_opt_out",
		"databuddy_disabled",
	],
	session: ["did_session", "did_session_timestamp", "did_session_start"],
} as const;

const BOT_UA_REGEX = /\b(headlesschrome|phantomjs|bot|spider|crawler)\b/i;

type PatchedTracker = DatabuddyTrackerLike & {
	[PATCHED]?: true;
};

interface InternalTrackerSnapshot {
	_meta?: Record<string, { flushing?: boolean }>;
	batchQueue?: unknown[];
	errorsQueue?: unknown[];
	globalProperties?: Record<string, unknown>;
	interactionCount?: number;
	isLikelyBot?: boolean;
	maxScrollDepth?: number;
	pageCount?: number;
	pageStartTime?: number;
	sessionStartTime?: number;
	trackQueue?: unknown[];
	urlParams?: Record<string, string>;
	vitalsQueue?: unknown[];
}

interface ManagerFlagResult {
	enabled: boolean;
	payload: Record<string, unknown> | null;
	reason: string;
	value: boolean | string | number;
	variant?: string;
}

interface BrowserFlagsManagerLike {
	getDevtoolsConfig?: () => DatabuddyFlagsConfig;
	getMemoryFlags: () => Record<
		string,
		{ enabled: boolean; value: unknown; variant?: string; reason?: string }
	>;
	isReady: () => boolean;
	refresh?: (
		forceClear?: boolean,
		options?: { force?: boolean }
	) => Promise<void>;
	setOverride?: (key: string, override: ManagerFlagResult | null) => void;
	subscribe: (cb: () => void) => () => void;
}

let events: DatabuddyDevtoolsEvent[] = [];
const listeners = new Set<() => void>();
let flagsUnsub: (() => void) | null = null;
let lastFlagsManager: BrowserFlagsManagerLike | null = null;

function isBrowser() {
	return typeof window !== "undefined";
}

function getTracker(): DatabuddyTrackerLike | null {
	if (!isBrowser()) {
		return null;
	}

	return window.databuddy ?? window.db ?? null;
}

function getInternalTracker(): InternalTrackerSnapshot | null {
	if (!isBrowser()) {
		return null;
	}
	const w = window as unknown as { __tracker?: InternalTrackerSnapshot };
	return w.__tracker ?? null;
}

function getFlagsManager(): BrowserFlagsManagerLike | null {
	if (!isBrowser()) {
		return null;
	}
	const w = window as unknown as { __databuddyFlags?: BrowserFlagsManagerLike };
	return w.__databuddyFlags ?? null;
}

function getOptions(tracker: DatabuddyTrackerLike | null) {
	if (!isBrowser()) {
		return null;
	}

	return tracker?.options ?? window.databuddyConfig ?? null;
}

function getStorageValue(storage: Storage | undefined, key: string) {
	try {
		return storage?.getItem(key) ?? null;
	} catch {
		return null;
	}
}

function notify() {
	for (const listener of listeners) {
		listener();
	}
}

function appendEvent(event: Omit<DatabuddyDevtoolsEvent, "id" | "timestamp">) {
	events = [
		{
			...event,
			id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
			timestamp: Date.now(),
		},
		...events,
	].slice(0, MAX_EVENTS);
	notify();
}

function sanitizeProperties(
	value: unknown
): Record<string, unknown> | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return;
	}

	return value as Record<string, unknown>;
}

export function getDatabuddySnapshot(): DatabuddyTrackerSnapshot {
	if (!isBrowser()) {
		return {
			anonymousId: null,
			clientId: null,
			hasAlias: false,
			hasTracker: false,
			isDisabled: false,
			isOptedOut: false,
			options: null,
			sessionId: null,
		};
	}

	const tracker = getTracker();
	const options = getOptions(tracker);
	const clientId =
		typeof options?.clientId === "string" ? options.clientId : null;

	return {
		anonymousId: getStorageValue(window.localStorage, "did"),
		clientId,
		hasAlias: Boolean(window.db),
		hasTracker: Boolean(window.databuddy),
		isDisabled: Boolean(window.databuddyDisabled),
		isOptedOut: Boolean(window.databuddyOptedOut),
		options,
		sessionId: getStorageValue(window.sessionStorage, "did_session"),
	};
}

export function getDatabuddyQueueSnapshot(): DatabuddyQueueSnapshot {
	const internal = getInternalTracker();
	if (!internal) {
		return {
			available: false,
			debugMode: false,
			queues: { batch: 0, track: 0, vitals: 0, errors: 0 },
			flushing: { batch: false, track: false, vitals: false, errors: false },
			pageStartTime: null,
			pageCount: null,
			maxScrollDepth: null,
			interactionCount: null,
			isLikelyBot: false,
		};
	}

	return {
		available: true,
		debugMode: true,
		queues: {
			batch: internal.batchQueue?.length ?? 0,
			track: internal.trackQueue?.length ?? 0,
			vitals: internal.vitalsQueue?.length ?? 0,
			errors: internal.errorsQueue?.length ?? 0,
		},
		flushing: {
			batch: Boolean(internal._meta?.batch?.flushing),
			track: Boolean(internal._meta?.track?.flushing),
			vitals: Boolean(internal._meta?.vitals?.flushing),
			errors: Boolean(internal._meta?.errors?.flushing),
		},
		pageStartTime: internal.pageStartTime ?? null,
		pageCount: internal.pageCount ?? null,
		maxScrollDepth: internal.maxScrollDepth ?? null,
		interactionCount: internal.interactionCount ?? null,
		isLikelyBot: Boolean(internal.isLikelyBot),
	};
}

function reasonToSource(reason?: string): DatabuddyFlagEntry["source"] {
	if (!reason) {
		return "default";
	}
	if (reason === "ERROR" || reason === "NO_PROVIDER") {
		return "error";
	}
	if (reason === "DEFAULT") {
		return "default";
	}
	if (reason === "CACHE") {
		return "cache";
	}
	if (reason === "OVERRIDE") {
		return "override";
	}
	return "server";
}

export function getDatabuddyFlagsSnapshot(): DatabuddyFlagsSnapshot {
	const manager = getFlagsManager();
	if (!manager) {
		return { available: false, config: null, isReady: false, flags: [] };
	}

	const memory = manager.getMemoryFlags();
	const flags: DatabuddyFlagEntry[] = Object.entries(memory).map(
		([key, result]) => ({
			key,
			enabled: result.enabled,
			value: result.value,
			variant: result.variant,
			reason: result.reason,
			source: reasonToSource(result.reason),
		})
	);

	flags.sort((a, b) => a.key.localeCompare(b.key));

	return {
		available: true,
		config: manager.getDevtoolsConfig?.() ?? null,
		isReady: manager.isReady(),
		flags,
	};
}

export function getDatabuddyIdentitySnapshot(): DatabuddyIdentitySnapshot {
	if (!isBrowser()) {
		return {
			anonymousId: null,
			sessionId: null,
			sessionAgeMs: null,
			sessionStartedAt: null,
			urlParams: {},
			storageKeys: [],
			globalProperties: {},
		};
	}

	const internal = getInternalTracker();
	const startedAtRaw = getStorageValue(
		window.sessionStorage,
		"did_session_start"
	);
	const sessionStartedAt = startedAtRaw
		? Number.parseInt(startedAtRaw, 10)
		: null;
	const sessionAgeMs = sessionStartedAt ? Date.now() - sessionStartedAt : null;

	const storageKeys: DatabuddyIdentitySnapshot["storageKeys"] = [
		...STORAGE_KEYS.local.map((key) => ({
			scope: "local" as const,
			key,
			value: getStorageValue(window.localStorage, key),
		})),
		...STORAGE_KEYS.session.map((key) => ({
			scope: "session" as const,
			key,
			value: getStorageValue(window.sessionStorage, key),
		})),
	];

	return {
		anonymousId: getStorageValue(window.localStorage, "did"),
		sessionId: getStorageValue(window.sessionStorage, "did_session"),
		sessionAgeMs,
		sessionStartedAt,
		urlParams: internal?.urlParams ?? {},
		storageKeys,
		globalProperties: internal?.globalProperties ?? {},
	};
}

function detectBotFromUserAgent(): boolean {
	if (!isBrowser()) {
		return false;
	}
	try {
		return BOT_UA_REGEX.test(navigator.userAgent ?? "");
	} catch {
		return false;
	}
}

export function getDatabuddyDiagnostics(): DiagnosticItem[] {
	const snapshot = getDatabuddySnapshot();
	const queue = getDatabuddyQueueSnapshot();
	const flags = getDatabuddyFlagsSnapshot();
	const items: DiagnosticItem[] = [];

	const scriptEl = isBrowser()
		? document.querySelector<HTMLScriptElement>(
				"script[data-databuddy-injected]"
			)
		: null;
	const scriptDataClientId = scriptEl?.getAttribute("data-client-id") ?? null;

	items.push({
		id: "script_injected",
		label: "Script tag injected",
		status: scriptEl ? "ok" : "fail",
		hint: scriptEl
			? undefined
			: "No <script data-databuddy-injected> in the DOM. The <Databuddy /> wrapper either never mounted, returned early because clientId could not be resolved, or dropped its props before reaching createScript.",
	});

	if (scriptEl) {
		items.push({
			id: "script_has_client_id",
			label: "Script has data-client-id",
			status: scriptDataClientId ? "ok" : "fail",
			hint: scriptDataClientId
				? undefined
				: "Script tag is in the DOM but data-client-id is missing. The wrapper component is not forwarding the clientId prop — check the wrapper's props declaration (e.g. Vue components must declare runtime props, not just TypeScript types).",
		});
	}

	items.push({
		id: "tracker",
		label: "Tracker loaded",
		status: snapshot.hasTracker ? "ok" : "fail",
		hint: snapshot.hasTracker
			? undefined
			: scriptEl
				? scriptDataClientId
					? "Script tag is present with a client ID, but window.databuddy is undefined. The bundle failed to boot — check the Network tab for the script response and the Console for errors."
					: "Script tag is present but window.databuddy is undefined. The bundle can't boot without data-client-id."
				: "window.databuddy is not defined and no script tag was injected. Fix 'Script tag injected' above first.",
	});

	items.push({
		id: "client_id",
		label: "Client ID present",
		status: snapshot.clientId ? "ok" : "fail",
		hint: snapshot.clientId
			? undefined
			: "options.clientId is missing or empty.",
	});

	if (snapshot.isDisabled) {
		items.push({
			id: "disabled",
			label: "Tracker disabled",
			status: "warn",
			hint: "window.databuddyDisabled is true. Events will not be sent.",
		});
	}

	if (snapshot.isOptedOut) {
		items.push({
			id: "opt_out",
			label: "User opted out",
			status: "warn",
			hint: "User has opted out via databuddyOptOut(). Call databuddyOptIn() to resume.",
		});
	}

	items.push({
		id: "anon_id",
		label: "Anonymous ID generated",
		status: snapshot.anonymousId ? "ok" : "warn",
		hint: snapshot.anonymousId
			? undefined
			: "No anonymous ID in localStorage. Storage may be blocked.",
	});

	items.push({
		id: "session_id",
		label: "Session active",
		status: snapshot.sessionId ? "ok" : "warn",
		hint: snapshot.sessionId
			? undefined
			: "No session in sessionStorage. Tracker may not have initialized yet.",
	});

	const sampling = Number(snapshot.options?.samplingRate ?? 1);
	if (sampling < 1) {
		items.push({
			id: "sampling",
			label: `Sampling rate ${Math.round(sampling * 100)}%`,
			status: sampling < 0.5 ? "warn" : "info",
			hint: "Some events will be dropped at random.",
		});
	}

	if (queue.isLikelyBot) {
		items.push({
			id: "bot",
			label: "Bot user-agent detected",
			status: "warn",
			hint: "Tracker treats this client as a bot and skips events.",
		});
	} else if (detectBotFromUserAgent()) {
		items.push({
			id: "bot_ua",
			label: "Bot-like user agent",
			status: "warn",
			hint: "User-agent matches a bot signature. Tracker may skip events.",
		});
	}

	items.push({
		id: "events",
		label:
			events.length > 0
				? `${events.length} event(s) captured`
				: "No events captured",
		status: events.length > 0 ? "ok" : "info",
		hint:
			events.length > 0
				? undefined
				: "Trigger a page view or call databuddy.track(...).",
	});

	if (isBrowser()) {
		items.push({
			id: "network",
			label: navigator.onLine ? "Network online" : "Network offline",
			status: navigator.onLine ? "ok" : "warn",
		});
	}

	if (queue.available) {
		const queuedTotal =
			queue.queues.batch +
			queue.queues.track +
			queue.queues.vitals +
			queue.queues.errors;
		if (queuedTotal > 0) {
			items.push({
				id: "queue_pending",
				label: `${queuedTotal} event(s) queued, awaiting flush`,
				status: "info",
			});
		}
	} else {
		items.push({
			id: "queue_unavailable",
			label: "Queue inspection unavailable",
			status: "info",
			hint: "Add ?debug=true (or data-debug) to expose window.__tracker.",
		});
	}

	items.push({
		id: "flags",
		label: flags.available
			? flags.isReady
				? `Flags ready (${flags.flags.length})`
				: "Flags loading"
			: "Flags provider not detected",
		status: flags.available ? (flags.isReady ? "ok" : "info") : "info",
		hint: flags.available
			? undefined
			: "Wrap your app in <FlagsProvider> from @databuddy/sdk/react to enable flag inspection.",
	});

	return items;
}

function syncFlagsSubscription() {
	const flagsManager = getFlagsManager();
	if (flagsManager === lastFlagsManager) {
		return;
	}
	flagsUnsub?.();
	lastFlagsManager = flagsManager;
	flagsUnsub = flagsManager ? flagsManager.subscribe(notify) : null;
}

export function instrumentDatabuddy() {
	syncFlagsSubscription();

	const tracker = getTracker() as PatchedTracker | null;

	if (!(tracker && !tracker[PATCHED])) {
		return;
	}

	const originalTrack = tracker.track?.bind(tracker);
	const originalScreenView = tracker.screenView?.bind(tracker);
	const originalFlush = tracker.flush?.bind(tracker);
	const originalClear = tracker.clear?.bind(tracker);

	if (originalTrack) {
		tracker.track = (name, properties) => {
			appendEvent({
				name,
				properties: sanitizeProperties(properties),
				type: "track",
			});
			return originalTrack(name, properties);
		};
	}

	if (originalScreenView) {
		tracker.screenView = (properties) => {
			appendEvent({
				name: "screen_view",
				properties: sanitizeProperties(properties),
				type: "screen_view",
			});
			return originalScreenView(properties);
		};
	}

	if (originalFlush) {
		tracker.flush = () => {
			appendEvent({ name: "flush", type: "flush" });
			return originalFlush();
		};
	}

	if (originalClear) {
		tracker.clear = () => {
			appendEvent({ name: "clear", type: "clear" });
			return originalClear();
		};
	}

	tracker[PATCHED] = true;
}

function resetSession() {
	if (!isBrowser()) {
		return;
	}
	try {
		window.sessionStorage.removeItem("did_session");
		window.sessionStorage.removeItem("did_session_timestamp");
		window.sessionStorage.removeItem("did_session_start");
	} catch {
		// storage blocked
	}
	appendEvent({
		name: "session_reset",
		type: "status",
	});
}

function removeGlobalProperty(key: string) {
	const internal = getInternalTracker();
	if (!internal?.globalProperties) {
		return;
	}
	const next = { ...internal.globalProperties };
	delete next[key];
	internal.globalProperties = next;
}

function clearGlobalProperties() {
	const internal = getInternalTracker();
	if (!internal) {
		return;
	}
	internal.globalProperties = {};
}

export function runDatabuddyDebugAction(
	action: DatabuddyDebugAction,
	properties?: Record<string, unknown>
) {
	if (action === "resetSession") {
		resetSession();
		return;
	}

	if (action === "refreshFlags") {
		const flagsManager = getFlagsManager();
		flagsManager?.refresh?.(true, { force: true }).catch(() => {
			// non-fatal
		});
		appendEvent({
			name: "flags_refresh",
			type: "status",
		});
		return;
	}

	if (action === "setFlagOverride") {
		const key = typeof properties?.__key === "string" ? properties.__key : null;
		if (!key) {
			return;
		}
		const rawValue = properties?.__value;
		const value: boolean | string | number =
			typeof rawValue === "boolean" ||
			typeof rawValue === "string" ||
			typeof rawValue === "number"
				? rawValue
				: Boolean(properties?.__enabled);
		const variant =
			typeof properties?.__variant === "string" &&
			properties.__variant.length > 0
				? properties.__variant
				: undefined;
		getFlagsManager()?.setOverride?.(key, {
			enabled: Boolean(properties?.__enabled),
			payload: null,
			reason: "OVERRIDE",
			value,
			variant,
		});
		appendEvent({
			name: "flag_override_set",
			properties: { key },
			type: "status",
		});
		return;
	}

	if (action === "clearFlagOverride") {
		const key = typeof properties?.__key === "string" ? properties.__key : null;
		if (!key) {
			return;
		}
		getFlagsManager()?.setOverride?.(key, null);
		appendEvent({
			name: "flag_override_cleared",
			properties: { key },
			type: "status",
		});
		return;
	}

	const tracker = getTracker();

	if (!tracker) {
		appendEvent({
			name: "tracker_missing",
			properties: { action },
			type: "status",
		});
		return;
	}

	if (action === "trackTest") {
		tracker.track?.("databuddy_devtools_test", {
			source: "databuddy-devtools",
			...properties,
		});
		return;
	}

	if (action === "trackCustom") {
		const name =
			typeof properties?.__name === "string" ? properties.__name : null;
		if (!name) {
			appendEvent({
				name: "track_custom_missing_name",
				type: "status",
			});
			return;
		}
		const { __name: _name, ...payload } = properties ?? {};
		tracker.track?.(name, payload);
		return;
	}

	if (action === "screenView") {
		tracker.screenView?.({ source: "databuddy-devtools", ...properties });
		return;
	}

	if (action === "setGlobalProperty") {
		const key = typeof properties?.__key === "string" ? properties.__key : null;
		if (!key) {
			return;
		}
		tracker.setGlobalProperties?.({ [key]: properties?.__value });
		notify();
		return;
	}

	if (action === "removeGlobalProperty") {
		const key = typeof properties?.__key === "string" ? properties.__key : null;
		if (!key) {
			return;
		}
		removeGlobalProperty(key);
		notify();
		return;
	}

	if (action === "clearGlobalProperties") {
		clearGlobalProperties();
		notify();
		return;
	}

	tracker[action]?.();
}

export function createDatabuddyDevtoolsAdapter(): DatabuddyDevtoolsAdapter {
	return {
		clearEvents: () => {
			events = [];
			notify();
		},
		getDiagnostics: getDatabuddyDiagnostics,
		getEvents: () => events,
		getFlagsSnapshot: getDatabuddyFlagsSnapshot,
		getIdentitySnapshot: getDatabuddyIdentitySnapshot,
		getQueueSnapshot: getDatabuddyQueueSnapshot,
		getSnapshot: getDatabuddySnapshot,
		instrument: instrumentDatabuddy,
		runAction: runDatabuddyDebugAction,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}
