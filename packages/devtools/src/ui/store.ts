import {
	createDatabuddyDevtoolsAdapter,
	type DatabuddyDevtoolsAdapter,
	type DatabuddyDevtoolsEvent,
	type DatabuddyFlagCatalogEntry,
	type DatabuddyFlagCatalogVariant,
	type DatabuddyFlagsSnapshot,
	type DatabuddyIdentitySnapshot,
	type DatabuddyQueueSnapshot,
	type DatabuddyTrackerSnapshot,
	type DiagnosticItem,
	type FlagCatalogState,
} from "../core";

export interface FlagMutationResult {
	error?: string;
	ok: boolean;
}

export interface CreateFlagInput {
	defaultValue: boolean;
	description?: string;
	key: string;
	type: "boolean" | "multivariant";
	variants?: DatabuddyFlagCatalogVariant[];
}

export interface UpdateFlagInput {
	defaultValue?: boolean;
	description?: string | null;
	status?: "active" | "inactive" | "archived";
	variants?: DatabuddyFlagCatalogVariant[];
}

interface Position {
	x: number;
	y: number;
}

interface Size {
	h: number;
	w: number;
}

type Corner = "tl" | "tr" | "bl" | "br";

export interface DevtoolsState {
	adminApiUrl: string | null;
	adminKey: string | null;
	catalog: FlagCatalogState;
	corner: Corner;
	diagnostics: DiagnosticItem[];
	events: DatabuddyDevtoolsEvent[];
	flags: DatabuddyFlagsSnapshot;
	identity: DatabuddyIdentitySnapshot;
	open: boolean;
	position: Position;
	queue: DatabuddyQueueSnapshot;
	size: Size;
	snapshot: DatabuddyTrackerSnapshot;
}

type Persisted = Pick<DevtoolsState, "open" | "corner" | "size">;

const STORAGE_KEY = "databuddy:devtools:v5";
const ADMIN_KEY_STORAGE_KEY = "databuddy:devtools:admin-key";
const ADMIN_URL_STORAGE_KEY = "databuddy:devtools:admin-url";
const TRAILING_SLASH_RE = /\/+$/;
export const DEFAULT_ADMIN_API_URL = "http://localhost:3001";
const DEFAULT_SIZE: Size = { w: 460, h: 560 };
const SNAPSHOT_POLL_MS = 750;
const TRACKER_EVENTS = ["scroll", "click", "keydown", "touchstart"] as const;
const EDGE_INSET = 16;

export const MIN_SIZE: Size = { w: 380, h: 420 };
export const MAX_SIZE: Size = { w: 720, h: 800 };
const PILL_SIZE: Size = { w: 110, h: 38 };

const VALID_CORNERS: readonly Corner[] = ["tl", "tr", "bl", "br"];

function isCorner(value: unknown): value is Corner {
	return (
		typeof value === "string" &&
		(VALID_CORNERS as readonly string[]).includes(value)
	);
}

function cornerToPosition(corner: Corner, size: Size): Position {
	if (typeof window === "undefined") {
		return { x: EDGE_INSET, y: EDGE_INSET };
	}
	const maxX = Math.max(EDGE_INSET, window.innerWidth - size.w - EDGE_INSET);
	const maxY = Math.max(EDGE_INSET, window.innerHeight - size.h - EDGE_INSET);
	const x = corner === "tl" || corner === "bl" ? EDGE_INSET : maxX;
	const y = corner === "tl" || corner === "tr" ? EDGE_INSET : maxY;
	return { x, y };
}

function nearestCorner(pos: Position, size: Size): Corner {
	if (typeof window === "undefined") {
		return "br";
	}
	const centerX = pos.x + size.w / 2;
	const centerY = pos.y + size.h / 2;
	const left = centerX < window.innerWidth / 2;
	const top = centerY < window.innerHeight / 2;
	if (top && left) {
		return "tl";
	}
	if (top) {
		return "tr";
	}
	if (left) {
		return "bl";
	}
	return "br";
}

function loadPersisted(): Persisted {
	const fallback: Persisted = {
		open: false,
		corner: "br",
		size: DEFAULT_SIZE,
	};
	if (typeof window === "undefined") {
		return fallback;
	}
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return fallback;
		}
		const parsed = JSON.parse(raw) as Partial<Persisted>;
		return {
			open: parsed.open ?? fallback.open,
			corner: isCorner(parsed.corner) ? parsed.corner : fallback.corner,
			size: parsed.size ?? fallback.size,
		};
	} catch {
		return fallback;
	}
}

