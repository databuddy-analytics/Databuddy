import type {
	AnalyticsEvent,
	CustomOutgoingLink,
	ErrorSpanRow,
	WebVitalsSpan,
} from "@databuddy/db/clickhouse/schema";
import type { ErrorSpan, IndividualVital } from "@databuddy/validation";
import { runFork, runPromise, send, sendBatch } from "@lib/producer";
import { checkDuplicate, getDailySalt, saltAnonymousId } from "@lib/security";
import { record } from "@lib/tracing";
import { getGeo } from "@utils/ip-geo";
import { parseUserAgent } from "@utils/user-agent";
import {
	sanitizeString,
	VALIDATION_LIMITS,
	validatePerformanceMetric,
	validateSessionId,
} from "@utils/validation";
import { randomUUIDv7 } from "bun";
import { useLogger } from "evlog/elysia";

export interface TrackEventContext {
	anonymousId: string;
	clientId: string;
	eventId: string;
	geo: {
		anonymizedIP: string;
		country?: string;
		region?: string;
		city?: string;
	};
	now: number;
	ua: {
		browserName?: string;
		browserVersion?: string;
		osName?: string;
		osVersion?: string;
		deviceType?: string;
		deviceBrand?: string;
		deviceModel?: string;
	};
}

export function buildTrackEvent(
	trackData: any,
	ctx: TrackEventContext
): AnalyticsEvent {
	const timestamp =
		typeof trackData.timestamp === "number" ? trackData.timestamp : ctx.now;
	const sessionStartTime =
		typeof trackData.sessionStartTime === "number"
			? trackData.sessionStartTime
			: ctx.now;

	return {
		id: randomUUIDv7(),
		client_id: ctx.clientId,
		event_name: sanitizeString(
			trackData.name,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		),
		anonymous_id: ctx.anonymousId,
		time: timestamp,
		session_id: validateSessionId(trackData.sessionId),
		event_type: "track",
		event_id: ctx.eventId,
		session_start_time: sessionStartTime,
		timestamp,
		referrer: sanitizeString(
			trackData.referrer,
			VALIDATION_LIMITS.STRING_MAX_LENGTH
		),
		url: sanitizeString(trackData.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
		path: sanitizeString(trackData.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
		title: sanitizeString(trackData.title, VALIDATION_LIMITS.STRING_MAX_LENGTH),
		ip: ctx.geo.anonymizedIP || "",
		user_agent: "",
		browser_name: ctx.ua.browserName || "",
		browser_version: ctx.ua.browserVersion || "",
		os_name: ctx.ua.osName || "",
		os_version: ctx.ua.osVersion || "",
		device_type: ctx.ua.deviceType || "",
		device_brand: ctx.ua.deviceBrand || "",
		device_model: ctx.ua.deviceModel || "",
		country: ctx.geo.country || "",
		region: ctx.geo.region || "",
		city: ctx.geo.city || "",
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
		gclid: trackData.gclid,
		load_time: validatePerformanceMetric(trackData.load_time),
		dom_ready_time: validatePerformanceMetric(trackData.dom_ready_time),
		dom_interactive: validatePerformanceMetric(trackData.dom_interactive),
		ttfb: validatePerformanceMetric(trackData.ttfb),
		connection_time: validatePerformanceMetric(trackData.connection_time),
		render_time: validatePerformanceMetric(trackData.render_time),
		redirect_time: validatePerformanceMetric(trackData.redirect_time),
		domain_lookup_time: validatePerformanceMetric(trackData.domain_lookup_time),
		properties: trackData.properties
			? JSON.stringify(trackData.properties)
			: "{}",
		created_at: ctx.now,
	};
}

export function insertTrackEvent(
	trackData: any,
	clientId: string,
	userAgent: string,
	ip: string,
	request?: Request
): Promise<void> {
	return record("insertTrackEvent", async () => {
		const log = useLogger();
		let eventId = sanitizeString(
			trackData.eventId,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		);
		if (!eventId) {
			eventId = randomUUIDv7();
		}

		const [isDuplicate, geoData, salt] = await Promise.all([
			checkDuplicate(eventId, "track"),
			getGeo(ip, request),
			getDailySalt(),
		]);

		if (isDuplicate) {
			return;
		}

		log.set({
			event: { id: eventId, name: trackData.name, path: trackData.path },
			geo: {
				country: geoData.country,
				region: geoData.region,
				city: geoData.city,
			},
		});

		let anonymousId = sanitizeString(
			trackData.anonymousId,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		);
		if (anonymousId) {
			anonymousId = saltAnonymousId(anonymousId, salt);
		}

		const ua = await parseUserAgent(userAgent);
		const now = Date.now();

		const trackEvent = buildTrackEvent(trackData, {
			clientId,
			eventId,
			anonymousId,
			geo: geoData,
			ua,
			now,
		});

		runFork(send("analytics-events", trackEvent));
	});
}

export function insertOutgoingLink(
	linkData: any,
	clientId: string,
	_userAgent: string,
	_ip: string
): Promise<void> {
	return record("insertOutgoingLink", async () => {
		const log = useLogger();
		let eventId = sanitizeString(
			linkData.eventId,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		);

		if (!eventId) {
			eventId = randomUUIDv7();
		}

		if (await checkDuplicate(eventId, "outgoing_link")) {
			return;
		}

		log.set({
			event: { id: eventId, type: "outgoing_link", href: linkData.href },
		});

		const now = Date.now();

		const salt = await getDailySalt();
		const rawId = sanitizeString(
			linkData.anonymousId,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		);

		const outgoingLinkEvent: CustomOutgoingLink = {
			id: randomUUIDv7(),
			client_id: clientId,
			anonymous_id: rawId ? saltAnonymousId(rawId, salt) : rawId,
			session_id: validateSessionId(linkData.sessionId),
			href: sanitizeString(linkData.href, VALIDATION_LIMITS.PATH_MAX_LENGTH),
			text: sanitizeString(linkData.text, VALIDATION_LIMITS.TEXT_MAX_LENGTH),
			properties: linkData.properties
				? JSON.stringify(linkData.properties)
				: "{}",
			timestamp:
				typeof linkData.timestamp === "number" ? linkData.timestamp : now,
		};

		runFork(send("analytics-outgoing-links", outgoingLinkEvent));
	});
}

export function insertTrackEventsBatch(
	events: AnalyticsEvent[]
): Promise<void> {
	return record("insertTrackEventsBatch", async () => {
		if (events.length === 0) {
			return;
		}

		await runPromise(sendBatch("analytics-events", events));
	});
}

export function insertErrorSpans(
	errors: ErrorSpan[],
	clientId: string
): Promise<void> {
	return record("insertErrorSpans", async () => {
		if (errors.length === 0) {
			return;
		}

		const salt = await getDailySalt();
		const now = Date.now();
		const spans: ErrorSpanRow[] = errors.map((error) => {
			const rawId = sanitizeString(
				error.anonymousId,
				VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
			);
			return {
				client_id: clientId,
				anonymous_id: rawId ? saltAnonymousId(rawId, salt) : rawId,
				session_id: validateSessionId(error.sessionId),
				timestamp: typeof error.timestamp === "number" ? error.timestamp : now,
				path: sanitizeString(error.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
				message: sanitizeString(
					error.message,
					VALIDATION_LIMITS.STRING_MAX_LENGTH
				),
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
			};
		});

		await runPromise(sendBatch("analytics-error-spans", spans));
	});
}

export function insertIndividualVitals(
	vitals: IndividualVital[],
	clientId: string
): Promise<void> {
	return record("insertIndividualVitals", async () => {
		if (vitals.length === 0) {
			return;
		}

		const salt = await getDailySalt();
		const now = Date.now();
		const spans: WebVitalsSpan[] = vitals.map((vital) => {
			const rawId = sanitizeString(
				vital.anonymousId,
				VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
			);
			return {
				client_id: clientId,
				anonymous_id: rawId ? saltAnonymousId(rawId, salt) : rawId,
				session_id: validateSessionId(vital.sessionId),
				timestamp: typeof vital.timestamp === "number" ? vital.timestamp : now,
				path: sanitizeString(vital.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
				metric_name: vital.metricName,
				metric_value: vital.metricValue,
			};
		});

		await runPromise(sendBatch("analytics-vitals-spans", spans));
	});
}

export function insertOutgoingLinksBatch(
	events: CustomOutgoingLink[]
): Promise<void> {
	return record("insertOutgoingLinksBatch", async () => {
		if (events.length === 0) {
			return;
		}

		await runPromise(sendBatch("analytics-outgoing-links", events));
	});
}

export function insertCustomEvents(
	events: Array<{
		owner_id: string;
		website_id?: string;
		timestamp: number;
		event_name: string;
		namespace?: string;
		path?: string;
		properties?: Record<string, unknown>;
		anonymous_id?: string;
		session_id?: string;
		source?: string;
	}>
): Promise<void> {
	return record("insertCustomEvents", async () => {
		if (events.length === 0) {
			return;
		}

		const salt = await getDailySalt();

		const spans = events.map((event) => {
			const rawId = event.anonymous_id
				? sanitizeString(
						event.anonymous_id,
						VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
					)
				: undefined;

			return {
				owner_id: event.owner_id,
				website_id: event.website_id,
				timestamp: event.timestamp,
				event_name: sanitizeString(
					event.event_name,
					VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
				),
				namespace: event.namespace
					? sanitizeString(
							event.namespace,
							VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
						)
					: undefined,
				path: event.path
					? sanitizeString(event.path, VALIDATION_LIMITS.STRING_MAX_LENGTH)
					: undefined,
				properties: event.properties ? JSON.stringify(event.properties) : "{}",
				anonymous_id: rawId ? saltAnonymousId(rawId, salt) : undefined,
				session_id: event.session_id
					? validateSessionId(event.session_id)
					: undefined,
				source: event.source
					? sanitizeString(
							event.source,
							VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
						)
					: undefined,
			};
		});

		await runPromise(sendBatch("analytics-custom-events", spans));
	});
}
