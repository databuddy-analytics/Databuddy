(() => {
	// Constants
	const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
	const MAX_CLAMP_VALUE = 60_000;
	const MAX_DIMENSION_VALUE = 10_000;
	const MIN_DIMENSION_VALUE = 240;
	const MAX_COUNT_VALUE = 10_000;
	const MAX_TIME_ON_PAGE = 86_400; // 24 hours in seconds

	// Config validation constants
	const MIN_RETRY_DELAY = 50;
	const MAX_RETRY_DELAY = 10_000;
	const MIN_BATCH_SIZE = 1;
	const MAX_BATCH_SIZE = 50;
	const MIN_BATCH_TIMEOUT = 100;
	const MAX_BATCH_TIMEOUT = 30_000;

	// Utility functions
	const clampValue = (v) =>
		typeof v === 'number' ? Math.min(MAX_CLAMP_VALUE, Math.max(0, v)) : v;
	const noop = () => {};

	const validateUrl = (url) => {
		if (typeof url !== 'string' || !url) {
			return null;
		}
		try {
			new URL(url);
			return url;
		} catch {
			return null;
		}
	};

	const sanitizeUrl = (url) => {
		if (typeof url !== 'string' || !url) {
			return url;
		}

		try {
			const urlObj = new URL(url);
			const sensitiveParams = [
				'token',
				'api_key',
				'session',
				'auth',
				'password',
				'secret',
				'key',
				'access_token',
				'refresh_token',
				'id_token',
			];

			// Remove sensitive query parameters
			sensitiveParams.forEach((param) => {
				urlObj.searchParams.delete(param);
			});

			return urlObj.toString();
		} catch {
			// If URL parsing fails, return the original URL
			return url;
		}
	};

	const validateDimensions = (width, height) => {
		if (
			typeof width !== 'number' ||
			typeof height !== 'number' ||
			width < MIN_DIMENSION_VALUE ||
			width > MAX_DIMENSION_VALUE ||
			height < MIN_DIMENSION_VALUE ||
			height > MAX_DIMENSION_VALUE
		) {
			return { width: null, height: null };
		}
		return { width, height };
	};

	const validateConfigRange = (value, min, max) => {
		if (value === undefined) return value;
		return Math.min(max, Math.max(min, value));
	};

	function generateUUIDv4() {
		// Use crypto.randomUUID() if available (modern browsers)
		if (typeof crypto !== 'undefined' && crypto.randomUUID) {
			return crypto.randomUUID();
		}
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
			const r = Math.floor(Math.random() * 16);
			const v = c === 'x' ? r : (r & 0x3) | 0x8;
			return v.toString(16);
		});
	}
	// HTTP Client
	const HttpClient = class {
		constructor(config) {
			this.baseUrl = config.baseUrl;
			this.staticHeaders = {};
			this.dynamicHeaderFns = {};
			const headers = {
				'Content-Type': 'application/json',
				...config.defaultHeaders,
			};
			for (const [key, value] of Object.entries(headers)) {
				if (
					typeof value === 'function' ||
					(value && typeof value.then === 'function')
				) {
					this.dynamicHeaderFns[key] = value;
				} else {
					this.staticHeaders[key] = value;
				}
			}
			this.maxRetries = config.maxRetries ?? 3;
			this.initialRetryDelay = config.initialRetryDelay ?? 500;
		}

		async resolveHeaders() {
			const headers = { ...this.staticHeaders };
			for (const [key, fn] of Object.entries(this.dynamicHeaderFns)) {
				headers[key] = await (typeof fn === 'function' ? fn() : fn);
			}
			return headers;
		}

		addHeader(key, value) {
			if (
				typeof value === 'function' ||
				(value && typeof value.then === 'function')
			) {
				this.dynamicHeaderFns[key] = value;
				delete this.staticHeaders[key];
			} else {
				this.staticHeaders[key] = value;
				delete this.dynamicHeaderFns[key];
			}
		}

		async post(url, data, options = {}, retryCount = 0) {
			try {
				const fetchOptions = {
					method: 'POST',
					headers: await this.resolveHeaders(),
					body: JSON.stringify(data ?? {}),
					keepalive: true,
					credentials: 'omit',
					...options,
				};

				const response = await fetch(url, fetchOptions);

				if (response.status === 401) {
					return null;
				}

				if (response.status !== 200 && response.status !== 202) {
					if (
						((response.status >= 500 && response.status < 600) ||
							response.status === 429) &&
						retryCount < this.maxRetries
					) {
						const jitter = Math.random() * 0.3 + 0.85;
						const delay = this.initialRetryDelay * 2 ** retryCount * jitter;
						await new Promise((resolve) => setTimeout(resolve, delay));
						return this.post(url, data, options, retryCount + 1);
					}
					throw new Error(
						`HTTP error! status: ${response.status} for URL: ${url}`
					);
				}

				try {
					return await response.json();
				} catch (_e) {
					const text = await response.text();
					return text ? JSON.parse(text) : null;
				}
			} catch (error) {
				const isNetworkError =
					error.name === 'TypeError' || error.name === 'NetworkError';
				if (retryCount < this.maxRetries && isNetworkError) {
					const jitter = Math.random() * 0.3 + 0.85;
					const delay = this.initialRetryDelay * 2 ** retryCount * jitter;
					await new Promise((resolve) => setTimeout(resolve, delay));
					return this.post(url, data, options, retryCount + 1);
				}
				return null;
			}
		}

		async fetch(endpoint, data, options = {}) {
			const url = `${this.baseUrl}${endpoint}`;
			return this.post(url, data, options, 0);
		}
	};

	// Base Tracker
	const l = class {
		constructor(options) {
			this.options = {
				disabled: false,
				trackScreenViews: true,
				trackHashChanges: false,
				trackAttributes: false,
				trackOutgoingLinks: false,
				trackSessions: true,
				trackPerformance: true,

				trackEngagement: false,
				trackScrollDepth: false,
				trackExitIntent: false,
				trackInteractions: false,
				trackErrors: false,
				trackBounceRate: false,
				samplingRate: 1.0,
				enableRetries: true,
				maxRetries: 3,
				initialRetryDelay: 500,
				enableBatching: false,
				batchSize: 10,
				batchTimeout: 2000,
				...options,
			};
			this.batchQueue = [];
			this.batchTimer = null;

			const headers = {
				'databuddy-client-id': this.options.clientId,
				'databuddy-sdk-name': this.options.sdk || 'web',
				'databuddy-sdk-version': this.options.sdkVersion || '1.0.0',
			};

			this.api = new HttpClient({
				baseUrl: this.options.apiUrl || 'https://basket.databuddy.cc',
				defaultHeaders: headers,
				maxRetries: this.options.maxRetries,
				initialRetryDelay: this.options.initialRetryDelay,
			});

			this.lastPath = '';
			this.pageCount = 0;
			this.isInternalNavigation = false;

			this.anonymousId = this.getOrCreateAnonymousId();
			this.sessionId = this.getOrCreateSessionId();
			this.sessionStartTime = this.getSessionStartTime();
			this.lastActivityTime = Date.now();

			this.maxScrollDepth = 0;
			this.interactionCount = 0;
			this.hasExitIntent = false;
			this.pageEngagementStart = Date.now();
			this.utmParams = this.getUtmParams();

			this.isLikelyBot = this.detectBot();
			this.hasInteracted = false;

			if (typeof window !== 'undefined') {
				this.setupBotDetection();
				this.setupExitTracking();
			}
		}

		getOrCreateAnonymousId() {
			if (typeof window !== 'undefined' && window.localStorage) {
				const storedId = localStorage.getItem('did');
				if (storedId) {
					return storedId;
				}
				const newId = this.generateAnonymousId();
				localStorage.setItem('did', newId);
				return newId;
			}
			return this.generateAnonymousId();
		}

		generateAnonymousId() {
			return `anon_${generateUUIDv4()}`;
		}

		getOrCreateSessionId() {
			if (this.isServer()) {
				return this.generateSessionId();
			}

			const storedId = sessionStorage.getItem('did_session');
			const sessionTimestamp = sessionStorage.getItem('did_session_timestamp');

			if (storedId && sessionTimestamp) {
				const sessionAge = Date.now() - Number.parseInt(sessionTimestamp, 10);
				if (sessionAge < SESSION_TIMEOUT) {
					sessionStorage.setItem(
						'did_session_timestamp',
						Date.now().toString()
					);
					return storedId;
				}
				sessionStorage.removeItem('did_session');
				sessionStorage.removeItem('did_session_timestamp');
				sessionStorage.removeItem('did_session_start');
			}

			const newId = this.generateSessionId();
			sessionStorage.setItem('did_session', newId);
			sessionStorage.setItem('did_session_timestamp', Date.now().toString());
			return newId;
		}

		generateSessionId() {
			return `sess_${generateUUIDv4()}`;
		}

		getSessionStartTime() {
			if (this.isServer()) return Date.now();

			const storedTime = sessionStorage.getItem('did_session_start');
			if (storedTime) return Number.parseInt(storedTime, 10);

			const now = Date.now();
			sessionStorage.setItem('did_session_start', now.toString());
			return now;
		}

		init() {
			if (this.isServer()) {
				return;
			}

			if (this.options.trackSessions) {
				this.anonymousId = this.getOrCreateAnonymousId();
				this.sessionId = this.getOrCreateSessionId();
				this.sessionStartTime = this.getSessionStartTime();
				this.lastActivityTime = Date.now();
			} else {
				this.anonymousId = this.getOrCreateAnonymousId();
			}

			const interactionEvents = [
				'mousedown',
				'keydown',
				'scroll',
				'touchstart',
				'click',
				'keypress',
				'mousemove',
			];
			const handler = () => this.interactionCount++;

			if (this.options.trackInteractions) {
				for (const eventType of interactionEvents) {
					window.addEventListener(eventType, handler, { passive: true });
				}
			} else {
				const oneTimeHandler = () => {
					this.interactionCount++;
					for (const eventType of interactionEvents) {
						window.removeEventListener(eventType, oneTimeHandler);
					}
				};
				for (const eventType of interactionEvents) {
					window.addEventListener(eventType, oneTimeHandler, { passive: true });
				}
			}

			if (this.options.trackEngagement) {
				this.maxScrollDepth = 0;
				this.interactionCount = 0;
				this.hasExitIntent = false;

				if (this.options.trackExitIntent) {
					document.addEventListener('mouseleave', (e) => {
						if (e.clientY <= 0) {
							this.hasExitIntent = true;
						}
					});
				}
			}

			if (this.options.trackErrors) {
				window.addEventListener('error', (event) => {
					this.trackError({
						timestamp: Date.now(),
						message: event.message,
						filename: event.filename,
						lineno: event.lineno,
						colno: event.colno,
						stack: event.error?.stack,
						errorType: event.error?.name || 'Error',
					});
				});
			}
		}

		trackScrollDepth() {
			if (this.isServer()) return;

			const scrollHeight =
				document.documentElement.scrollHeight - window.innerHeight;
			const currentScroll = window.scrollY;
			const scrollPercent = Math.min(
				100,
				Math.round((currentScroll / scrollHeight) * 100)
			);
			this.maxScrollDepth = Math.max(this.maxScrollDepth, scrollPercent);
		}

		async send(event) {
			const eventData =
				event.type === 'track' && event.payload ? event.payload : event;

			if (
				this.options.disabled ||
				(this.options.filter && !this.options.filter(eventData))
			) {
				return Promise.resolve();
			}
			if (this.options.enableBatching && !event.isForceSend) {
				return this.addToBatch(eventData);
			}
			const fetchOptions = {
				keepalive: true,
			};
			return this.api.fetch('/', eventData, fetchOptions);
		}

		addToBatch(event) {
			this.batchQueue.push(event);

			if (this.batchTimer === null) {
				this.batchTimer = setTimeout(
					() => this.flushBatch(),
					this.options.batchTimeout
				);
			}

			if (this.batchQueue.length >= this.options.batchSize) {
				this.flushBatch();
			}

			return Promise.resolve();
		}

		async flushBatch() {
			if (this.batchTimer) {
				clearTimeout(this.batchTimer);
				this.batchTimer = null;
			}

			if (this.batchQueue.length === 0) {
				return;
			}

			const batchEvents = [...this.batchQueue];
			this.batchQueue = [];

			try {
				const fetchOptions = {
					keepalive: true,
				};

				const beaconResult = await this.sendBatchBeacon(batchEvents);
				if (beaconResult) {
					return beaconResult;
				}

				const result = await this.api.fetch(
					'/batch',
					batchEvents,
					fetchOptions
				);
				return result;
			} catch (error) {
				const isNetworkError = !error.status && error.name === 'TypeError';

				if (isNetworkError) {
					for (const event of batchEvents) {
						const originalEvent = {
							type: 'track',
							payload: event,
							isForceSend: true,
						};
						this.send(originalEvent);
					}
				}

				return null;
			}
		}

		async sendBatchBeacon(events) {
			if (this.isServer() || !navigator.sendBeacon) {
				return null;
			}

			try {
				const baseUrl = this.api.baseUrl;
				const clientId = this.options.clientId;
				const sdkName = this.options.sdk || 'web';
				const sdkVersion = this.options.sdkVersion || '1.0.0';

				const url = `${baseUrl}/batch?client_id=${encodeURIComponent(clientId)}&sdk_name=${encodeURIComponent(sdkName)}&sdk_version=${encodeURIComponent(sdkVersion)}`;
				const data = JSON.stringify(events);

				const blob = new Blob([data], { type: 'application/json' });
				const success = navigator.sendBeacon(url, blob);

				if (success) {
					return { success: true };
				}
			} catch (_e) {}

			return null;
		}

		setGlobalProperties(props) {
			this.global = {
				...this.global,
				...props,
			};
		}

		async track(eventName, properties) {
			if (this.options.disabled || this.isLikelyBot) {
				return;
			}

			if (this.options.samplingRate < 1.0) {
				const samplingValue = Math.random();

				if (samplingValue > this.options.samplingRate) {
					return { sampled: false };
				}
			}

			let finalProperties;
			if (properties === undefined || properties === null) {
				finalProperties = {};
			} else if (typeof properties === 'object') {
				finalProperties = properties;
			} else {
				finalProperties = { value: properties };
			}

			const baseContext = this.getBaseContext();

			let performanceData = {};
			if (
				(eventName === 'screen_view' || eventName === 'page_view') &&
				!this.isServer() &&
				this.options.trackPerformance
			) {
				performanceData = this.collectNavigationTiming();
			}

			const payload = {
				type: 'track',
				payload: {
					eventId: generateUUIDv4(),
					name: eventName,
					anonymousId: this.anonymousId,
					sessionId: this.sessionId,
					sessionStartTime: this.sessionStartTime,
					timestamp: Date.now(),
					...baseContext,
					...performanceData,
					properties: { ...finalProperties },
				},
			};

			if (this.options.enableBatching) {
				return this.send(payload);
			}

			try {
				const beaconResult = await this.sendBeacon(payload);
				if (beaconResult) {
					return beaconResult;
				}
			} catch (_e) {}

			return this.send(payload);
		}

		async sendBeacon(event) {
			if (this.isServer()) {
				return null;
			}

			try {
				const eventData =
					event.type === 'track' && event.payload ? event.payload : event;

				if (
					this.options.disabled ||
					(this.options.filter && !this.options.filter(eventData))
				) {
					return null;
				}

				const baseUrl = this.options.apiUrl;
				if (!baseUrl) {
					return null;
				}

				const clientId = this.options.clientId;
				const sdkName = this.options.sdk || 'web';
				const sdkVersion = this.options.sdkVersion || '1.0.0';

				const url = new URL('/', baseUrl);
				url.searchParams.set('client_id', clientId);
				url.searchParams.set('sdk_name', sdkName);
				url.searchParams.set('sdk_version', sdkVersion);

				const data = JSON.stringify(eventData);

				if (navigator.sendBeacon) {
					try {
						const blob = new Blob([data], { type: 'application/json' });
						const success = navigator.sendBeacon(url.toString(), blob);

						if (success) {
							return { success: true };
						}
					} catch (_e) {}
				}

				return null;
			} catch (_error) {
				return null;
			}
		}

		clear() {
			this.anonymousId = this.generateAnonymousId();
			if (typeof window !== 'undefined' && window.localStorage) {
				localStorage.setItem('did', this.anonymousId);
			}

			this.sessionId = this.generateSessionId();
			this.sessionStartTime = Date.now();
			this.lastActivityTime = this.sessionStartTime;

			if (!this.isServer()) {
				sessionStorage.setItem('did_session', this.sessionId);
				sessionStorage.setItem(
					'did_session_start',
					this.sessionStartTime.toString()
				);
			}
		}

		flush() {
			if (this.options.enableBatching) {
				this.flushBatch();
			}
		}

		isServer() {
			return (
				typeof document === 'undefined' ||
				typeof window === 'undefined' ||
				typeof localStorage === 'undefined'
			);
		}

		collectNavigationTiming() {
			if (this.isServer() || !this.options.trackPerformance) return {};

			try {
				const navEntry = window.performance?.getEntriesByType('navigation')[0];
				if (!navEntry) return {};

				return {
					load_time: clampValue(Math.round(navEntry.loadEventEnd)),
					dom_ready_time: clampValue(
						Math.round(navEntry.domContentLoadedEventEnd)
					),
					dom_interactive: clampValue(Math.round(navEntry.domInteractive)),
					ttfb: clampValue(
						Math.round(navEntry.responseStart - navEntry.requestStart)
					),
					request_time: clampValue(
						Math.round(navEntry.responseEnd - navEntry.requestStart)
					),
					render_time: Math.max(
						0,
						Math.round(navEntry.domComplete - navEntry.domContentLoadedEventEnd)
					),
				};
			} catch (_e) {
				return {};
			}
		}

		getUtmParams() {
			if (typeof window === 'undefined') return {};

			const urlParams = new URLSearchParams(window.location.search);
			return {
				utm_source: urlParams.get('utm_source'),
				utm_medium: urlParams.get('utm_medium'),
				utm_campaign: urlParams.get('utm_campaign'),
				utm_term: urlParams.get('utm_term'),
				utm_content: urlParams.get('utm_content'),
			};
		}

		detectBot() {
			if (typeof window === 'undefined') return false;
			return (
				navigator.webdriver ||
				!navigator.plugins.length ||
				!navigator.languages.length
			);
		}

		setupBotDetection() {
			if (typeof window === 'undefined') return;

			const handler = () => (this.hasInteracted = true);
			for (const event of ['mousemove', 'scroll', 'keydown']) {
				window.addEventListener(event, handler, { once: true, passive: true });
			}
		}

		setupExitTracking() {
			if (typeof window === 'undefined') {
				return;
			}

			window.addEventListener(
				'scroll',
				() => {
					const scrollHeight =
						document.documentElement.scrollHeight - window.innerHeight;
					const currentScroll = window.scrollY;
					const scrollPercent = Math.min(
						100,
						Math.round((currentScroll / scrollHeight) * 100)
					);
					this.maxScrollDepth = Math.max(this.maxScrollDepth, scrollPercent);
				},
				{ passive: true }
			);

			window.addEventListener('mouseout', (e) => {
				if (e.clientY <= 0) {
					this.hasExitIntent = true;
				}
			});

			document.addEventListener('click', (e) => {
				const link = e.target.closest('a[href]');
				if (link?.href) {
					try {
						const linkUrl = new URL(link.href);
						if (linkUrl.origin === window.location.origin) {
							this.isInternalNavigation = true;
						}
					} catch (_err) {}
				}
			});

			for (const event of ['popstate', 'pushstate', 'replacestate']) {
				window.addEventListener(event, () => {
					this.isInternalNavigation = true;
				});
			}

			const exitHandler = () => {
				if (this.options.enableBatching) {
					this.flushBatch();
				}

				this.trackExitData();

				this.isInternalNavigation = false;
			};

			window.addEventListener('pagehide', exitHandler);

			if (!('onpagehide' in window)) {
				window.addEventListener('beforeunload', exitHandler);
			}
		}

		trackExitData() {
			if (this.isServer()) {
				return;
			}

			const baseContext = this.getBaseContext();

			const exitEventId = `exit_${this.sessionId}_${btoa(window.location.pathname)}_${this.pageEngagementStart}`;

			const page_count = Math.min(MAX_COUNT_VALUE, this.pageCount);
			const interaction_count = Math.min(
				MAX_COUNT_VALUE,
				this.interactionCount
			);
			const time_on_page = Math.min(
				MAX_TIME_ON_PAGE,
				Math.round((Date.now() - this.pageEngagementStart) / 1000)
			);

			const exitEvent = {
				type: 'track',
				payload: {
					eventId: exitEventId,
					name: 'page_exit',
					anonymousId: this.anonymousId,
					sessionId: this.sessionId,
					sessionStartTime: this.sessionStartTime,
					timestamp: Date.now(),
					...baseContext,
					time_on_page,
					scroll_depth: Math.round(this.maxScrollDepth),
					interaction_count,
					has_exit_intent: this.hasExitIntent,
					page_count,
					is_bounce: page_count <= 1 ? 1 : 0,
				},
			};

			this.sendExitEventImmediately(exitEvent);
		}

		async sendExitEventImmediately(exitEvent) {
			try {
				const beaconResult = await this.sendBeacon(exitEvent);
				if (beaconResult) {
					return beaconResult;
				}

				return this.api.fetch('/', exitEvent, {
					keepalive: true,
				});
			} catch (_e) {
				return null;
			}
		}

		getConnectionInfo() {
			if (typeof navigator === 'undefined') {
				return { connection_type: null, rtt: null, downlink: null };
			}
			const connection =
				navigator.connection ||
				navigator.mozConnection ||
				navigator.webkitConnection;
			if (!connection) {
				return { connection_type: null, rtt: null, downlink: null };
			}
			return {
				connection_type: connection.effectiveType || connection.type || null,
				rtt: connection.rtt || null,
				downlink: connection.downlink || null,
			};
		}

		getBaseContext() {
			if (this.isServer()) {
				return {};
			}

			const utmParams = this.getUtmParams();
			const connectionInfo = this.getConnectionInfo();

			const { width, height } = validateDimensions(
				window.innerWidth,
				window.innerHeight
			);
			const viewport_size = width && height ? `${width}x${height}` : null;

			const { width: screenWidth, height: screenHeight } = validateDimensions(
				window.screen.width,
				window.screen.height
			);
			const screen_resolution =
				screenWidth && screenHeight ? `${screenWidth}x${screenHeight}` : null;

			const referrer = validateUrl(
				sanitizeUrl(this.global?.referrer || document.referrer || 'direct')
			);
			const path = validateUrl(sanitizeUrl(window.location.href));

			return {
				path,
				title: document.title,
				referrer,
				screen_resolution,
				viewport_size,
				timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				language: navigator.language,
				connection_type: connectionInfo.connection_type,
				rtt: connectionInfo.rtt,
				downlink: connectionInfo.downlink,
				utm_source: utmParams.utm_source,
				utm_medium: utmParams.utm_medium,
				utm_campaign: utmParams.utm_campaign,
				utm_term: utmParams.utm_term,
				utm_content: utmParams.utm_content,
			};
		}

		async trackError(errorData) {
			if (this.isServer()) {
				return;
			}

			const errorEvent = {
				type: 'error',
				payload: {
					eventId: generateUUIDv4(),
					anonymousId: this.anonymousId,
					sessionId: this.sessionId,
					timestamp: errorData.timestamp || Date.now(),
					path: window.location.pathname,
					message: errorData.message,
					filename: errorData.filename,
					lineno: errorData.lineno,
					colno: errorData.colno,
					stack: errorData.stack,
					errorType: errorData.errorType || 'Error',
				},
			};

			if (this.options.enableBatching) {
				return this.send(errorEvent);
			}

			try {
				const beaconResult = await this.sendBeacon(errorEvent);
				if (beaconResult) {
					return beaconResult;
				}
			} catch (_e) {}

			return this.send(errorEvent);
		}
	};

	function h(a) {
		return a.replace(/([-_][a-z])/gi, (e) =>
			e.toUpperCase().replace('-', '').replace('_', '')
		);
	}

	const d = class extends l {
		constructor(t) {
			super({
				sdk: 'web',
				sdkVersion: '1.0.2',
				...t,
			});

			if (this.isServer()) {
				return;
			}

			if (this.options.trackScreenViews) {
				this.trackScreenViews();
				setTimeout(() => this.screenView(), 0);
			}

			if (this.options.trackOutgoingLinks) {
				this.trackOutgoingLinks();
			}

			if (this.options.trackAttributes) {
				this.trackAttributes();
			}

			this.init();
		}
		debounce(t, r) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = setTimeout(t, r);
		}
		trackOutgoingLinks() {
			this.isServer() ||
				document.addEventListener('click', (t) => {
					const r = t.target;
					const i = r.closest('a');
					if (i && r) {
						const n = i.getAttribute('href');
						if (n) {
							try {
								const url = new URL(n, window.location.origin);
								const isOutgoing = url.origin !== window.location.origin;

								if (isOutgoing) {
									this.track('link_out', {
										href: n,
										text:
											i.innerText ||
											i.getAttribute('title') ||
											r.getAttribute('alt'),
									});
								}
							} catch (_e) {}
						}
					}
				});
		}
		trackScreenViews() {
			if (this.isServer()) {
				return;
			}

			const t = history.pushState;
			history.pushState = function (...s) {
				const o = t.apply(this, s);
				window.dispatchEvent(new Event('pushstate'));
				window.dispatchEvent(new Event('locationchange'));
				return o;
			};

			const r = history.replaceState;
			history.replaceState = function (...s) {
				const o = r.apply(this, s);
				window.dispatchEvent(new Event('replacestate'));
				window.dispatchEvent(new Event('locationchange'));
				return o;
			};

			window.addEventListener('popstate', () => {
				window.dispatchEvent(new Event('locationchange'));
			});

			this.pageEngagementStart = Date.now();

			const i = () =>
				this.debounce(() => {
					const previous_path =
						this.lastPath || sanitizeUrl(window.location.href);
					this.setGlobalProperties({
						referrer: previous_path,
					});
					this.isInternalNavigation = true;
					this.screenView();
				}, 50);

			this.options.trackHashChanges
				? window.addEventListener('hashchange', i)
				: window.addEventListener('locationchange', i);
		}
		trackAttributes() {
			this.isServer() ||
				document.addEventListener('click', (t) => {
					const r = t.target;
					const i = r.closest('button');
					const n = r.closest('a');
					const s = i?.getAttribute('data-track')
						? i
						: n?.getAttribute('data-track')
							? n
							: null;
					if (s) {
						const o = {};
						for (const p of s.attributes) {
							if (p.name.startsWith('data-') && p.name !== 'data-track') {
								o[h(p.name.replace(/^data-/, ''))] = p.value;
							}
						}
						const u = s.getAttribute('data-track');
						u && this.track(u, o);
					}
				});
		}
		screenView(t, r) {
			if (this.isServer()) {
				return;
			}

			let i;
			let n;

			if (
				this.lastPath &&
				this.pageEngagementStart &&
				this.options.trackEngagement
			) {
				this.maxScrollDepth = 0;
				this.interactionCount = 0;
				this.hasExitIntent = false;
			}

			this.pageEngagementStart = Date.now();

			if (typeof t === 'string') {
				i = t;
				n = r;
			} else {
				i = sanitizeUrl(window.location.href);
				n = t;
			}

			if (this.lastPath !== i) {
				this.lastPath = i;
				this.pageCount++;

				this.isInternalNavigation = false;

				// Clamp page_count
				const pageData = {
					page_count: Math.min(MAX_COUNT_VALUE, this.pageCount),
					...(n ?? {}),
				};

				this.track('screen_view', pageData);
			}
		}
	};

	function initializeDatabuddy() {
		if (typeof window === 'undefined' || window.databuddy) {
			return;
		}

		// Check for opt-out flags
		try {
			if (
				localStorage.getItem('databuddy_opt_out') === 'true' ||
				localStorage.getItem('databuddy_disabled') === 'true' ||
				window.databuddyOptedOut === true ||
				window.databuddyDisabled === true
			) {
				// Set up no-op functions for compatibility
				window.databuddy = {
					track: noop,
					screenView: noop,
					clear: noop,
					flush: noop,
					setGlobalProperties: noop,
					trackCustomEvent: noop,
					options: { disabled: true },
				};

				window.db = {
					track: noop,
					screenView: noop,
					clear: noop,
					flush: noop,
					setGlobalProperties: noop,
					trackCustomEvent: noop,
				};

				return;
			}
		} catch (_e) {
			// localStorage not available, continue with initialization
		}

		const currentScript =
			document.currentScript ||
			(() => {
				const scripts = document.getElementsByTagName('script');
				// biome-ignore lint/style/useAt: not supported in all target browsers
				return scripts[scripts.length - 1];
			})();

		function getConfig() {
			const globalConfig = window.databuddyConfig || {};

			if (!currentScript) {
				return globalConfig;
			}

			const dataAttributes = {};
			for (const attr of currentScript.attributes) {
				if (attr.name.startsWith('data-')) {
					const key = attr.name
						.substring(5)
						.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

					const value = attr.value;

					if (value === 'true') {
						dataAttributes[key] = true;
					} else if (value === 'false') {
						dataAttributes[key] = false;
					} else if (/^\d+$/.test(value)) {
						dataAttributes[key] = Number(value);
					} else {
						dataAttributes[key] = value;
					}
				}
			}

			const urlParams = {};
			try {
				const srcUrl = new URL(currentScript.src);
				const params = new URLSearchParams(srcUrl.search);

				params.forEach((value, key) => {
					if (value === 'true') {
						urlParams[key] = true;
					} else if (value === 'false') {
						urlParams[key] = false;
					} else if (/^\d+$/.test(value)) {
						urlParams[key] = Number(value);
					} else {
						urlParams[key] = value;
					}
				});
			} catch (_e) {}

			const config = {
				...globalConfig,
				...urlParams,
				...dataAttributes,
			};

			if (config.samplingRate !== undefined) {
				if (config.samplingRate < 0) {
					config.samplingRate = 0;
				}
				if (config.samplingRate > 1) {
					config.samplingRate = 1;
				}
			}

			if (config.maxRetries !== undefined && config.maxRetries < 0) {
				config.maxRetries = 0;
			}

			config.initialRetryDelay = validateConfigRange(
				config.initialRetryDelay,
				MIN_RETRY_DELAY,
				MAX_RETRY_DELAY
			);
			config.batchSize = validateConfigRange(
				config.batchSize,
				MIN_BATCH_SIZE,
				MAX_BATCH_SIZE
			);
			config.batchTimeout = validateConfigRange(
				config.batchTimeout,
				MIN_BATCH_TIMEOUT,
				MAX_BATCH_TIMEOUT
			);

			if (config.apiUrl) {
				try {
					new URL(config.apiUrl);
				} catch (_e) {
					config.apiUrl = 'https://basket.databuddy.cc';
				}
			} else {
				config.apiUrl = 'https://basket.databuddy.cc';
			}

			return config;
		}

		function getClientId(config) {
			if (config.clientId) {
				return config.clientId;
			}

			if (currentScript?.getAttribute('data-client-id')) {
				return currentScript.getAttribute('data-client-id');
			}

			return null;
		}

		function init() {
			if (window.databuddy) {
				return;
			}

			const config = getConfig();
			const clientId = getClientId(config);

			if (!clientId) {
				return;
			}
			window.databuddy = new d({
				...config,
				clientId,
			});

			window.db = {
				track: (...args) => window.databuddy?.track(...args),
				screenView: (...args) => window.databuddy?.screenView(...args),
				clear: () => window.databuddy?.clear(),
				flush: () => window.databuddy?.flush(),
				setGlobalProperties: (...args) =>
					window.databuddy?.setGlobalProperties(...args),
				trackCustomEvent: (...args) =>
					window.databuddy?.trackCustomEvent(...args),
			};
		}

		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', init);
		} else {
			init();
		}
	}

	initializeDatabuddy();

	// Opt-out functionality
	if (typeof window !== 'undefined') {
		window.Databuddy = d;

		// Global opt-out functions
		window.databuddyOptOut = () => {
			try {
				localStorage.setItem('databuddy_opt_out', 'true');
				localStorage.setItem('databuddy_disabled', 'true');
			} catch (_e) {
				// localStorage not available
			}

			window.databuddyOptedOut = true;
			window.databuddyDisabled = true;

			// Disable existing instance
			if (window.databuddy && typeof window.databuddy === 'object') {
				window.databuddy.options.disabled = true;

				// Override methods to no-ops
				window.databuddy.track = noop;
				window.databuddy.screenView = noop;
				window.databuddy.trackCustomEvent = noop;
				window.databuddy.clear = noop;
				window.databuddy.flush = noop;
				window.databuddy.setGlobalProperties = noop;
			}

			if (window.db) {
				window.db.track = noop;
				window.db.screenView = noop;
				window.db.trackCustomEvent = noop;
				window.db.clear = noop;
				window.db.flush = noop;
				window.db.setGlobalProperties = noop;
			}

			console.log(
				'Databuddy: Tracking has been disabled. Reload the page for full effect.'
			);
		};

		window.databuddyOptIn = () => {
			try {
				localStorage.removeItem('databuddy_opt_out');
				localStorage.removeItem('databuddy_disabled');
			} catch (_e) {
				// localStorage not available
			}

			window.databuddyOptedOut = false;
			window.databuddyDisabled = false;

			console.log(
				'Databuddy: Tracking has been enabled. Reload the page for full effect.'
			);
		};

		// Check if user wants to opt out via URL parameter
		try {
			const urlParams = new URLSearchParams(window.location.search);
			if (
				urlParams.get('databuddy_opt_out') === 'true' ||
				urlParams.get('no_tracking') === 'true'
			) {
				window.databuddyOptOut();
			}
		} catch (_e) {
			// URL parsing failed
		}
	} else if (typeof exports === 'object') {
		module.exports = d;
	}
})();