function savePersisted(state: Persisted) {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// non-fatal — storage quota / private mode
	}
}

function loadAdminKey(): string | null {
	if (typeof window === "undefined") {
		return null;
	}
	try {
		return window.localStorage.getItem(ADMIN_KEY_STORAGE_KEY);
	} catch {
		return null;
	}
}

function saveAdminKey(key: string | null) {
	if (typeof window === "undefined") {
		return;
	}
	try {
		if (key === null) {
			window.localStorage.removeItem(ADMIN_KEY_STORAGE_KEY);
			return;
		}
		window.localStorage.setItem(ADMIN_KEY_STORAGE_KEY, key);
	} catch {
		// non-fatal
	}
}

function loadAdminApiUrl(): string | null {
	if (typeof window === "undefined") {
		return null;
	}
	try {
		return window.localStorage.getItem(ADMIN_URL_STORAGE_KEY);
	} catch {
		return null;
	}
}

function saveAdminApiUrl(url: string | null) {
	if (typeof window === "undefined") {
		return;
	}
	try {
		if (url === null) {
			window.localStorage.removeItem(ADMIN_URL_STORAGE_KEY);
			return;
		}
		window.localStorage.setItem(ADMIN_URL_STORAGE_KEY, url);
	} catch {
		// non-fatal
	}
}

function clampSize(size: Size): Size {
	return {
		w: Math.min(Math.max(MIN_SIZE.w, size.w), MAX_SIZE.w),
		h: Math.min(Math.max(MIN_SIZE.h, size.h), MAX_SIZE.h),
	};
}

function snapshotChanged(
	a: DatabuddyTrackerSnapshot,
	b: DatabuddyTrackerSnapshot
) {
	return (
		a.hasTracker !== b.hasTracker ||
		a.hasAlias !== b.hasAlias ||
		a.clientId !== b.clientId ||
		a.sessionId !== b.sessionId ||
		a.anonymousId !== b.anonymousId ||
		a.isDisabled !== b.isDisabled ||
		a.isOptedOut !== b.isOptedOut
	);
}

function queueChanged(a: DatabuddyQueueSnapshot, b: DatabuddyQueueSnapshot) {
	return (
		a.available !== b.available ||
		a.queues.batch !== b.queues.batch ||
		a.queues.track !== b.queues.track ||
		a.queues.vitals !== b.queues.vitals ||
		a.queues.errors !== b.queues.errors ||
		a.flushing.batch !== b.flushing.batch ||
		a.flushing.track !== b.flushing.track ||
		a.flushing.vitals !== b.flushing.vitals ||
		a.flushing.errors !== b.flushing.errors ||
		a.pageCount !== b.pageCount ||
		a.maxScrollDepth !== b.maxScrollDepth ||
		a.interactionCount !== b.interactionCount
	);
}

function flagsChanged(a: DatabuddyFlagsSnapshot, b: DatabuddyFlagsSnapshot) {
	if (a.available !== b.available || a.isReady !== b.isReady) {
		return true;
	}
	if ((a.config === null) !== (b.config === null)) {
		return true;
	}
	if (
		a.config &&
		b.config &&
		(a.config.cacheSize !== b.config.cacheSize ||
			a.config.isPending !== b.config.isPending ||
			a.config.disabled !== b.config.disabled ||
			a.config.user?.userId !== b.config.user?.userId ||
			a.config.user?.email !== b.config.user?.email)
	) {
		return true;
	}
	if (a.flags.length !== b.flags.length) {
		return true;
	}
	for (let i = 0; i < a.flags.length; i += 1) {
		const x = a.flags[i];
		const y = b.flags[i];
		if (
			x.key !== y.key ||
			x.enabled !== y.enabled ||
			x.value !== y.value ||
			x.variant !== y.variant ||
			x.source !== y.source
		) {
			return true;
		}
	}
	return false;
}

function diagnosticsChanged(a: DiagnosticItem[], b: DiagnosticItem[]) {
	if (a.length !== b.length) {
		return true;
	}
	for (let i = 0; i < a.length; i += 1) {
		if (
			a[i].id !== b[i].id ||
			a[i].status !== b[i].status ||
			a[i].label !== b[i].label
		) {
			return true;
		}
	}
	return false;
}

export type RuntimeTone = "ok" | "warn" | "danger";

