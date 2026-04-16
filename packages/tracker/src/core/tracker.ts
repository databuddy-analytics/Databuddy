import { HttpClient } from "./client";
import type {
	BaseEvent,
	ErrorSpan,
	EventContext,
	TrackEventPayload,
	TrackerOptions,
	WebVitalEvent,
} from "./types";
import { generateUUIDv4, isDebugMode, isLocalhost, logger } from "./utils";

const TRACKED_PARAMS: Record<string, boolean> = {
	gclid: true,
	fbclid: true,
	ttclid: true,
	twclid: true,
	li_fat_id: true,
	msclkid: true,
	utm_source: false,
	utm_medium: false,
	utm_campaign: false,
	utm_term: false,
	utm_content: false,
};
const DID_PARAMS_KEY = "did_params";

const HEADLESS_CHROME_REGEX = /\bHeadlessChrome\b/i;
const PHANTOMJS_REGEX = /\bPhantomJS\b/i;
const ANON_ID_PATTERN = /^anon_[0-9a-f-]{36}$/;
const SESSION_ID_PATTERN = /^[0-9a-f-]{36}$/;

interface QueueMeta<T> {
	endpoint: string;
	flushing: boolean;
	onFailure?: (items: T[]) => void;
	queryParam: string;
	threshold: number;
	timer: Timer | null;
}

export class BaseTracker {
	options: TrackerOptions;
	api: HttpClient;

	anonymousId?: string;
	sessionId?: string;
	sessionStartTime = 0;

	pageCount = 0;
	lastPath = "";
	interactionCount = 0;
	maxScrollDepth = 0;
	pageStartTime = Date.now();

	private readonly cachedTimezone: string | undefined;

	isLikelyBot = false;

	batchQueue: BaseEvent[] = [];
	vitalsQueue: WebVitalEvent[] = [];
	errorsQueue: ErrorSpan[] = [];
	trackQueue: TrackEventPayload[] = [];

	// One meta entry per queue: holds timer/flushing state + flush config.
	// Public flushBatch/flushVitals/flushErrors/flushTrack remain as thin
	// wrappers for backwards-compat with tests + index.ts.
	protected _meta!: {
		batch: QueueMeta<BaseEvent>;
		vitals: QueueMeta<WebVitalEvent>;
		errors: QueueMeta<ErrorSpan>;
		track: QueueMeta<TrackEventPayload>;
	};

	private readonly routeChangeCallbacks: Array<(path: string) => void> = [];

	protected urlParams: Record<string, string> = {};

	constructor(options: TrackerOptions) {
		if (!options.clientId || typeof options.clientId !== "string") {
			throw new Error("[Databuddy] clientId is required and must be a string");
		}

		this.options = {
			disabled: false,
			samplingRate: 1.0,
			enableRetries: true,
			maxRetries: 3,
			initialRetryDelay: 500,
			enableBatching: true,
			batchSize: 10,
			batchTimeout: 5000,
			sdk: "web",
			sdkVersion: "2.0.0",
			...options,
		};

		const effectiveMaxRetries =
			this.options.enableRetries === false ? 0 : (this.options.maxRetries ?? 3);

		this.api = new HttpClient({
			baseUrl: this.options.apiUrl || "https://basket.databuddy.cc",
			defaultHeaders: {
				"databuddy-client-id": this.options.clientId,
				"databuddy-sdk-name": this.options.sdk || "web",
				"databuddy-sdk-version": this.options.sdkVersion || "2.0.0",
			},
			maxRetries: effectiveMaxRetries,
			initialRetryDelay: this.options.initialRetryDelay ?? 500,
		});

		this._meta = {
			batch: {
				timer: null,
				flushing: false,
				endpoint: "/batch",
				queryParam: "client_id",
				threshold: this.options.batchSize || 10,
				onFailure: (items) => {
					for (const evt of items) {
						this.send({ ...evt, isForceSend: true });
					}
				},
			},
			vitals: {
				timer: null,
				flushing: false,
				endpoint: "/vitals",
				queryParam: "client_id",
				threshold: 6,
			},
			errors: {
				timer: null,
				flushing: false,
				endpoint: "/errors",
				queryParam: "client_id",
				threshold: 10,
			},
			track: {
				timer: null,
				flushing: false,
				endpoint: "/track",
				queryParam: "website_id",
				threshold: 10,
			},
		};

		if (this.isServer()) {
			return;
		}

		this.isLikelyBot = this.detectBot();
		if (this.isLikelyBot) {
			logger.log("Bot detected, tracking might be filtered");
		}

		try {
			this.cachedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		} catch {}

		this.anonymousId = this.getOrCreateAnonymousId();
		this.sessionId = this.getOrCreateSessionId();
		this.sessionStartTime = this.getSessionStartTime();
		this.refreshUrlParams();
		logger.log("Tracker initialized", this.options);
	}

