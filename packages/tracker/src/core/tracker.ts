import { HttpClient } from "./client";
import type { BaseEvent, CustomEventSpan, ErrorSpan, EventContext, TrackerOptions, WebVitalEvent } from "./types";
import { generateUUIDv4, logger } from "./utils";

const HEADLESS_CHROME_REGEX = /\bHeadlessChrome\b/i;
const PHANTOMJS_REGEX = /\bPhantomJS\b/i;

export class BaseTracker {
	options: TrackerOptions;
	api: HttpClient;

	anonymousId?: string;
	sessionId?: string;
	sessionStartTime = 0;
	lastActivityTime = Date.now();

	pageCount = 0;
	lastPath = "";
	isInternalNavigation = false;
	interactionCount = 0;
	maxScrollDepth = 0;
	pageStartTime = Date.now();
	pageEngagementStart = Date.now();

	private engagedTime = 0;
	private engagementStartTime: number | null = null;
	private isPageVisible = true;

	isLikelyBot = false;
	hasInteracted = false;

	batchQueue: BaseEvent[] = [];
	batchTimer: Timer | null = null;
	private isFlushing = false;

	vitalsQueue: WebVitalEvent[] = [];
	vitalsTimer: Timer | null = null;
	private isFlushingVitals = false;

	errorsQueue: ErrorSpan[] = [];
	errorsTimer: Timer | null = null;
	private isFlushingErrors = false;

	customEventsQueue: CustomEventSpan[] = [];
	customEventsTimer: Timer | null = null;
	private isFlushingCustomEvents = false;

	private readonly routeChangeCallbacks: Array<(path: string) => void> = [];

	constructor(options: TrackerOptions) {
		if (!options.clientId || typeof options.clientId !== "string") {
			throw new Error("[Databuddy] clientId is required and must be a string");
		}

		this.options = {
			disabled: false,
			trackPerformance: true,
			samplingRate: 1.0,
			enableRetries: false,
			maxRetries: 3,
			initialRetryDelay: 500,
			enableBatching: true,
			batchSize: 10,
			batchTimeout: 5000,
			sdk: "web",
			sdkVersion: "2.0.0",
			...options,
		};

		this.api = new HttpClient({
			baseUrl: this.options.apiUrl || "https://basket.databuddy.cc",
			defaultHeaders: {
				"databuddy-client-id": this.options.clientId,
				"databuddy-sdk-name": this.options.sdk || "web",
				"databuddy-sdk-version": this.options.sdkVersion || "2.0.0",
			},
			maxRetries: this.options.maxRetries,
			initialRetryDelay: this.options.initialRetryDelay,
		});

		if (this.isServer()) { return; }

		this.isLikelyBot = this.detectBot();
		if (this.isLikelyBot) {
			logger.log("Bot detected, tracking might be filtered");
		}

		this.anonymousId = this.getOrCreateAnonymousId();
		this.sessionId = this.getOrCreateSessionId();
		this.sessionStartTime = this.getSessionStartTime();
		this.setupBotDetection();
		logger.log("Tracker initialized", this.options);
	}

	isServer(): boolean {
		return typeof document === "undefined" || typeof window === "undefined" || typeof localStorage === "undefined";
	}

