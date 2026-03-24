import { BaseTracker } from "./core/tracker";
import type { TrackerOptions } from "./core/types";
import { generateUUIDv4, getTrackerConfig, isOptedOut } from "./core/utils";
import { initErrorTracking } from "./plugins/errors";
import { initInteractionTracking } from "./plugins/interactions";
import { initOutgoingLinksTracking } from "./plugins/outgoing-links";
import { initPixelTracking } from "./plugins/pixel";
import { initScrollDepthTracking } from "./plugins/scroll-depth";
import { initWebVitalsTracking } from "./plugins/vitals";

export class Databuddy extends BaseTracker {
	private cleanupFns: Array<() => void> = [];
	private globalProperties: Record<string, unknown> = {};
	private hasInitialized = false;
	private hasSentExitBeacon = false;

	constructor(options: TrackerOptions) {
		super(options);

		if (this.options.trackWebVitals) {
			initWebVitalsTracking(this);
		}
		if (this.options.trackErrors) {
			initErrorTracking(this);
		}

		if (!this.isServer()) {
			if (document.prerendering) {
				document.addEventListener(
					"prerenderingchange",
					() => this.initializeTracking(),
					{ once: true }
				);
			} else {
				this.initializeTracking();
			}
		}

		if (typeof window !== "undefined") {
			window.databuddy = {
				track: (name: string, props?: Record<string, unknown>) =>
					this.track(name, props),
				screenView: (props?: Record<string, unknown>) => this.screenView(props),
				flush: () => this.flushBatch(),
				clear: () => this.clear(),
				setGlobalProperties: (props: Record<string, unknown>) =>
					this.setGlobalProperties(props),
				options: this.options,
			};
			window.db = window.databuddy;
		}
	}

	private initializeTracking(): void {
		if (this.hasInitialized) {
			return;
		}
		this.hasInitialized = true;

		if (this.options.usePixel) {
			initPixelTracking(this);
		}

		this.trackScreenViews();
		this.setupPageLifecycle();

		if (document.visibilityState === "visible") {
			this.startEngagement();
		}

		setTimeout(() => this.screenView(), 0);

		if (this.options.trackOutgoingLinks) {
			const cleanup = initOutgoingLinksTracking(this);
			this.cleanupFns.push(cleanup);
		}
		if (this.options.trackAttributes) {
			this.trackAttributes();
		}
		if (this.options.trackScrollDepth) {
			initScrollDepthTracking(this);
		}
		if (this.options.trackInteractions) {
			initInteractionTracking(this);
		}
	}

	trackScreenViews() {
		if (this.isServer()) {
			return;
		}

		let debounceTimer: ReturnType<typeof setTimeout>;
		const debouncedScreenView = () => {
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => this.screenView(), 50);
		};