	isServer(): boolean {
		return (
			typeof document === "undefined" ||
			typeof window === "undefined" ||
			typeof localStorage === "undefined"
		);
	}

	detectBot(): boolean {
		if (this.isServer() || this.options.ignoreBotDetection) {
			return false;
		}

		const ua = navigator.userAgent || "";
		const isHeadless =
			HEADLESS_CHROME_REGEX.test(ua) || PHANTOMJS_REGEX.test(ua);

		return Boolean(
			navigator.webdriver ||
				window.webdriver ||
				isHeadless ||
				window.callPhantom ||
				window._phantom ||
				window.selenium ||
				document.documentElement.getAttribute("webdriver") === "true"
		);
	}

	getOrCreateAnonymousId(): string {
		if (this.isServer()) {
			return this.generateAnonymousId();
		}

		const urlParams = new URLSearchParams(window.location.search);
		const anonId = urlParams.get("anonId");
		if (anonId && ANON_ID_PATTERN.test(anonId)) {
			localStorage.setItem("did", anonId);
			return anonId;
		}

		const storedId = localStorage.getItem("did");
		if (storedId) {
			return storedId;
		}

		const newId = this.generateAnonymousId();
		localStorage.setItem("did", newId);
		return newId;
	}

	generateAnonymousId(): string {
		return `anon_${generateUUIDv4()}`;
	}

	getOrCreateSessionId(): string {
		if (this.isServer()) {
			return this.generateSessionId();
		}

		const urlParams = new URLSearchParams(window.location.search);
		const sessionIdFromUrl = urlParams.get("sessionId");
		if (sessionIdFromUrl && SESSION_ID_PATTERN.test(sessionIdFromUrl)) {
			sessionStorage.setItem("did_session", sessionIdFromUrl);
			sessionStorage.setItem("did_session_timestamp", Date.now().toString());
			return sessionIdFromUrl;
		}

		const storedId = sessionStorage.getItem("did_session");
		const sessionTimestamp = sessionStorage.getItem("did_session_timestamp");

		if (storedId && sessionTimestamp) {
			const sessionAge = Date.now() - Number.parseInt(sessionTimestamp, 10);
			if (sessionAge < 30 * 60 * 1000) {
				sessionStorage.setItem("did_session_timestamp", Date.now().toString());
				return storedId;
			}
			sessionStorage.removeItem("did_session");
			sessionStorage.removeItem("did_session_timestamp");
			sessionStorage.removeItem("did_session_start");
		}

		const newId = this.generateSessionId();
		sessionStorage.setItem("did_session", newId);
		sessionStorage.setItem("did_session_timestamp", Date.now().toString());
		return newId;
	}

	generateSessionId(): string {
		return `sess_${generateUUIDv4()}`;
	}

	getSessionStartTime(): number {
		if (this.isServer()) {
			return Date.now();
		}

		const storedTime = sessionStorage.getItem("did_session_start");
		if (storedTime) {
			return Number.parseInt(storedTime, 10);
		}

		const now = Date.now();
		sessionStorage.setItem("did_session_start", now.toString());
		return now;
	}