	detectBot(): boolean {
		if (this.isServer() || this.options.ignoreBotDetection) { return false; }

		const ua = navigator.userAgent || "";
		const isHeadless = HEADLESS_CHROME_REGEX.test(ua) || PHANTOMJS_REGEX.test(ua);

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

	setupBotDetection() {
		if (this.isServer()) { return; }

		const handler = () => { this.hasInteracted = true; };
		for (const event of ["mousemove", "scroll", "keydown"]) {
			window.addEventListener(event, handler, { once: true, passive: true });
		}
	}

	getOrCreateAnonymousId(): string {
		if (this.isServer()) { return this.generateAnonymousId(); }

		const urlParams = new URLSearchParams(window.location.search);
		const anonId = urlParams.get("anonId");
		if (anonId) {
			localStorage.setItem("did", anonId);
			return anonId;
		}

		const storedId = localStorage.getItem("did");
		if (storedId) { return storedId; }

		const newId = this.generateAnonymousId();
		localStorage.setItem("did", newId);
		return newId;
	}

	generateAnonymousId(): string {
		return `anon_${generateUUIDv4()}`;
	}

	getOrCreateSessionId(): string {
		if (this.isServer()) { return this.generateSessionId(); }

		const urlParams = new URLSearchParams(window.location.search);
		const sessionIdFromUrl = urlParams.get("sessionId");
		if (sessionIdFromUrl) {
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
		if (this.isServer()) { return Date.now(); }

		const storedTime = sessionStorage.getItem("did_session_start");
		if (storedTime) { return Number.parseInt(storedTime, 10); }

		const now = Date.now();
		sessionStorage.setItem("did_session_start", now.toString());
		return now;
	}

	protected shouldSkipTracking(): boolean {
		if (this.isServer() || this.options.disabled || this.isLikelyBot) {
			return true;
		}

		if (this.options.skipPatterns) {
			const pathname = window.location.pathname;
			for (const pattern of this.options.skipPatterns) {
				if (pattern === pathname) { return true; }
				const starIndex = pattern.indexOf("*");
				if (starIndex !== -1 && pathname.startsWith(pattern.substring(0, starIndex))) {
					return true;
				}
			}
		}
		return false;
	}

	protected getMaskedPath(): string {
		if (this.isServer()) { return ""; }

		const pathname = window.location.pathname;
		if (!this.options.maskPatterns) { return pathname; }

		for (const pattern of this.options.maskPatterns) {
			const starIndex = pattern.indexOf("*");
			if (starIndex === -1) { continue; }

			const prefix = pattern.substring(0, starIndex);
			if (pathname.startsWith(prefix)) {
				if (pattern.substring(starIndex, starIndex + 2) === "**") {
					return `${prefix}*`;
				}
				const remainder = pathname.substring(prefix.length);
				const nextSlash = remainder.indexOf("/");
				return `${prefix}*${nextSlash === -1 ? "" : remainder.substring(nextSlash)}`;
			}
		}
		return pathname;
	}

	protected getUtmParams() {
		if (this.isServer()) { return {}; }

		const urlParams = new URLSearchParams(window.location.search);
		return {
			utm_source: urlParams.get("utm_source") || undefined,
			utm_medium: urlParams.get("utm_medium") || undefined,
			utm_campaign: urlParams.get("utm_campaign") || undefined,
			utm_term: urlParams.get("utm_term") || undefined,
			utm_content: urlParams.get("utm_content") || undefined,
		};
	}

	getBaseContext(): EventContext {
		if (this.isServer()) { return {} as EventContext; }

		let width: number | undefined = window.innerWidth;
		let height: number | undefined = window.innerHeight;
		if (width < 240 || width > 10_000 || height < 240 || height > 10_000) {
			width = undefined;
			height = undefined;
		}

		let timezone: string | undefined;
		try {
			timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		} catch { }

		return {
			path: window.location.origin + this.getMaskedPath() + window.location.search + window.location.hash,
			title: document.title,
			referrer: document.referrer || "direct",
			viewport_size: width && height ? `${width}x${height}` : undefined,
			timezone,
			language: navigator.language,
			...this.getUtmParams(),
		};
	}

	send(event: BaseEvent & { isForceSend?: boolean }): Promise<unknown> {
		if (this.shouldSkipTracking()) { return Promise.resolve(); }
		if (this.options.filter && !this.options.filter(event)) { return Promise.resolve(); }

		const samplingRate = this.options.samplingRate ?? 1.0;
		if (samplingRate < 1.0 && Math.random() > samplingRate) { return Promise.resolve(); }

		if (this.options.enableBatching && !event.isForceSend) {
			return this.addToBatch(event);
		}

		return this.api.fetch("/", event, { keepalive: true }, { client_id: this.options.clientId });
	}

	addToBatch(event: BaseEvent): Promise<void> {
		this.batchQueue.push(event);
		if (this.batchTimer === null) {
			this.batchTimer = setTimeout(() => this.flushBatch(), this.options.batchTimeout);
		}
		if (this.batchQueue.length >= (this.options.batchSize || 10)) {
			this.flushBatch();
		}
		return Promise.resolve();
	}

	async flushBatch() {
		if (this.batchTimer) {
			clearTimeout(this.batchTimer);
			this.batchTimer = null;
		}
		if (this.batchQueue.length === 0 || this.isFlushing) { return; }

		this.isFlushing = true;
		const batchEvents = [...this.batchQueue];
		this.batchQueue = [];

		try {
			return await this.api.fetch("/batch", batchEvents, { keepalive: true }, { client_id: this.options.clientId });
		} catch (_error) {
			for (const evt of batchEvents) {
				this.send({ ...evt, isForceSend: true });
			}
			return null;
		} finally {
			this.isFlushing = false;
		}
	}

	sendVital(event: WebVitalEvent): Promise<void> {
		if (this.shouldSkipTracking()) { return Promise.resolve(); }
		return this.addToVitalsQueue(event);
	}

	addToVitalsQueue(event: WebVitalEvent): Promise<void> {
		this.vitalsQueue.push(event);
		if (this.vitalsTimer === null) {
			this.vitalsTimer = setTimeout(() => this.flushVitals(), this.options.batchTimeout);
		}
		if (this.vitalsQueue.length >= 6) {
			this.flushVitals();
		}
		return Promise.resolve();
	}

	async flushVitals() {
		if (this.vitalsTimer) {
			clearTimeout(this.vitalsTimer);
			this.vitalsTimer = null;
		}
		if (this.vitalsQueue.length === 0 || this.isFlushingVitals) { return; }

		this.isFlushingVitals = true;
		const vitals = [...this.vitalsQueue];
		this.vitalsQueue = [];

		try {
			return await this.api.fetch("/vitals", vitals, { keepalive: true }, { client_id: this.options.clientId });
		} catch {
			return null;
		} finally {
			this.isFlushingVitals = false;
		}
	}

	sendError(error: ErrorSpan): Promise<void> {
		if (this.shouldSkipTracking()) { return Promise.resolve(); }
		return this.addToErrorsQueue(error);
	}

	addToErrorsQueue(error: ErrorSpan): Promise<void> {
		this.errorsQueue.push(error);
		if (this.errorsTimer === null) {
			this.errorsTimer = setTimeout(() => this.flushErrors(), this.options.batchTimeout);
		}
		if (this.errorsQueue.length >= 10) {
			this.flushErrors();
		}
		return Promise.resolve();
	}

	async flushErrors() {
		if (this.errorsTimer) {
			clearTimeout(this.errorsTimer);
			this.errorsTimer = null;
		}
		if (this.errorsQueue.length === 0 || this.isFlushingErrors) { return; }

		this.isFlushingErrors = true;
		const errors = [...this.errorsQueue];
		this.errorsQueue = [];

		try {
			return await this.api.fetch("/errors", errors, { keepalive: true }, { client_id: this.options.clientId });
		} catch {
			return null;
		} finally {
			this.isFlushingErrors = false;
		}
	}

	sendCustomEvent(event: CustomEventSpan): Promise<void> {
		if (this.shouldSkipTracking()) { return Promise.resolve(); }
		return this.addToCustomEventsQueue(event);
	}

	addToCustomEventsQueue(event: CustomEventSpan): Promise<void> {
		this.customEventsQueue.push(event);
		if (this.customEventsTimer === null) {
			this.customEventsTimer = setTimeout(() => this.flushCustomEvents(), this.options.batchTimeout);
		}
		if (this.customEventsQueue.length >= 10) {
			this.flushCustomEvents();
		}
		return Promise.resolve();
	}

	async flushCustomEvents() {
		if (this.customEventsTimer) {
			clearTimeout(this.customEventsTimer);
			this.customEventsTimer = null;
		}
		if (this.customEventsQueue.length === 0 || this.isFlushingCustomEvents) { return; }

		this.isFlushingCustomEvents = true;
		const events = [...this.customEventsQueue];
		this.customEventsQueue = [];

		try {
			return await this.api.fetch("/events", events, { keepalive: true }, { client_id: this.options.clientId });
		} catch {
			return null;
		} finally {
			this.isFlushingCustomEvents = false;
		}
	}

	sendBeacon(data: unknown, endpoint = "/vitals"): boolean {
		if (this.isServer() || !navigator.sendBeacon) {
			return false;
		}

		try {
			const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
			const baseUrl = this.options.apiUrl || "https://basket.databuddy.cc";
			return navigator.sendBeacon(`${baseUrl}${endpoint}?client_id=${encodeURIComponent(this.options.clientId)}`, blob);
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
			} catch { }
		}
	}

	startEngagement(): void {
		if (this.engagementStartTime === null) {
			this.engagementStartTime = Date.now();
			this.isPageVisible = true;
		}
	}

	pauseEngagement(): void {
		if (this.engagementStartTime !== null) {
			this.engagedTime += Date.now() - this.engagementStartTime;
			this.engagementStartTime = null;
			this.isPageVisible = false;
		}
	}

	getEngagedTime(): number {
		let total = this.engagedTime;
		if (this.engagementStartTime !== null) {
			total += Date.now() - this.engagementStartTime;
		}
		return total;
	}

	getEngagedTimeSeconds(): number {
		return Math.round(this.getEngagedTime() / 1000);
	}

	resetEngagement(): void {
		this.engagedTime = 0;
		this.engagementStartTime = this.isPageVisible ? Date.now() : null;
	}

	getIsPageVisible(): boolean {
		return this.isPageVisible;
	}
}
