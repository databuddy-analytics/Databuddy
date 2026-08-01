import type {
	ErrorSpansInsert,
	EventsInsert,
	OutgoingLinksInsert,
	WebVitalsSpansInsert,
} from "@databuddy/db/clickhouse/tables";
import type { ErrorSpan, IndividualVital } from "@databuddy/validation";
import { send, sendBatch } from "@lib/producer";
import {
	getDailySalt,
	applyVisitorIdPrivacy,
	markDuplicateReservationDelivered,
	releaseDuplicateReservation,
	reserveDuplicate,
	shouldAnonymizeVisitorIds,
} from "@lib/security";
import { record } from "@lib/tracing";
import { extractTrustedClientIp, getGeo } from "@utils/ip-geo";
import { parseUserAgent } from "@utils/user-agent";
import {
	sanitizeString,
	sanitizeUrl,
	VALIDATION_LIMITS,
	validatePerformanceMetric,
	validateSessionId,
} from "@utils/validation";
import { randomUUIDv7 } from "bun";
import { createError } from "evlog";
import { useLogger } from "evlog/elysia";
import { createHash } from "node:crypto";

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

export interface BatchEvent<T extends { id: string }> {
	event: T;
	sourceEventId: string;
}

function deliveryUnavailable(cause: unknown) {
	return createError({
		code: "basket.DELIVERY_UNAVAILABLE",
		message: "Analytics delivery temporarily unavailable",
		status: 503,
		why: "Databuddy could not durably accept the event.",
		fix: "Retry the same event after a short delay.",
		cause: cause instanceof Error ? cause : new Error(String(cause)),
	});
}

/**
 * ClickHouse stores analytics ids as UUIDs, while public client event ids can
 * be arbitrary strings. Derive a valid, stable UUID so the same client retry
 * preserves its physical identity without accepting arbitrary input as UUID.
 */
export function stableAnalyticsEventId(
	clientId: string,
	eventType: "outgoing_link" | "track",
	eventId: string
): string {
	const digest = createHash("sha256")
		.update(JSON.stringify([clientId, eventType, eventId]))
		.digest("hex");
	const variant = "89ab".charAt(Number.parseInt(digest.charAt(16), 16) % 4);
	const uuid = `${digest.slice(0, 12)}5${digest.slice(13, 16)}${variant}${digest.slice(17, 32)}`;

	return `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20)}`;
}

