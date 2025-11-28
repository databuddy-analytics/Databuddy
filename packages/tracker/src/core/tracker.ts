import { HttpClient } from "./client";
import type { BaseEvent, EventContext, TrackerOptions } from "./types";
import { generateUUIDv4, logger } from "./utils";

const HEADLESS_CHROME_REGEX = /\bHeadlessChrome\b/i;
const PHANTOMJS_REGEX = /\bPhantomJS\b/i;

export class BaseTracker {
	options: TrackerOptions;
	api: HttpClient;

	// State
	anonymousId?: string;
	sessionId?: string;
	sessionStartTime = 0;
	lastActivityTime: number = Date.now();

	// Engagement
	pageCount = 0;
	lastPath = "";
	isInternalNavigation = false;
	interactionCount = 0;
	maxScrollDepth = 0;
	pageStartTime: number = Date.now();
	pageEngagementStart: number = Date.now();

	// Bot Detection
	isLikelyBot = false;
	hasInteracted = false;

	// Queues
	batchQueue: BaseEvent[] = [];
	batchTimer: Timer | null = null;
	private isFlushing = false;

	constructor(options: TrackerOptions) {
		this.options = {
			disabled: false,
			trackPerformance: true,
			samplingRate: 1.0,
			enableRetries: true,
			maxRetries: 3,
			initialRetryDelay: 500,
			enableBatching: false,
			batchSize: 10,
			batchTimeout: 2000,
			sdk: "web",
			sdkVersion: "2.0.0",
			...options,
		};

		const headers: Record<string, string> = {};
		if (this.options.clientId) {
			headers["databuddy-client-id"] = this.options.clientId;
		}
		headers["databuddy-sdk-name"] = this.options.sdk || "web";
		headers["databuddy-sdk-version"] = this.options.sdkVersion || "2.0.0";

		this.api = new HttpClient({
			baseUrl: this.options.apiUrl || "https://basket.databuddy.cc",
			defaultHeaders: headers,
			maxRetries: this.options.maxRetries,
			initialRetryDelay: this.options.initialRetryDelay,
		});

		if (this.isServer()) {
			return;
		}

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
		return (
			typeof document === "undefined" ||
			typeof window === "undefined" ||
			typeof localStorage === "undefined"
		);
	}

	detectBot(): boolean {
		if (this.isServer()) {
			return false;
		}
		if (this.options.ignoreBotDetection) {
			return false;
		}
		const ua = navigator.userAgent || "";
		const isHeadless =
			HEADLESS_CHROME_REGEX.test(ua) || PHANTOMJS_REGEX.test(ua);

		const isBot = Boolean(
			navigator.webdriver ||
			window.webdriver ||
			isHeadless ||
			window.callPhantom ||
			window._phantom ||
			window.selenium ||
			document.documentElement.getAttribute("webdriver") === "true"
		);
		return isBot;
	}

	setupBotDetection() {
		if (this.isServer()) {
			return;
		}
		const events = ["mousemove", "scroll", "keydown"];
		const handler = () => {
			this.hasInteracted = true;
		};
		for (const event of events) {
			window.addEventListener(event, handler, { once: true, passive: true });
		}
	}

