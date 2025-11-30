import { BaseTracker } from "./core/tracker";
import type { TrackerOptions } from "./core/types";
import { generateUUIDv4, getTrackerConfig, isOptedOut } from "./core/utils";
import { initErrorTracking } from "./plugins/errors";
import { initInteractionTracking } from "./plugins/interactions";
import { initPixelTracking } from "./plugins/pixel";
import { initScrollDepthTracking } from "./plugins/scroll-depth";
import { initWebVitalsTracking } from "./plugins/vitals";

export class Databuddy extends BaseTracker {
	private cleanupFns: Array<() => void> = [];
	private originalPushState: typeof history.pushState | null = null;
	private originalReplaceState: typeof history.replaceState | null = null;
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
			this.trackOutgoingLinks();
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

		this.originalPushState = history.pushState;
		this.originalReplaceState = history.replaceState;

		const originalPushState = this.originalPushState;
		history.pushState = (...args) => {
			const ret = originalPushState.apply(history, args);
			window.dispatchEvent(new Event("pushstate"));
			window.dispatchEvent(new Event("locationchange"));
			return ret;
		};

		const originalReplaceState = this.originalReplaceState;
		history.replaceState = (...args) => {
			const ret = originalReplaceState.apply(history, args);
			window.dispatchEvent(new Event("replacestate"));
			window.dispatchEvent(new Event("locationchange"));
			return ret;
		};

		const popstateHandler = () =>
			window.dispatchEvent(new Event("locationchange"));
		window.addEventListener("popstate", popstateHandler);
		this.cleanupFns.push(() =>
			window.removeEventListener("popstate", popstateHandler)
		);

		let debounceTimer: ReturnType<typeof setTimeout>;
		const debouncedScreenView = () => {
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => this.screenView(), 50);
		};

		window.addEventListener("locationchange", debouncedScreenView);
		this.cleanupFns.push(() =>
			window.removeEventListener("locationchange", debouncedScreenView)
		);

		if (this.options.trackHashChanges) {
			window.addEventListener("hashchange", debouncedScreenView);
			this.cleanupFns.push(() =>
				window.removeEventListener("hashchange", debouncedScreenView)
			);
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
		const handleHide = () => this.handlePageHide();
		const handleResume = () => this.handlePageResume();

		window.addEventListener("beforeunload", handleHide);
		window.addEventListener("pagehide", handleHide);

		const visibilityHandler = () => {
			if (document.visibilityState === "hidden") {
				handleHide();
			} else {
				handleResume();
			}
		};
		document.addEventListener("visibilitychange", visibilityHandler);

		const pageshowHandler = (event: PageTransitionEvent) => {
			if (!event.persisted) { return; }
			this.handleBfCacheRestore();
		};
		window.addEventListener("pageshow", pageshowHandler);

		this.cleanupFns.push(() => {
			window.removeEventListener("beforeunload", handleHide);
			window.removeEventListener("pagehide", handleHide);
			document.removeEventListener("visibilitychange", visibilityHandler);
			window.removeEventListener("pageshow", pageshowHandler);
		});
	}

	private handlePageHide() {
		this.pauseEngagement();
		if (this.hasSentExitBeacon) { return; }
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

	private handlePageResume() {
		this.hasSentExitBeacon = false;
		this.startEngagement();
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

	trackOutgoingLinks() {
		const handler = (e: MouseEvent) => {
			const link = (e.target as HTMLElement).closest("a");
			if (!link?.href || link.hostname === window.location.hostname) { return; }

			this.api.fetch(
				"/outgoing",
				{
					eventId: generateUUIDv4(),
					href: link.href,
					text: link.innerText || link.title || "",
					...this.getBaseContext(),
				},
				{ keepalive: true }
			);
		};
		document.addEventListener("click", handler);
		this.cleanupFns.push(() => document.removeEventListener("click", handler));
	}

	trackAttributes() {
		const handler = (e: MouseEvent) => {
			const trackable = (e.target as HTMLElement).closest("[data-track]");
			if (!trackable) { return; }

			const eventName = trackable.getAttribute("data-track");
			if (!eventName) { return; }

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
		if (this.shouldSkipTracking()) { return; }

		this.addToBatch({
			eventId: generateUUIDv4(),
			name,
			anonymousId: this.anonymousId,
			sessionId: this.sessionId,
			timestamp: Date.now(),
			...this.getBaseContext(),
			...this.globalProperties,
			...props,
		});
	}

	track(name: string, props?: Record<string, unknown>) {
		if (this.shouldSkipTracking()) { return; }

		this.sendCustomEvent({
			timestamp: Date.now(),
			path: this.isServer() ? "" : window.location.pathname,
			eventName: name,
			anonymousId: this.anonymousId,
			sessionId: this.sessionId,
			properties: props,
		});
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
			} catch { }
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
		for (const cleanup of this.cleanupFns) { cleanup(); }
		this.cleanupFns = [];

		if (this.originalPushState) {
			history.pushState = this.originalPushState;
			this.originalPushState = null;
		}
		if (this.originalReplaceState) {
			history.replaceState = this.originalReplaceState;
			this.originalReplaceState = null;
		}
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
	if (typeof window === "undefined" || window.databuddy) { return; }

	if (isOptedOut()) {
		window.databuddy = {
			track: () => { },
			screenView: () => { },
			clear: () => { },
			flush: () => { },
			setGlobalProperties: () => { },
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
		} catch { }
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
		} catch { }
		window.databuddyOptedOut = false;
		window.databuddyDisabled = false;
	};
}