export function runtimeStatus(snapshot: DatabuddyTrackerSnapshot): {
	tone: RuntimeTone;
	label: string;
} {
	if (snapshot.isDisabled || snapshot.isOptedOut) {
		return { tone: "warn", label: "DISABLED" };
	}
	if (snapshot.hasTracker) {
		return { tone: "ok", label: "LIVE" };
	}
	return { tone: "danger", label: "MISSING" };
}

class DevtoolsStore {
	private readonly adapter: DatabuddyDevtoolsAdapter;
	private readonly listeners = new Set<() => void>();
	private state: DevtoolsState;
	private snapshotPoll: ReturnType<typeof setInterval> | null = null;
	private adapterUnsub: (() => void) | null = null;
	private rafHandle: number | null = null;
	private domEventCleanup: (() => void) | null = null;

	constructor() {
		this.adapter = createDatabuddyDevtoolsAdapter();
		const persisted = loadPersisted();
		const size = clampSize(persisted.size);
		const activeSize = persisted.open ? size : PILL_SIZE;
		this.state = {
			...persisted,
			size,
			position: cornerToPosition(persisted.corner, activeSize),
			diagnostics: this.adapter.getDiagnostics(),
			events: this.adapter.getEvents(),
			flags: this.adapter.getFlagsSnapshot(),
			identity: this.adapter.getIdentitySnapshot(),
			queue: this.adapter.getQueueSnapshot(),
			snapshot: this.adapter.getSnapshot(),
			adminKey: loadAdminKey(),
			adminApiUrl: loadAdminApiUrl(),
			catalog: {
				status: "idle",
				entries: [],
				error: null,
				fetchedAt: null,
			},
		};
	}

	getState = (): DevtoolsState => this.state;