export function buildTrackEvent(
	trackData: any,
	ctx: TrackEventContext
): EventsInsert {
	const timestamp =
		typeof trackData.timestamp === "number" ? trackData.timestamp : ctx.now;

	return {
		id: stableAnalyticsEventId(ctx.clientId, "track", ctx.eventId),
		client_id: ctx.clientId,
		event_name: sanitizeString(
			trackData.name,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		),
		anonymous_id: ctx.anonymousId,
		profile_id: trackData.profileId
			? sanitizeString(
					trackData.profileId,
					VALIDATION_LIMITS.USER_ID_MAX_LENGTH
				)
			: undefined,
		time: timestamp,
		session_id: validateSessionId(trackData.sessionId),
		timestamp,
		referrer: sanitizeUrl(
			trackData.referrer,
			VALIDATION_LIMITS.STRING_MAX_LENGTH
		),
		url: sanitizeUrl(trackData.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
		path: sanitizeUrl(trackData.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
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
		viewport_size: trackData.viewport_size,
		language: trackData.language,
		timezone: trackData.timezone,
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
		dom_ready_time: validatePerformanceMetric(trackData.dom_ready_time),
		ttfb: validatePerformanceMetric(trackData.ttfb),
		render_time: validatePerformanceMetric(trackData.render_time),
		properties: trackData.properties
			? JSON.stringify(trackData.properties)
			: "{}",
		created_at: ctx.now,
	};
}

async function deliverReserved(
	deliveryId: string,
	eventType: "outgoing_link" | "track",
	sourceEventId: string,
	deliver: () => Promise<void>
): Promise<void> {
	const reservation = await reserveDuplicate(
		deliveryId,
		eventType,
		sourceEventId
	);
	if (reservation.duplicate) {
		return;
	}
	if (reservation.retryable) {
		throw deliveryUnavailable(
			new Error("A concurrent attempt owns this analytics event")
		);
	}

	try {
		await deliver();
	} catch (error) {
		await releaseDuplicateReservation(reservation);
		throw deliveryUnavailable(error);
	}

	await markDuplicateReservationDelivered(reservation);
}

export function insertTrackEvent(
	trackData: any,
	clientId: string,
	userAgent: string,
	ip: string,
	request: Request
): Promise<void> {
	return record("insertTrackEvent", async () => {
		const log = useLogger();
		const eventId =
			sanitizeString(
				trackData.eventId,
				VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
			) || randomUUIDv7();

		const deliveryId = stableAnalyticsEventId(clientId, "track", eventId);
		await deliverReserved(deliveryId, "track", eventId, async () => {
			const geoData = await getGeo(ip, request);
			const trustedCountry = extractTrustedClientIp(request)
				? geoData.country
				: undefined;
			const anonymizeVisitorIds = shouldAnonymizeVisitorIds(
				trackData.anonymizeVisitorIds,
				trustedCountry
			);
			const [salt, ua] = await Promise.all([
				anonymizeVisitorIds ? getDailySalt() : Promise.resolve(undefined),
				parseUserAgent(userAgent),
			]);

			log.set({
				event: { id: eventId, name: trackData.name, path: trackData.path },
				geo: {
					country: geoData.country,
					region: geoData.region,
					city: geoData.city,
				},
			});

			const anonymousId = applyVisitorIdPrivacy(
				trackData.anonymousId,
				anonymizeVisitorIds,
				salt
			);

			const now = Date.now();

			const trackEvent = buildTrackEvent(trackData, {
				clientId,
				eventId,
				anonymousId,
				geo: geoData,
				ua,
				now,
			});

			await send("analytics-events", trackEvent);
		});
	});
}

export function insertOutgoingLink(
	linkData: any,
	clientId: string,
	request: Request
): Promise<void> {
	return record("insertOutgoingLink", async () => {
		const log = useLogger();
		const eventId =
			sanitizeString(
				linkData.eventId,
				VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
			) || randomUUIDv7();

		const deliveryId = stableAnalyticsEventId(
			clientId,
			"outgoing_link",
			eventId
		);
		await deliverReserved(deliveryId, "outgoing_link", eventId, async () => {
			log.set({
				event: { id: eventId, type: "outgoing_link", href: linkData.href },
			});

			const now = Date.now();

			const trustedIp = extractTrustedClientIp(request);
			const visitorCountry =
				linkData.anonymizeVisitorIds === "auto" && trustedIp
					? (await getGeo(trustedIp, request)).country
					: undefined;
			const anonymizeVisitorIds = shouldAnonymizeVisitorIds(
				linkData.anonymizeVisitorIds,
				visitorCountry
			);
			const salt = anonymizeVisitorIds ? await getDailySalt() : undefined;

			const outgoingLinkEvent: OutgoingLinksInsert = {
				id: deliveryId,
				client_id: clientId,
				anonymous_id: applyVisitorIdPrivacy(
					linkData.anonymousId,
					anonymizeVisitorIds,
					salt
				),
				session_id: validateSessionId(linkData.sessionId),
				href: sanitizeUrl(linkData.href, VALIDATION_LIMITS.PATH_MAX_LENGTH),
				text: sanitizeString(linkData.text, VALIDATION_LIMITS.TEXT_MAX_LENGTH),
				properties: linkData.properties
					? JSON.stringify(linkData.properties)
					: "{}",
				timestamp:
					typeof linkData.timestamp === "number" ? linkData.timestamp : now,
			};

			await send("analytics-outgoing-links", outgoingLinkEvent);
		});
	});
}

async function deliverBatch<T extends { id: string }>(
	eventType: "outgoing_link" | "track",
	topic: string,
	items: BatchEvent<T>[]
): Promise<void> {
	const uniqueItems = Array.from(
		new Map(items.map((item) => [item.event.id, item])).values()
	);
	if (uniqueItems.length === 0) {
		return;
	}

	const reservationResults = await Promise.allSettled(
		uniqueItems.map(async (item) => ({
			item,
			reservation: await reserveDuplicate(
				item.event.id,
				eventType,
				item.sourceEventId
			),
		}))
	);
	const reservations = reservationResults.flatMap((result) =>
		result.status === "fulfilled" ? [result.value] : []
	);
	const reservationFailure = reservationResults.find(
		(result): result is PromiseRejectedResult => result.status === "rejected"
	);
	const retryableReservation = reservations.find(
		({ reservation }) => reservation.retryable
	);
	if (reservationFailure || retryableReservation) {
		await Promise.allSettled(
			reservations.map(({ reservation }) =>
				releaseDuplicateReservation(reservation)
			)
		);
		throw deliveryUnavailable(
			reservationFailure?.reason ??
				new Error("A concurrent attempt owns this analytics event")
		);
	}

	const accepted = reservations.filter(
		({ reservation }) => !reservation.duplicate
	);
	if (accepted.length === 0) {
		return;
	}

	try {
		await sendBatch(
			topic,
			accepted.map(({ item }) => item.event)
		);
	} catch (error) {
		await Promise.allSettled(
			accepted.map(({ reservation }) =>
				releaseDuplicateReservation(reservation)
			)
		);
		throw deliveryUnavailable(error);
	}

	await Promise.allSettled(
		accepted.map(({ reservation }) =>
			markDuplicateReservationDelivered(reservation)
		)
	);
}

export function insertTrackEventsBatch(
	events: BatchEvent<EventsInsert>[]
): Promise<void> {
	return record("insertTrackEventsBatch", () =>
		deliverBatch("track", "analytics-events", events)
	);
}

export function insertErrorSpans(
	errors: ErrorSpan[],
	clientId: string,
	visitorCountry?: unknown
): Promise<void> {
	return record("insertErrorSpans", async () => {
		if (errors.length === 0) {
			return;
		}

		const shouldAnonymize = errors.map((error) =>
			shouldAnonymizeVisitorIds(error.anonymizeVisitorIds, visitorCountry)
		);
		const salt = shouldAnonymize.includes(true)
			? await getDailySalt()
			: undefined;
		const now = Date.now();
		const spans: ErrorSpansInsert[] = errors.map((error, index) => ({
			client_id: clientId,
			anonymous_id: applyVisitorIdPrivacy(
				error.anonymousId,
				shouldAnonymize[index] === true,
				salt
			),
			session_id: validateSessionId(error.sessionId),
			timestamp: typeof error.timestamp === "number" ? error.timestamp : now,
			path: sanitizeUrl(error.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
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
		}));

		await sendBatch("analytics-error-spans", spans);
	});
}

export function insertIndividualVitals(
	vitals: IndividualVital[],
	clientId: string,
	visitorCountry?: unknown
): Promise<void> {
	return record("insertIndividualVitals", async () => {
		if (vitals.length === 0) {
			return;
		}

		const shouldAnonymize = vitals.map((vital) =>
			shouldAnonymizeVisitorIds(vital.anonymizeVisitorIds, visitorCountry)
		);
		const salt = shouldAnonymize.includes(true)
			? await getDailySalt()
			: undefined;
		const now = Date.now();
		const spans: WebVitalsSpansInsert[] = vitals.map((vital, index) => ({
			client_id: clientId,
			anonymous_id: applyVisitorIdPrivacy(
				vital.anonymousId,
				shouldAnonymize[index] === true,
				salt
			),
			session_id: validateSessionId(vital.sessionId),
			timestamp: typeof vital.timestamp === "number" ? vital.timestamp : now,
			path: sanitizeUrl(vital.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
			metric_name: vital.metricName,
			metric_value: vital.metricValue,
		}));

		await sendBatch("analytics-vitals-spans", spans);
	});
}

export function insertOutgoingLinksBatch(
	events: BatchEvent<OutgoingLinksInsert>[]
): Promise<void> {
	return record("insertOutgoingLinksBatch", () =>
		deliverBatch("outgoing_link", "analytics-outgoing-links", events)
	);
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
		profile_id?: string;
		session_id?: string;
		anonymizeVisitorIds?: boolean | "auto";
		source?: string;
	}>,
	visitorCountry?: unknown
): Promise<void> {
	return record("insertCustomEvents", async () => {
		if (events.length === 0) {
			return;
		}

		const shouldAnonymize = events.map((event) =>
			shouldAnonymizeVisitorIds(event.anonymizeVisitorIds, visitorCountry)
		);
		const salt = shouldAnonymize.includes(true)
			? await getDailySalt()
			: undefined;

		const spans = events.map((event, index) => ({
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
				? sanitizeUrl(event.path, VALIDATION_LIMITS.STRING_MAX_LENGTH)
				: undefined,
			properties: event.properties ? JSON.stringify(event.properties) : "{}",
			anonymous_id: event.anonymous_id
				? applyVisitorIdPrivacy(
						event.anonymous_id,
						shouldAnonymize[index] === true,
						salt
					)
				: undefined,
			profile_id: event.profile_id
				? sanitizeString(event.profile_id, VALIDATION_LIMITS.USER_ID_MAX_LENGTH)
				: undefined,
			session_id: event.session_id
				? validateSessionId(event.session_id)
				: undefined,
			source: event.source
				? sanitizeString(
						event.source,
						VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
					)
				: undefined,
		}));

		await sendBatch("analytics-custom-events", spans);
	});
}
