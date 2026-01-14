import { randomUUID } from "node:crypto";
import type {
	AICallSpan,
	AnalyticsEvent,
	CustomEventSpan,
	CustomOutgoingLink,
	ErrorSpanRow,
	WebVitalsSpan,
} from "@databuddy/db";
import type {
	CustomEventSpanInput,
	ErrorSpan,
	IndividualVital,
} from "@databuddy/validation";
import { sendEvent, sendEventBatch } from "@lib/producer";
import { checkDuplicate, getDailySalt, saltAnonymousId } from "@lib/security";
import { captureError, record, setAttributes } from "@lib/tracing";
import { getGeo } from "@utils/ip-geo";
import { parseUserAgent } from "@utils/user-agent";
import {
	sanitizeString,
	VALIDATION_LIMITS,
	validatePerformanceMetric,
	validateSessionId,
} from "@utils/validation";

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
			event_type: "track",
			event_id: eventId,
			client_id: clientId,
			event_name: trackData.name,
		});

		const [isDuplicate, geoData, salt] = await Promise.all([
			checkDuplicate(eventId, "track"),
			getGeo(ip),
			getDailySalt(),
		]);

		if (isDuplicate) {
			setAttributes({ event_duplicate: true });
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
			geo_country: country || "unknown",
			geo_city: city || "unknown",
			browser_name: browserName || "unknown",
			device_type: deviceType || "unknown",
			event_path: trackData.path,
		});

		try {
			sendEvent("analytics-events", trackEvent);
		} catch (error) {
			captureError(error, { eventId });
		}
	});
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
		anonymous_id: sanitizeString(
			event.anonymousId,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		),
		session_id: validateSessionId(event.sessionId),
		timestamp: typeof event.timestamp === "number" ? event.timestamp : now,
		path: sanitizeString(event.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
		event_name: sanitizeString(
			event.eventName,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		),
		properties: (event.properties as Record<string, unknown>) ?? {},
	}));

	try {
		await sendEventBatch("analytics-custom-event-spans", spans);
	} catch (error) {
		captureError(error, { count: spans.length });
	}
}

export function insertTrackEventsBatch(
	events: AnalyticsEvent[]
): Promise<void> {
	return record("insertTrackEventsBatch", async () => {
		if (events.length === 0) {
			return;
		}

		setAttributes({
			batch_type: "track",
			batch_size: events.length,
		});

		try {
			await sendEventBatch("analytics-events", events);
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
		anonymous_id: sanitizeString(
			error.anonymousId,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		),
		session_id: validateSessionId(error.sessionId),
		timestamp: typeof error.timestamp === "number" ? error.timestamp : now,
		path: sanitizeString(error.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
		message: sanitizeString(error.message, VALIDATION_LIMITS.STRING_MAX_LENGTH),
		filename: sanitizeString(
			error.filename,
			VALIDATION_LIMITS.STRING_MAX_LENGTH
		),
		lineno: error.lineno ?? undefined,
		colno: error.colno ?? undefined,
		stack: sanitizeString(error.stack, VALIDATION_LIMITS.STRING_MAX_LENGTH),
		error_type:
			sanitizeString(
				error.errorType,
				VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
			) || "Error",
	}));

	try {
		await sendEventBatch("analytics-error-spans", spans);
	} catch (error) {
		captureError(error, { count: spans.length });
	}
}

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
		anonymous_id: sanitizeString(
			vital.anonymousId,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		),
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

export function insertOutgoingLinksBatch(
	events: CustomOutgoingLink[]
): Promise<void> {
	return record("insertOutgoingLinksBatch", async () => {
		if (events.length === 0) {
			return;
		}

		setAttributes({
			batch_type: "outgoing_link",
			batch_size: events.length,
		});

		try {
			await sendEventBatch("analytics-outgoing-links", events);
		} catch (error) {
			captureError(error, { count: events.length });
		}
	});
}

/**
 * Insert AI call spans
 */
export async function insertAICallSpans(
	calls: Array<{
		website_id?: string;
		user_id: string;
		timestamp: number;
		type: "generate" | "stream";
		model: string;
		provider: string;
		finish_reason?: string;
		input_tokens: number;
		output_tokens: number;
		total_tokens: number;
		cached_input_tokens?: number;
		cache_creation_input_tokens?: number;
		reasoning_tokens?: number;
		web_search_count?: number;
		input_token_cost_usd?: number;
		output_token_cost_usd?: number;
		total_token_cost_usd?: number;
		tool_call_count: number;
		tool_result_count: number;
		tool_call_names: string[];
		duration_ms: number;
		trace_id?: string;
		http_status?: number;
		error_name?: string;
		error_message?: string;
		error_stack?: string;
	}>,
	websiteId?: string
): Promise<void> {
	if (calls.length === 0) {
		return;
	}

	const spans: AICallSpan[] = calls.map((call) => ({
		website_id: call.website_id ?? websiteId,
		user_id: call.user_id,
		timestamp: call.timestamp,
		type: call.type,
		model: call.model,
		provider: call.provider,
		finish_reason: call.finish_reason,
		input_tokens: call.input_tokens,
		output_tokens: call.output_tokens,
		total_tokens: call.total_tokens,
		cached_input_tokens: call.cached_input_tokens,
		cache_creation_input_tokens: call.cache_creation_input_tokens,
		reasoning_tokens: call.reasoning_tokens,
		web_search_count: call.web_search_count,
		input_token_cost_usd: call.input_token_cost_usd,
		output_token_cost_usd: call.output_token_cost_usd,
		total_token_cost_usd: call.total_token_cost_usd,
		tool_call_count: call.tool_call_count,
		tool_result_count: call.tool_result_count,
		tool_call_names: call.tool_call_names,
		duration_ms: call.duration_ms,
		trace_id: call.trace_id,
		http_status: call.http_status,
		error_name: call.error_name,
		error_message: call.error_message,
		error_stack: call.error_stack,
	}));

	try {
		await sendEventBatch("analytics-ai-call-spans", spans);
	} catch (error) {
		captureError(error, { count: spans.length });
	}
}