	getAdapter = (): DatabuddyDevtoolsAdapter => this.adapter;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		if (this.listeners.size === 1) {
			this.connect();
		}
		return () => {
			this.listeners.delete(listener);
			if (this.listeners.size === 0) {
				this.disconnect();
			}
		};
	};

	setOpen = (open: boolean) => {
		const size = open ? this.state.size : PILL_SIZE;
		this.commit({
			open,
			position: cornerToPosition(this.state.corner, size),
		});
	};

	toggleOpen = () => {
		this.setOpen(!this.state.open);
	};

	snapToCorner = (droppedAt: Position) => {
		const size = this.state.open ? this.state.size : PILL_SIZE;
		const corner = nearestCorner(droppedAt, size);
		this.commit({
			corner,
			position: cornerToPosition(corner, size),
		});
	};

	setSize = (size: Size) => {
		const next = clampSize(size);
		this.commit({
			size: next,
			position: cornerToPosition(this.state.corner, next),
		});
	};

	clampToViewport = () => {
		const size = this.state.open ? this.state.size : PILL_SIZE;
		this.commit({ position: cornerToPosition(this.state.corner, size) });
	};

	setAdminKey = (key: string | null) => {
		const trimmed = key?.trim() ?? "";
		const next = trimmed === "" ? null : trimmed;
		saveAdminKey(next);
		this.commit({ adminKey: next });
		if (next === null) {
			this.commit({
				catalog: {
					status: "idle",
					entries: [],
					error: null,
					fetchedAt: null,
				},
			});
			return;
		}
		this.fetchCatalog().catch(() => undefined);
	};

	setAdminApiUrl = (url: string | null) => {
		const trimmed = url?.trim().replace(TRAILING_SLASH_RE, "") ?? "";
		const next = trimmed === "" ? null : trimmed;
		saveAdminApiUrl(next);
		this.commit({ adminApiUrl: next });
		if (this.state.adminKey) {
			this.fetchCatalog().catch(() => undefined);
		}
	};

	private resolveWriteContext():
		| {
				baseUrl: string;
				clientId: string;
				key: string;
		  }
		| FlagMutationResult {
		const { adminKey } = this.state;
		if (!adminKey) {
			return { ok: false, error: "Paste an API key with manage:flags scope." };
		}
		const clientId =
			this.state.flags.config?.clientId ?? this.state.snapshot.clientId;
		if (!clientId) {
			return { ok: false, error: "Tracker has no clientId — reload the page." };
		}
		const baseUrl = this.state.adminApiUrl ?? DEFAULT_ADMIN_API_URL;
		return { baseUrl, clientId, key: adminKey };
	}

	private async readError(res: Response): Promise<string> {
		if (res.status === 401) {
			return "Invalid API key.";
		}
		if (res.status === 403) {
			return "Key lacks manage:flags for this client.";
		}
		try {
			const body = (await res.json()) as { error?: string };
			if (body.error) {
				return body.error;
			}
		} catch {
			// ignore
		}
		return `Request failed (${res.status}).`;
	}

	createFlag = async (input: CreateFlagInput): Promise<FlagMutationResult> => {
		const ctx = this.resolveWriteContext();
		if ("ok" in ctx) {
			return ctx;
		}
		try {
			const url = new URL("/public/v1/flags", ctx.baseUrl);
			const res = await fetch(url.toString(), {
				method: "POST",
				headers: {
					"x-api-key": ctx.key,
					"content-type": "application/json",
				},
				credentials: "omit",
				body: JSON.stringify({
					clientId: ctx.clientId,
					key: input.key,
					type: input.type,
					defaultValue: input.defaultValue,
					description: input.description,
					variants: input.variants,
				}),
			});
			if (!res.ok) {
				return { ok: false, error: await this.readError(res) };
			}
			await this.fetchCatalog();
			return { ok: true };
		} catch (err) {
			return {
				ok: false,
				error: err instanceof Error ? err.message : "Network error.",
			};
		}
	};

	updateFlag = async (
		id: string,
		input: UpdateFlagInput
	): Promise<FlagMutationResult> => {
		const ctx = this.resolveWriteContext();
		if ("ok" in ctx) {
			return ctx;
		}
		try {
			const url = new URL(
				`/public/v1/flags/${encodeURIComponent(id)}`,
				ctx.baseUrl
			);
			const res = await fetch(url.toString(), {
				method: "PATCH",
				headers: {
					"x-api-key": ctx.key,
					"content-type": "application/json",
				},
				credentials: "omit",
				body: JSON.stringify({ clientId: ctx.clientId, ...input }),
			});
			if (!res.ok) {
				return { ok: false, error: await this.readError(res) };
			}
			await this.fetchCatalog();
			return { ok: true };
		} catch (err) {
			return {
				ok: false,
				error: err instanceof Error ? err.message : "Network error.",
			};
		}
	};

	deleteFlag = async (id: string): Promise<FlagMutationResult> => {
		const ctx = this.resolveWriteContext();
		if ("ok" in ctx) {
			return ctx;
		}
		try {
			const url = new URL(
				`/public/v1/flags/${encodeURIComponent(id)}`,
				ctx.baseUrl
			);
			url.searchParams.set("clientId", ctx.clientId);
			const res = await fetch(url.toString(), {
				method: "DELETE",
				headers: { "x-api-key": ctx.key },
				credentials: "omit",
			});
			if (!res.ok) {
				return { ok: false, error: await this.readError(res) };
			}
			await this.fetchCatalog();
			return { ok: true };
		} catch (err) {
			return {
				ok: false,
				error: err instanceof Error ? err.message : "Network error.",
			};
		}
	};

	fetchCatalog = async () => {
		const { adminKey } = this.state;
		if (!adminKey) {
			this.commit({
				catalog: {
					status: "error",
					entries: [],
					error: "Paste an API key with manage:flags scope.",
					fetchedAt: null,
				},
			});
			return;
		}

		const flagsConfig = this.state.flags.config;
		const clientId = flagsConfig?.clientId ?? this.state.snapshot.clientId;
		const baseUrl = this.state.adminApiUrl ?? DEFAULT_ADMIN_API_URL;
		if (!clientId) {
			this.commit({
				catalog: {
					status: "error",
					entries: [],
					error: "Tracker has no clientId — reload the page.",
					fetchedAt: null,
				},
			});
			return;
		}

		this.commit({
			catalog: {
				status: "loading",
				entries: this.state.catalog.entries,
				error: null,
				fetchedAt: this.state.catalog.fetchedAt,
			},
		});

		try {
			const url = new URL("/public/v1/flags/definitions", baseUrl);
			url.searchParams.set("clientId", clientId);
			if (flagsConfig?.environment) {
				url.searchParams.set("environment", flagsConfig.environment);
			}
			const res = await fetch(url.toString(), {
				headers: { "x-api-key": adminKey },
				credentials: "omit",
			});
			if (!res.ok) {
				const message =
					res.status === 401
						? "Invalid API key."
						: res.status === 403
							? "Key lacks manage:flags for this client."
							: `Failed (${res.status}).`;
				this.commit({
					catalog: {
						status: "error",
						entries: [],
						error: message,
						fetchedAt: null,
					},
				});
				return;
			}
			const body = (await res.json()) as {
				flags?: DatabuddyFlagCatalogEntry[];
			};
			this.commit({
				catalog: {
					status: "ready",
					entries: Array.isArray(body.flags) ? body.flags : [],
					error: null,
					fetchedAt: Date.now(),
				},
			});
		} catch (err) {
			this.commit({
				catalog: {
					status: "error",
					entries: [],
					error: err instanceof Error ? err.message : "Network error.",
					fetchedAt: null,
				},
			});
		}
	};

	private commit(partial: Partial<DevtoolsState>) {
		this.state = { ...this.state, ...partial };
		savePersisted({
			open: this.state.open,
			corner: this.state.corner,
			size: this.state.size,
		});
		this.emit();
	}

	private emit() {
		for (const listener of this.listeners) {
			listener();
		}
	}

	private connect() {
		this.adapter.instrument();
		this.adapterUnsub = this.adapter.subscribe(() => {
			this.refreshAll();
		});
		this.refreshAll();
		this.snapshotPoll = setInterval(this.refreshAll, SNAPSHOT_POLL_MS);
		this.attachDomListeners();
		if (this.state.adminKey && this.state.catalog.status === "idle") {
			this.fetchCatalog().catch(() => undefined);
		}
	}

	private disconnect() {
		this.adapterUnsub?.();
		this.adapterUnsub = null;
		if (this.snapshotPoll) {
			clearInterval(this.snapshotPoll);
			this.snapshotPoll = null;
		}
		this.domEventCleanup?.();
		this.domEventCleanup = null;
		if (this.rafHandle !== null && typeof cancelAnimationFrame === "function") {
			cancelAnimationFrame(this.rafHandle);
			this.rafHandle = null;
		}
	}

	private attachDomListeners() {
		if (typeof window === "undefined") {
			return;
		}
		const handler = () => this.scheduleRefresh();
		for (const evt of TRACKER_EVENTS) {
			window.addEventListener(evt, handler, { passive: true, capture: true });
		}
		const onResize = () => this.clampToViewport();
		window.addEventListener("resize", onResize);
		this.domEventCleanup = () => {
			for (const evt of TRACKER_EVENTS) {
				window.removeEventListener(evt, handler, { capture: true });
			}
			window.removeEventListener("resize", onResize);
		};
	}

	private scheduleRefresh() {
		if (this.rafHandle !== null) {
			return;
		}
		if (typeof requestAnimationFrame !== "function") {
			this.refreshAll();
			return;
		}
		this.rafHandle = requestAnimationFrame(() => {
			this.rafHandle = null;
			this.refreshAll();
		});
	}

	private readonly refreshAll = () => {
		this.adapter.instrument();
		const nextSnapshot = this.adapter.getSnapshot();
		const nextQueue = this.adapter.getQueueSnapshot();
		const nextFlags = this.adapter.getFlagsSnapshot();
		const nextIdentity = this.adapter.getIdentitySnapshot();
		const nextDiagnostics = this.adapter.getDiagnostics();
		const nextEvents = this.adapter.getEvents();

		const prevClientId =
			this.state.flags.config?.clientId ?? this.state.snapshot.clientId;
		const nextClientId = nextFlags.config?.clientId ?? nextSnapshot.clientId;
		const clientIdBecameAvailable = !prevClientId && !!nextClientId;

		const eventsChanged = nextEvents !== this.state.events;
		const snapChanged = snapshotChanged(this.state.snapshot, nextSnapshot);
		const qChanged = queueChanged(this.state.queue, nextQueue);
		const fChanged = flagsChanged(this.state.flags, nextFlags);
		const dChanged = diagnosticsChanged(
			this.state.diagnostics,
			nextDiagnostics
		);

		if (!(eventsChanged || snapChanged || qChanged || fChanged || dChanged)) {
			return;
		}

		this.state = {
			...this.state,
			diagnostics: nextDiagnostics,
			events: nextEvents,
			flags: nextFlags,
			identity: nextIdentity,
			queue: nextQueue,
			snapshot: nextSnapshot,
		};
		this.emit();

		if (
			clientIdBecameAvailable &&
			this.state.adminKey &&
			this.state.catalog.status !== "loading" &&
			this.state.catalog.status !== "ready"
		) {
			this.fetchCatalog().catch(() => undefined);
		}
	};
}

export const store = new DevtoolsStore();
