import { randomUUID } from "node:crypto";
import type {
	AnalyticsEvent,
	CustomEvent,
	CustomEventSpan,
	CustomOutgoingLink,
	ErrorEvent,
	ErrorSpanRow,
	WebVitalsEvent,
	WebVitalsSpan,
} from "@databuddy/db";
import type { CustomEventSpanInput, ErrorSpan, IndividualVital } from "@databuddy/validation";
import { getGeo } from "../utils/ip-geo";
import { parseUserAgent } from "../utils/user-agent";
import {
	sanitizeString,
	VALIDATION_LIMITS,
	validatePerformanceMetric,
	validateSessionId,
} from "../utils/validation";
import { sendEvent, sendEventBatch } from "./producer";
import { checkDuplicate, getDailySalt, saltAnonymousId } from "./security";
import { captureError, record, setAttributes } from "./tracing";

/**
 * Insert an error event into the database
 */
export function insertError(
	errorData: any,
	clientId: string,
	userAgent: string,
	ip: string
): Promise<void> {
	return record("insertError", async () => {
		const payload = errorData.payload || errorData;

		let eventId = sanitizeString(
			errorData.payload.eventId,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		);

		if (!eventId) {
			eventId = randomUUID();
		}

		setAttributes({
			"event.type": "error",
			"event.id": eventId,
			"client.id": clientId,
		});

		const [isDuplicate, geoData] = await Promise.all([
			checkDuplicate(eventId, "error"),
			getGeo(ip),
		]);

		if (isDuplicate) {
			setAttributes({ "event.duplicate": true });
			return;
		}

		const now = Date.now();

		const { anonymizedIP, country, region } = geoData;
		const { browserName, browserVersion, osName, osVersion, deviceType } =
			await parseUserAgent(userAgent);

		const errorEvent: ErrorEvent = {
			id: randomUUID(),
			client_id: clientId,
			event_id: eventId,
			anonymous_id: sanitizeString(
				payload.anonymousId,
				VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
			),
			session_id: validateSessionId(payload.sessionId),
			timestamp:
				typeof payload.timestamp === "number" ? payload.timestamp : now,
			path: sanitizeString(payload.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
			message: sanitizeString(
				payload.message,
				VALIDATION_LIMITS.STRING_MAX_LENGTH
			),
			filename: sanitizeString(
				payload.filename,
				VALIDATION_LIMITS.STRING_MAX_LENGTH
			),
			lineno: payload.lineno,
			colno: payload.colno,
			stack: sanitizeString(payload.stack, VALIDATION_LIMITS.STRING_MAX_LENGTH),
			error_type: sanitizeString(
				payload.errorType,
				VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
			),
			// Enriched fields
			ip: anonymizedIP || "",
			country: country || "",
			region: region || "",
			browser_name: browserName || "",
			browser_version: browserVersion || "",
			os_name: osName || "",
			os_version: osVersion || "",
			device_type: deviceType || "",
			created_at: now,
		};

		setAttributes({
			"error.message": payload.message,
			"error.type": payload.errorType,
			"geo.country": country || "unknown",
		});

		try {
			sendEvent("analytics-errors", errorEvent);
		} catch (error) {
			captureError(error, { eventId });
		}
	});
}

/**
 * Insert web vitals metrics into the database
 */
export async function insertWebVitals(
	vitalsData: any,
	clientId: string,
	userAgent: string,
	ip: string
): Promise<void> {
	const payload = vitalsData.payload || vitalsData;

	let eventId = sanitizeString(
		payload.eventId || payload.event_id,
		VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
	);

	if (!eventId) {
		eventId = randomUUID();
	}

	if (await checkDuplicate(eventId, "web_vitals")) {
		return;
	}

	const now = Date.now();

	const { country, region } = await getGeo(ip);
	const { browserName, browserVersion, osName, osVersion, deviceType } =
		await parseUserAgent(userAgent);

	const webVitalsEvent: WebVitalsEvent = {
		id: randomUUID(),
		client_id: clientId,
		event_id: eventId,
		anonymous_id: sanitizeString(
			payload.anonymousId,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		),
		session_id: validateSessionId(payload.sessionId),
		timestamp: typeof payload.timestamp === "number" ? payload.timestamp : now,
		path: sanitizeString(payload.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
		fcp: validatePerformanceMetric(payload.fcp),
		lcp: validatePerformanceMetric(payload.lcp),
		cls: validatePerformanceMetric(payload.cls),
		fid: validatePerformanceMetric(payload.fid),
		inp: validatePerformanceMetric(payload.inp),
		// Enriched fields
		country: country || "",
		region: region || "",
		browser_name: browserName || "",
		browser_version: browserVersion || "",
		os_name: osName || "",
		os_version: osVersion || "",
		device_type: deviceType || "",
		created_at: now,
	};

	try {
		sendEvent("analytics-web-vitals", webVitalsEvent);
	} catch (error) {
		captureError(error, { eventId });
		// Don't throw - event is buffered or sent async
	}
}

/**
 * Insert a custom event into the database
 */
export async function insertCustomEvent(
	customData: any,
	clientId: string,
	_userAgent: string,
	_ip: string
): Promise<void> {
	let eventId = sanitizeString(
		customData.eventId,
		VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
	);

	if (!eventId) {
		eventId = randomUUID();
	}

	if (await checkDuplicate(eventId, "custom")) {
		return;
	}

	const now = Date.now();

	const customEvent: CustomEvent = {
		id: randomUUID(),
		client_id: clientId,
		event_name: sanitizeString(
			customData.name,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		),
		anonymous_id: sanitizeString(
			customData.anonymousId,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		),
		session_id: validateSessionId(customData.sessionId),
		properties: customData.properties
			? JSON.stringify(customData.properties)
			: "{}",
		timestamp:
			typeof customData.timestamp === "number" ? customData.timestamp : now,
	};

	try {
		sendEvent("analytics-custom-events", customEvent);
	} catch (error) {
		captureError(error, { eventId });
		// Don't throw - event is buffered or sent async
	}
}

/**
 * Insert lean custom event spans (v2.x format)
 */
export async function insertCustomEventSpans(
	events: CustomEventSpanInput[],
	clientId: string
): Promise<void> {
	if (events.length === 0) {
		return;
	}

	const now = Date.now();
	const spans: CustomEventSpan[] = events.map((event) => ({
		client_id: clientId,
		anonymous_id: sanitizeString(event.anonymousId, VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH),
		session_id: validateSessionId(event.sessionId),
		timestamp: typeof event.timestamp === "number" ? event.timestamp : now,
		path: sanitizeString(event.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
		event_name: sanitizeString(event.eventName, VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH),
		properties: (event.properties as Record<string, unknown>) ?? {},
	}));

	try {
		await sendEventBatch("analytics-custom-event-spans", spans);
	} catch (error) {
		captureError(error, { count: spans.length });
	}
}

/**
 * Insert an outgoing link click event into the database
 */
export async function insertOutgoingLink(
	linkData: any,
	clientId: string,
	_userAgent: string,
	_ip: string
): Promise<void> {
	let eventId = sanitizeString(
		linkData.eventId,
		VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
	);

	if (!eventId) {
		eventId = randomUUID();
	}

	if (await checkDuplicate(eventId, "outgoing_link")) {
		return;
	}

	const now = Date.now();

	const outgoingLinkEvent: CustomOutgoingLink = {
		id: randomUUID(),
		client_id: clientId,
		anonymous_id: sanitizeString(
			linkData.anonymousId,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		),
		session_id: validateSessionId(linkData.sessionId),
		href: sanitizeString(linkData.href, VALIDATION_LIMITS.PATH_MAX_LENGTH),
		text: sanitizeString(linkData.text, VALIDATION_LIMITS.TEXT_MAX_LENGTH),
		properties: linkData.properties
			? JSON.stringify(linkData.properties)
			: "{}",
		timestamp:
			typeof linkData.timestamp === "number" ? linkData.timestamp : now,
	};

	try {
		sendEvent("analytics-outgoing-links", outgoingLinkEvent);
	} catch (error) {
		captureError(error, { eventId });
	}
}

/**
 * Insert a track event (pageview/analytics event) via Kafka
 */
export function insertTrackEvent(
	trackData: any,
	clientId: string,
	userAgent: string,
	ip: string
): Promise<void> {
	return record("insertTrackEvent", async () => {
		let eventId = sanitizeString(
			trackData.eventId,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		);

		if (!eventId) {
			eventId = randomUUID();
		}

		setAttributes({
			"event.type": "track",
			"event.id": eventId,
			"client.id": clientId,
			"event.name": trackData.name,
		});

		const [isDuplicate, geoData, salt] = await Promise.all([
			checkDuplicate(eventId, "track"),
			getGeo(ip),
			getDailySalt(),
		]);

		if (isDuplicate) {
			setAttributes({ "event.duplicate": true });
			return;
		}

		let anonymousId = sanitizeString(
			trackData.anonymousId,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		);
		if (anonymousId) {
			anonymousId = saltAnonymousId(anonymousId, salt);
		}

		const { anonymizedIP, country, region, city } = geoData;
		const {
			browserName,
			browserVersion,
			osName,
			osVersion,
			deviceType,
			deviceBrand,
			deviceModel,
		} = await parseUserAgent(userAgent);
		const now = Date.now();

		const trackEvent: AnalyticsEvent = {
			id: randomUUID(),
			client_id: clientId,
			event_name: sanitizeString(
				trackData.name,
				VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
			),
			anonymous_id: anonymousId,
			time: typeof trackData.timestamp === "number" ? trackData.timestamp : now,
			session_id: validateSessionId(trackData.sessionId),
			event_type: "track",
			event_id: eventId,
			session_start_time:
				typeof trackData.sessionStartTime === "number"
					? trackData.sessionStartTime
					: now,
			timestamp:
				typeof trackData.timestamp === "number" ? trackData.timestamp : now,

			referrer: sanitizeString(
				trackData.referrer,
				VALIDATION_LIMITS.STRING_MAX_LENGTH
			),
			url: sanitizeString(trackData.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
			path: sanitizeString(trackData.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
			title: sanitizeString(
				trackData.title,
				VALIDATION_LIMITS.STRING_MAX_LENGTH
			),

			ip: anonymizedIP || "",
			user_agent: "",
			browser_name: browserName || "",
			browser_version: browserVersion || "",
			os_name: osName || "",
			os_version: osVersion || "",
			device_type: deviceType || "",
			device_brand: deviceBrand || "",
			device_model: deviceModel || "",
			country: country || "",
			region: region || "",
			city: city || "",

			screen_resolution: trackData.screen_resolution,
			viewport_size: trackData.viewport_size,
			language: trackData.language,
			timezone: trackData.timezone,

			connection_type: trackData.connection_type,
			rtt: trackData.rtt,
			downlink: trackData.downlink,

			time_on_page: trackData.time_on_page,
			scroll_depth: trackData.scroll_depth,
			interaction_count: trackData.interaction_count,
			page_count: trackData.page_count || 1,

			utm_source: trackData.utm_source,
			utm_medium: trackData.utm_medium,
			utm_campaign: trackData.utm_campaign,
			utm_term: trackData.utm_term,
			utm_content: trackData.utm_content,

			load_time: validatePerformanceMetric(trackData.load_time),
			dom_ready_time: validatePerformanceMetric(trackData.dom_ready_time),
			dom_interactive: validatePerformanceMetric(trackData.dom_interactive),
			ttfb: validatePerformanceMetric(trackData.ttfb),
			connection_time: validatePerformanceMetric(trackData.connection_time),
			render_time: validatePerformanceMetric(trackData.render_time),
			redirect_time: validatePerformanceMetric(trackData.redirect_time),
			domain_lookup_time: validatePerformanceMetric(
				trackData.domain_lookup_time
			),

			properties: trackData.properties
				? JSON.stringify(trackData.properties)
				: "{}",
			created_at: now,
		};

		setAttributes({
			"geo.country": country || "unknown",
			"geo.city": city || "unknown",
			"browser.name": browserName || "unknown",
			"device.type": deviceType || "unknown",
			"event.path": trackData.path,
		});

		try {
			sendEvent("analytics-events", trackEvent);
		} catch (error) {
			captureError(error, { eventId });
		}
	});
}

export function insertTrackEventsBatch(
	events: AnalyticsEvent[]
): Promise<void> {
	return record("insertTrackEventsBatch", async () => {
		if (events.length === 0) {
			return;
		}

		setAttributes({
			"batch.type": "track",
			"batch.size": events.length,
		});

		try {
			await sendEventBatch("analytics-events", events);
		} catch (error) {
			captureError(error, { count: events.length });
		}
	});
}

export function insertErrorsBatch(events: ErrorEvent[]): Promise<void> {
	return record("insertErrorsBatch", async () => {
		if (events.length === 0) {
			return;
		}

		setAttributes({
			"batch.type": "error",
			"batch.size": events.length,
		});

		try {
			await sendEventBatch("analytics-errors", events);
		} catch (error) {
			captureError(error, { count: events.length });
		}
	});
}

/**
 * Insert lean error spans (v2.x format)
 */
export async function insertErrorSpans(
	errors: ErrorSpan[],
	clientId: string
): Promise<void> {
	if (errors.length === 0) {
		return;
	}

	const now = Date.now();
	const spans: ErrorSpanRow[] = errors.map((error) => ({
		client_id: clientId,
		anonymous_id: sanitizeString(error.anonymousId, VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH),
		session_id: validateSessionId(error.sessionId),
		timestamp: typeof error.timestamp === "number" ? error.timestamp : now,
		path: sanitizeString(error.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
		message: sanitizeString(error.message, VALIDATION_LIMITS.STRING_MAX_LENGTH),
		filename: sanitizeString(error.filename, VALIDATION_LIMITS.STRING_MAX_LENGTH),
		lineno: error.lineno ?? undefined,
		colno: error.colno ?? undefined,
		stack: sanitizeString(error.stack, VALIDATION_LIMITS.STRING_MAX_LENGTH),
		error_type: sanitizeString(error.errorType, VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH) || "Error",
	}));

	try {
		await sendEventBatch("analytics-error-spans", spans);
	} catch (error) {
		captureError(error, { count: spans.length });
	}
}

export function insertWebVitalsBatch(events: WebVitalsEvent[]): Promise<void> {
	return record("insertWebVitalsBatch", async () => {
		if (events.length === 0) {
			return;
		}

		setAttributes({
			"batch.type": "web_vitals",
			"batch.size": events.length,
		});

		try {
			await sendEventBatch("analytics-web-vitals", events);
		} catch (error) {
			captureError(error, { count: events.length });
		}
	});
}

/**
 * Insert individual vital metrics (v2.x format)
 * Transforms and groups metrics before storing
 */
/**
 * Insert individual vital metrics (v2.x format) as spans
 * Each metric is stored as a separate row - no aggregation
 */
export async function insertIndividualVitals(
	vitals: IndividualVital[],
	clientId: string
): Promise<void> {
	if (vitals.length === 0) {
		return;
	}

	const now = Date.now();
	const spans: WebVitalsSpan[] = vitals.map((vital) => ({
		client_id: clientId,
		anonymous_id: sanitizeString(vital.anonymousId, VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH),
		session_id: validateSessionId(vital.sessionId),
		timestamp: typeof vital.timestamp === "number" ? vital.timestamp : now,
		path: sanitizeString(vital.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
		metric_name: vital.metricName,
		metric_value: vital.metricValue,
	}));

	try {
		await sendEventBatch("analytics-vitals-spans", spans);
	} catch (error) {
		captureError(error, { count: spans.length });
	}
}

export function insertCustomEventsBatch(events: CustomEvent[]): Promise<void> {
	return record("insertCustomEventsBatch", async () => {
		if (events.length === 0) {
			return;
		}

		setAttributes({
			"batch.type": "custom",
			"batch.size": events.length,
		});

		try {
			await sendEventBatch("analytics-custom-events", events);
		} catch (error) {
			captureError(error, { count: events.length });
		}
	});
}

export function insertOutgoingLinksBatch(
	events: CustomOutgoingLink[]
): Promise<void> {
	return record("insertOutgoingLinksBatch", async () => {
		if (events.length === 0) {
			return;
		}

		setAttributes({
			"batch.type": "outgoing_link",
			"batch.size": events.length,
		});

		try {
			await sendEventBatch("analytics-outgoing-links", events);
		} catch (error) {
			captureError(error, { count: events.length });
		}
	});
}
