import { BaseTracker } from "./core/tracker";
import type { TrackerOptions } from "./core/types";
import { generateUUIDv4, getTrackerConfig, isOptedOut } from "./core/utils";
import { initErrorTracking } from "./plugins/errors";
import { initInteractionTracking } from "./plugins/interactions";
import { initPixelTracking } from "./plugins/pixel";
import { initScrollDepthTracking } from "./plugins/scroll-depth";
import { initWebVitalsTracking } from "./plugins/vitals";

export class Databuddy extends BaseTracker {
	// Store references for cleanup
	private cleanupFns: Array<() => void> = [];
	private originalPushState: typeof history.pushState | null = null;
	private originalReplaceState: typeof history.replaceState | null = null;
	private globalProperties: Record<string, unknown> = {};

	constructor(options: TrackerOptions) {
		super(options);

		if (this.options.trackWebVitals) {
			initWebVitalsTracking(this);
		}

		if (this.options.trackErrors) {
			initErrorTracking(this);
		}

		if (!this.isServer()) {
			if (this.options.usePixel) {
				initPixelTracking(this);
			}

			this.trackScreenViews();
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

		if (typeof window !== "undefined") {
			window.databuddy = {
				track: (name: string, props?: Record<string, unknown>) => this.track(name, props),
				screenView: (props?: Record<string, unknown>) => this.screenView(props),
				flush: () => this.flushBatch(),
				clear: () => this.clear(),
				setGlobalProperties: (props: Record<string, unknown>) => this.setGlobalProperties(props),
				trackCustomEvent: (name: string, props?: Record<string, unknown>) => this.trackCustomEvent(name, props),
				options: this.options,
			};
			window.db = window.databuddy;
		}
	}

	trackScreenViews() {
		if (this.isServer()) {
			return;
		}

		// Store original methods for cleanup
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

		const popstateHandler = () => {
			window.dispatchEvent(new Event("locationchange"));
		};
		window.addEventListener("popstate", popstateHandler);
		this.cleanupFns.push(() => window.removeEventListener("popstate", popstateHandler));

		let debounceTimer: ReturnType<typeof setTimeout>;
		const debouncedScreenView = () => {
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				this.screenView();
			}, 50);
		};

		window.addEventListener("locationchange", debouncedScreenView);
		this.cleanupFns.push(() => window.removeEventListener("locationchange", debouncedScreenView));

		if (this.options.trackHashChanges) {
			window.addEventListener("hashchange", debouncedScreenView);
			this.cleanupFns.push(() => window.removeEventListener("hashchange", debouncedScreenView));
		}
	}

	screenView(props?: Record<string, unknown>) {
		if (this.isServer()) {
			return;
		}
		const url = window.location.href;
		if (this.lastPath !== url) {
			if (!this.options.trackHashChanges && this.lastPath) {
				const lastUrl = new URL(this.lastPath);
				const currentUrl = new URL(url);
				const isHashOnlyChange =
					lastUrl.origin === currentUrl.origin &&
					lastUrl.pathname === currentUrl.pathname &&
					lastUrl.search === currentUrl.search &&
					lastUrl.hash !== currentUrl.hash;
				if (isHashOnlyChange) {
					return;
				}
			}
			this.lastPath = url;
			this.pageCount += 1;
			this.track("screen_view", {
				page_count: this.pageCount,
				...props,
			});
		}
	}

	trackOutgoingLinks() {
		const handler = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			const link = target.closest("a");
			if (link && link.hostname !== window.location.hostname) {
				if (!link.href) {
					return;
				}

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
			}
		};
		document.addEventListener("click", handler);
		this.cleanupFns.push(() => document.removeEventListener("click", handler));
	}

	trackAttributes() {
		const handler = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			const trackable = target.closest("[data-track]");
			if (trackable) {
				const eventName = trackable.getAttribute("data-track");
				if (eventName) {
					const properties: Record<string, string> = {};
					for (const attr of trackable.attributes) {
						if (attr.name.startsWith("data-") && attr.name !== "data-track") {
							const key = attr.name
								.slice(5)
								.replace(/-./g, (x: string) => x[1].toUpperCase());
							properties[key] = attr.value;
						}
					}
					this.track(eventName, properties);
				}
			}
		};
		document.addEventListener("click", handler);
		this.cleanupFns.push(() => document.removeEventListener("click", handler));
	}

	track(name: string, props?: Record<string, unknown>) {
		const payload = {
			eventId: generateUUIDv4(),
			name,
			anonymousId: this.anonymousId,
			sessionId: this.sessionId,
			timestamp: Date.now(),
			...this.getBaseContext(),
			...this.globalProperties,
			...props,
		};
		this.send(payload);
	}

	trackCustomEvent(name: string, props?: Record<string, unknown>) {
		this.track(name, {
			event_type: "custom",
			...props,
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
			} catch {
			}
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
		// Run all cleanup functions
		for (const cleanup of this.cleanupFns) {
			cleanup();
		}
		this.cleanupFns = [];

		// Restore original history methods
		if (this.originalPushState) {
			history.pushState = this.originalPushState;
			this.originalPushState = null;
		}
		if (this.originalReplaceState) {
			history.replaceState = this.originalReplaceState;
			this.originalReplaceState = null;
		}

		// Clear batch queue and timer
		if (this.batchTimer) {
			clearTimeout(this.batchTimer);
			this.batchTimer = null;
		}
		this.batchQueue = [];

		// Remove global references
		if (typeof window !== "undefined") {
			window.databuddy = undefined;
			window.db = undefined;
		}
	}
}

function initializeDatabuddy() {
	if (typeof window === "undefined") {
		return;
	}
	if (window.databuddy) {
		return;
	}

	if (isOptedOut()) {
		window.databuddy = {
			track: () => { },
			screenView: () => { },
			clear: () => { },
			flush: () => { },
			setGlobalProperties: () => { },
			trackCustomEvent: () => { },
			options: { disabled: true },
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
		} catch (_e) { }
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
		} catch (_e) { }
		window.databuddyOptedOut = false;
		window.databuddyDisabled = false;
	};
}