	protected shouldSkipTracking(): boolean {
		if (this.isServer() || this.options.disabled || this.isLikelyBot) {
			return true;
		}

		if (!isDebugMode() && isLocalhost()) {
			return true;
		}

		if (this.options.skipPatterns) {
			const pathname = window.location.pathname;
			for (const pattern of this.options.skipPatterns) {
				if (pattern === pathname) {
					return true;
				}
				const starIndex = pattern.indexOf("*");
				if (
					starIndex !== -1 &&
					pathname.startsWith(pattern.slice(0, starIndex))
				) {
					return true;
				}
			}
		}
		return false;
	}

	protected getMaskedPath(): string {
		if (this.isServer()) {
			return "";
		}

		const pathname = window.location.pathname;
		if (!this.options.maskPatterns) {
			return pathname;
		}

		for (const pattern of this.options.maskPatterns) {
			const starIndex = pattern.indexOf("*");
			if (starIndex === -1) {
				continue;
			}

			const prefix = pattern.slice(0, starIndex);
			if (pathname.startsWith(prefix)) {
				if (pattern.slice(starIndex, starIndex + 2) === "**") {
					return `${prefix}*`;
				}
				const remainder = pathname.slice(prefix.length);
				const nextSlash = remainder.indexOf("/");
				return `${prefix}*${nextSlash === -1 ? "" : remainder.slice(nextSlash)}`;
			}
		}
		return pathname;
	}

	protected refreshUrlParams(): void {
		if (this.isServer()) {
			return;
		}
		const search = new URLSearchParams(window.location.search);
		const params: Record<string, string> = {};
		const persist: Record<string, string> = {};

		let stored: Record<string, string> = {};
		try {
			stored = JSON.parse(localStorage.getItem(DID_PARAMS_KEY) ?? "{}");
		} catch {
			/* ignore */
		}

		for (const [key, shouldPersist] of Object.entries(TRACKED_PARAMS)) {
			const val = search.get(key) ?? (shouldPersist ? stored[key] : undefined);
			if (val) {
				params[key] = val;
				if (shouldPersist) {
					persist[key] = val;
				}
			}
		}

		if (Object.keys(persist).length > 0) {
			try {
				localStorage.setItem(DID_PARAMS_KEY, JSON.stringify(persist));
			} catch {
				/* ignore */
			}
		}

		this.urlParams = params;
	}

	protected clearUrlParamStorage(): void {
		this.urlParams = {};
		if (!this.isServer()) {
			try {
				localStorage.removeItem(DID_PARAMS_KEY);
			} catch {
				/* ignore */
			}
		}
	}

	getBaseContext(): EventContext {
		if (this.isServer()) {
			return {} as EventContext;
		}

		let width: number | undefined = window.innerWidth;
		let height: number | undefined = window.innerHeight;
		if (width < 240 || width > 10_000 || height < 240 || height > 10_000) {
			width = undefined;
			height = undefined;
		}

		return {
			path:
				window.location.origin +
				this.getMaskedPath() +
				window.location.search +
				window.location.hash,
			title: document.title,
			referrer: document.referrer || "direct",
			viewport_size: width && height ? `${width}x${height}` : undefined,
			timezone: this.cachedTimezone,
			language: navigator.language,
			...this.urlParams,
		};
	}

	send(event: BaseEvent & { isForceSend?: boolean }): Promise<unknown> {
		if (this.shouldSkipTracking()) {
			return Promise.resolve();
		}
		if (this.options.filter && !this.options.filter(event)) {
			return Promise.resolve();
		}

		const samplingRate = this.options.samplingRate ?? 1.0;
		if (samplingRate < 1.0 && Math.random() > samplingRate) {
			return Promise.resolve();
		}

		if (this.options.enableBatching && !event.isForceSend) {
			return this.addToBatch(event);
		}

		return this.api.fetch(
			"/",
			event,
			{ keepalive: true },
			{ client_id: this.options.clientId }
		);
	}