		if ("navigation" in window) {
			const nav = window.navigation as EventTarget;
			const handler = () => debouncedScreenView();
			nav.addEventListener("navigate", handler);
			this.cleanupFns.push(() => nav.removeEventListener("navigate", handler));
		} else {
			let lastUrl = location.href;
			const interval = setInterval(() => {
				if (location.href !== lastUrl) {
					lastUrl = location.href;
					debouncedScreenView();
				}
			}, 200);
			this.cleanupFns.push(() => clearInterval(interval));

			const popstateHandler = () => debouncedScreenView();
			window.addEventListener("popstate", popstateHandler);
			this.cleanupFns.push(() =>
				window.removeEventListener("popstate", popstateHandler)
			);

			if (this.options.trackHashChanges) {
				window.addEventListener("hashchange", debouncedScreenView);
				this.cleanupFns.push(() =>
					window.removeEventListener("hashchange", debouncedScreenView)
				);
			}
		}
	}

	screenView(props?: Record<string, unknown>) {
		if (this.isServer()) {
			return;
		}

		const url = window.location.href;
		if (this.lastPath === url) {
			return;
		}

		if (!this.options.trackHashChanges && this.lastPath) {
			const lastUrl = new URL(this.lastPath);
			const currentUrl = new URL(url);
			if (
				lastUrl.origin === currentUrl.origin &&
				lastUrl.pathname === currentUrl.pathname &&
				lastUrl.search === currentUrl.search &&
				lastUrl.hash !== currentUrl.hash
			) {
				return;
			}
		}

		if (this.lastPath) {
			this.trackPageExit(this.lastPath);
			this.notifyRouteChange(window.location.pathname);
		}

		this.hasSentExitBeacon = false;
		this.lastPath = url;
		this.pageCount += 1;
		this.resetPageEngagement();
		this._trackInternal("screen_view", {
			page_count: this.pageCount,
			...props,
		});
	}

	private setupPageLifecycle() {
		const handleUnload = () => this.handlePageUnload();
		const handleVisibilityChange = () => {
			if (document.visibilityState === "hidden") {
				this.pauseEngagement();
			} else {
				this.startEngagement();
			}
		};

		window.addEventListener("beforeunload", handleUnload);
		window.addEventListener("pagehide", handleUnload);
		document.addEventListener("visibilitychange", handleVisibilityChange);

		const pageshowHandler = (event: PageTransitionEvent) => {
			if (!event.persisted) {
				return;
			}
			this.handleBfCacheRestore();
		};
		window.addEventListener("pageshow", pageshowHandler);

		this.cleanupFns.push(() => {
			window.removeEventListener("beforeunload", handleUnload);
			window.removeEventListener("pagehide", handleUnload);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("pageshow", pageshowHandler);
		});
	}

	private handlePageUnload() {
		this.pauseEngagement();
		if (this.hasSentExitBeacon) {
			return;
		}
		this.hasSentExitBeacon = true;

		const now = Date.now();
		this.sendBatchBeacon([
			{
				eventId: generateUUIDv4(),
				name: "page_exit",
				anonymousId: this.anonymousId,
				sessionId: this.sessionId,
				timestamp: now,
				...this.getBaseContext(),
				...this.globalProperties,
				time_on_page: Math.round((now - this.pageStartTime) / 1000),
				scroll_depth: this.maxScrollDepth,
				interaction_count: this.interactionCount,
				page_count: this.pageCount,
			},
		]);
	}

	private handleBfCacheRestore() {
		this.hasSentExitBeacon = false;
		this.resetEngagement();
		this.startEngagement();

		const sessionTimestamp = sessionStorage.getItem("did_session_timestamp");
		if (sessionTimestamp) {
			const sessionAge = Date.now() - Number.parseInt(sessionTimestamp, 10);
			if (sessionAge >= 30 * 60 * 1000) {
				this.sessionId = this.generateSessionId();
				sessionStorage.setItem("did_session", this.sessionId);
				sessionStorage.setItem("did_session_timestamp", Date.now().toString());
			}
		}

		this.notifyRouteChange(window.location.pathname);
		this.lastPath = "";
		this.screenView({ navigation_type: "back_forward_cache" });
	}

	private trackPageExit(exitPath?: string) {
		const now = Date.now();
		this._trackInternal("page_exit", {
			path: exitPath,
			timestamp: now,
			time_on_page: Math.round((now - this.pageStartTime) / 1000),
			scroll_depth: this.maxScrollDepth,
			interaction_count: this.interactionCount,
			page_count: this.pageCount,
		});
	}

	private resetPageEngagement() {
		this.pageStartTime = Date.now();
		this.interactionCount = 0;
		this.maxScrollDepth = 0;
		this.resetEngagement();
		if (document.visibilityState === "visible") {
			this.startEngagement();
		}
	}

	trackAttributes() {
		const handler = (e: MouseEvent) => {
			const trackable = (e.target as HTMLElement).closest("[data-track]");
			if (!trackable) {
				return;
			}

			const eventName = trackable.getAttribute("data-track");
			if (!eventName) {
				return;
			}

			const properties: Record<string, string> = {};
			for (const attr of trackable.attributes) {
				if (attr.name.startsWith("data-") && attr.name !== "data-track") {
					properties[
						attr.name.slice(5).replace(/-./g, (x) => x[1].toUpperCase())
					] = attr.value;
				}
			}
			this.track(eventName, properties);
		};
		document.addEventListener("click", handler);
		this.cleanupFns.push(() => document.removeEventListener("click", handler));
	}

	_trackInternal(name: string, props?: Record<string, unknown>) {
		if (this.shouldSkipTracking()) {
			return;
		}

		const event = {
			eventId: generateUUIDv4(),
			name,
			anonymousId: this.anonymousId,
			sessionId: this.sessionId,
			timestamp: Date.now(),
			...this.getBaseContext(),
			...this.globalProperties,
			...props,
		};

		if (this.options.filter && !this.options.filter(event)) {
			return;
		}

		const samplingRate = this.options.samplingRate ?? 1.0;
		if (samplingRate < 1.0 && Math.random() > samplingRate) {
			return;
		}

		this.addToBatch(event);
	}

	track(name: string, props?: Record<string, unknown>) {
		if (this.shouldSkipTracking()) {
			return;
		}
		this.trackEvent(name, { ...this.globalProperties, ...props });
	}

	setGlobalProperties(props: Record<string, unknown>) {
		this.globalProperties = { ...this.globalProperties, ...props };
	}

	clear() {
		this.globalProperties = {};
		if (!this.isServer()) {
			try {
				localStorage.removeItem("did");
				sessionStorage.removeItem("did_session");
				sessionStorage.removeItem("did_session_timestamp");
				sessionStorage.removeItem("did_session_start");
			} catch {}
		}
		this.anonymousId = this.generateAnonymousId();
		this.sessionId = this.generateSessionId();
		this.sessionStartTime = Date.now();
		this.pageCount = 0;
		this.lastPath = "";
		this.interactionCount = 0;
		this.maxScrollDepth = 0;
	}

	destroy() {
		for (const cleanup of this.cleanupFns) {
			cleanup();
		}
		this.cleanupFns = [];

		if (this.batchTimer) {
			clearTimeout(this.batchTimer);
			this.batchTimer = null;
		}
		this.batchQueue = [];

		if (typeof window !== "undefined") {
			window.databuddy = undefined;
			window.db = undefined;
		}
	}
}

function initializeDatabuddy() {
	if (typeof window === "undefined" || window.databuddy) {
		return;
	}

	if (isOptedOut()) {
		window.databuddy = {
			track: () => {},
			screenView: () => {},
			clear: () => {},
			flush: () => {},
			setGlobalProperties: () => {},
			options: { clientId: "", disabled: true },
		};
		window.db = window.databuddy;
		return;
	}

	const config = getTrackerConfig();
	if (config.clientId) {
		new Databuddy(config);
	}
}

if (typeof window !== "undefined") {
	initializeDatabuddy();

	window.databuddyOptOut = () => {
		try {
			localStorage.setItem("databuddy_opt_out", "true");
			localStorage.setItem("databuddy_disabled", "true");
		} catch {}
		window.databuddyOptedOut = true;
		window.databuddyDisabled = true;
		if (window.databuddy) {
			window.databuddy.options.disabled = true;
		}
	};

	window.databuddyOptIn = () => {
		try {
			localStorage.removeItem("databuddy_opt_out");
			localStorage.removeItem("databuddy_disabled");
		} catch {}
		window.databuddyOptedOut = false;
		window.databuddyDisabled = false;
	};
}