	getOrCreateAnonymousId(): string {
		if (this.isServer()) {
			return this.generateAnonymousId();
		}

		const urlParams = new URLSearchParams(window.location.search);
		const anonId = urlParams.get("anonId");
		if (anonId) {
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

		if (sessionIdFromUrl) {
			sessionStorage.setItem("did_session", sessionIdFromUrl);
			sessionStorage.setItem("did_session_timestamp", Date.now().toString());
			return sessionIdFromUrl;
		}

		const storedId = sessionStorage.getItem("did_session");
		const sessionTimestamp = sessionStorage.getItem("did_session_timestamp");

		if (storedId && sessionTimestamp) {
			const sessionAge = Date.now() - Number.parseInt(sessionTimestamp, 10);
			const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 mins

			if (sessionAge < SESSION_TIMEOUT) {
				sessionStorage.setItem("did_session_timestamp", Date.now().toString());
				return storedId;
			}
			// Session expired
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
		if (this.isServer()) {
			return true;
		}
		if (this.options.disabled) {
			logger.log("Tracking disabled");
			return true;
		}
		if (this.isLikelyBot) {
			logger.log("Tracking skipped: Bot detected");
			return true;
		}

		if (this.options.skipPatterns) {
			const pathname = window.location.pathname;
			for (const pattern of this.options.skipPatterns) {
				if (pattern === pathname) {
					logger.log("Tracking skipped: path matches skipPattern", pattern);
					return true;
				}
				const starIndex = pattern.indexOf("*");
				if (starIndex !== -1) {
					const prefix = pattern.substring(0, starIndex);
					if (pathname.startsWith(prefix)) {
						logger.log("Tracking skipped: path matches skipPattern", pattern);
						return true;
					}
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

			const prefix = pattern.substring(0, starIndex);
			if (pathname.startsWith(prefix)) {
				if (pattern.substring(starIndex, starIndex + 2) === "**") {
					return `${prefix}*`;
				}
				const remainder = pathname.substring(prefix.length);
				const nextSlash = remainder.indexOf("/");
				const afterStar =
					nextSlash === -1 ? "" : remainder.substring(nextSlash);
				return `${prefix}*${afterStar}`;
			}
		}
		return pathname;
	}

	protected getUtmParams() {
		if (this.isServer()) {
			return {};
		}
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
		if (this.isServer()) {
			return {} as EventContext;
		}

		const utmParams = this.getUtmParams();

		let width: number | undefined = window.innerWidth;
		let height: number | undefined = window.innerHeight;
		if (width < 240 || width > 10_000 || height < 240 || height > 10_000) {
			width = undefined;
			height = undefined;
		}
		const viewport_size = width && height ? `${width}x${height}` : undefined;

		const maskedPathname = this.getMaskedPath();
		const path =
			window.location.origin +
			maskedPathname +
			window.location.search +
			window.location.hash;

		let timezone: string | undefined;
		try {
			timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		} catch { }

		return {
			path,
			title: document.title,
			referrer: document.referrer || "direct",
			viewport_size,
			timezone,
			language: navigator.language,
			...utmParams,
		};
	}

	send(event: BaseEvent & { isForceSend?: boolean }): Promise<unknown> {
		if (this.shouldSkipTracking()) {
			return Promise.resolve();
		}
		if (this.options.filter && !this.options.filter(event)) {
			logger.log("Event filtered", event);
			return Promise.resolve();
		}

		const samplingRate = this.options.samplingRate ?? 1.0;
		if (samplingRate < 1.0 && Math.random() > samplingRate) {
			logger.log("Event sampled out", event);
			return Promise.resolve();
		}

		if (this.options.enableBatching && !event.isForceSend) {
			logger.log("Queueing event for batch", event);
			return this.addToBatch(event);
		}

		logger.log("Sending event", event);
		return this.api.fetch("/", event, { keepalive: true });
	}

	addToBatch(event: BaseEvent): Promise<void> {
		this.batchQueue.push(event);
		if (this.batchTimer === null) {
			this.batchTimer = setTimeout(
				() => this.flushBatch(),
				this.options.batchTimeout
			);
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
		if (this.batchQueue.length === 0 || this.isFlushing) {
			return;
		}

		this.isFlushing = true;
		const batchEvents = [...this.batchQueue];
		this.batchQueue = [];

		logger.log("Flushing batch", batchEvents.length);

		try {
			const result = await this.api.fetch("/batch", batchEvents, {
				keepalive: true,
			});
			logger.log("Batch sent", result);
			return result;
		} catch (_error) {
			logger.error("Batch failed, retrying individually", _error);
			for (const evt of batchEvents) {
				this.send({ ...evt, isForceSend: true });
			}
			return null;
		} finally {
			this.isFlushing = false;
		}
	}

	sendBeacon(data: unknown, endpoint = "/vitals"): boolean {
		if (this.isServer()) {
			return false;
		}
		if (typeof navigator === "undefined" || !navigator.sendBeacon) {
			return false;
		}
		try {
			const blob = new Blob([JSON.stringify(data)], {
				type: "application/json",
			});
			const baseUrl = this.options.apiUrl || "https://basket.databuddy.cc";
			return navigator.sendBeacon(`${baseUrl}${endpoint}`, blob);
		} catch {
			return false;
		}
	}

	sendBatchBeacon(events: unknown[]): boolean {
		return this.sendBeacon(events, "/batch");
	}
}