	private _enqueue<T>(queue: T[], meta: QueueMeta<T>, item: T): void {
		queue.push(item);
		if (meta.timer === null) {
			meta.timer = setTimeout(
				() => this._flushQueue(queue, meta),
				this.options.batchTimeout
			);
		}
		if (queue.length >= meta.threshold) {
			this._flushQueue(queue, meta);
		}
	}

	private async _flushQueue<T>(
		queue: T[],
		meta: QueueMeta<T>
	): Promise<unknown> {
		if (meta.flushing) {
			return;
		}
		if (meta.timer) {
			clearTimeout(meta.timer);
			meta.timer = null;
		}
		if (queue.length === 0) {
			return;
		}

		meta.flushing = true;
		const items = queue.slice();
		queue.length = 0;

		try {
			return await this.api.fetch(
				meta.endpoint,
				items,
				{ keepalive: true },
				{ [meta.queryParam]: this.options.clientId }
			);
		} catch {
			meta.onFailure?.(items);
			return null;
		} finally {
			meta.flushing = false;
		}
	}

	addToBatch(event: BaseEvent): Promise<void> {
		this._enqueue(this.batchQueue, this._meta.batch, event);
		return Promise.resolve();
	}

	flushBatch() {
		return this._flushQueue(this.batchQueue, this._meta.batch);
	}

	sendVital(event: WebVitalEvent): Promise<void> {
		if (this.shouldSkipTracking()) {
			return Promise.resolve();
		}
		this._enqueue(this.vitalsQueue, this._meta.vitals, event);
		return Promise.resolve();
	}

	flushVitals() {
		return this._flushQueue(this.vitalsQueue, this._meta.vitals);
	}

	sendError(error: ErrorSpan): Promise<void> {
		if (this.shouldSkipTracking()) {
			return Promise.resolve();
		}
		this._enqueue(this.errorsQueue, this._meta.errors, error);
		return Promise.resolve();
	}

	flushErrors() {
		return this._flushQueue(this.errorsQueue, this._meta.errors);
	}

	trackEvent(
		name: string,
		properties?: Record<string, unknown>
	): Promise<void> {
		if (this.shouldSkipTracking()) {
			return Promise.resolve();
		}

		const event: TrackEventPayload = {
			name,
			timestamp: Date.now(),
			properties,
			anonymousId: this.anonymousId,
			sessionId: this.sessionId,
			websiteId: this.options.clientId,
			source: "browser",
		};

		this._enqueue(this.trackQueue, this._meta.track, event);
		return Promise.resolve();
	}

	flushTrack() {
		return this._flushQueue(this.trackQueue, this._meta.track);
	}

	sendBeacon(data: unknown, endpoint = "/vitals"): boolean {
		if (this.isServer() || !navigator.sendBeacon) {
			return false;
		}

		try {
			const blob = new Blob([JSON.stringify(data)], {
				type: "application/json",
			});
			const baseUrl = this.options.apiUrl || "https://basket.databuddy.cc";
			return navigator.sendBeacon(
				`${baseUrl}${endpoint}?client_id=${encodeURIComponent(this.options.clientId)}`,
				blob
			);
		} catch {
			return false;
		}
	}

	sendBatchBeacon(events: unknown[]): boolean {
		return this.sendBeacon(events, "/batch");
	}

	onRouteChange(callback: (path: string) => void): () => void {
		this.routeChangeCallbacks.push(callback);
		return () => {
			const index = this.routeChangeCallbacks.indexOf(callback);
			if (index > -1) {
				this.routeChangeCallbacks.splice(index, 1);
			}
		};
	}

	notifyRouteChange(path: string): void {
		for (const callback of this.routeChangeCallbacks) {
			try {
				callback(path);
			} catch {}
		}
	}
}
