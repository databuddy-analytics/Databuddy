import type {
	ErrorSpansInsert,
	EventsInsert,
	OutgoingLinksInsert,
	WebVitalsSpansInsert,
} from "@databuddy/db/clickhouse/tables";
import type { ErrorSpan, IndividualVital } from "@databuddy/validation";
import { runPromise, send, sendBatch } from "@lib/producer";
import {
	getDailySalt,
	applyVisitorIdPrivacy,
	markDuplicateReservationAmbiguous,
	markDuplicateReservationDelivered,
	releaseDuplicateReservation,
	reserveDuplicate,
	reserveDuplicateBatch,
	shouldAnonymizeVisitorIds,
} from "@lib/security";
import { deliveryUnavailable } from "@lib/structured-errors";
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

function isAmbiguousKafkaSend(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"_tag" in error &&
		error._tag === "KafkaSendError"
	);
}

async function settleFailedReservations(
	error: unknown,
	reservations: Awaited<ReturnType<typeof reserveDuplicate>>[]
): Promise<void> {
	await Promise.allSettled(
		reservations.map((reservation) =>
			reservation.ambiguous || isAmbiguousKafkaSend(error)
				? markDuplicateReservationAmbiguous(reservation)
				: releaseDuplicateReservation(reservation)
		)
	);
}

function canonicalizeDeliverySource(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(canonicalizeDeliverySource);
	}
	if (value && typeof value === "object") {
		const result: Record<string, unknown> = {};
		for (const key of Object.keys(value).sort()) {
			const nested = (value as Record<string, unknown>)[key];
			if (nested !== undefined) {
				result[key] = canonicalizeDeliverySource(nested);
			}
		}
		return result;
	}
	return value;
}

/**
 * Stable side-channel identity for tables that do not expose an id column.
 * New clients can provide eventId; legacy payloads fall back to their canonical
 * source payload plus batch position so an exact HTTP retry stays identifiable.
 */
export function stableBatchDeliveryId(
	scope: string,
	eventType: string,
	source: unknown,
	index: number
): string {
	const sourceRecord =
		source && typeof source === "object"
			? (source as Record<string, unknown>)
			: undefined;
	const candidate = sourceRecord?.eventId ?? sourceRecord?.event_id;
	const sourceIdentity =
		typeof candidate === "string" && candidate.length > 0
			? [
					"event-id",
					candidate,
					sourceRecord?.owner_id ?? null,
					sourceRecord?.website_id ?? null,
				]
			: ["payload", index, canonicalizeDeliverySource(source)];
	return createHash("sha256")
		.update(JSON.stringify([scope, eventType, sourceIdentity]))
		.digest("hex");
}

function directEventIdentity(eventId: unknown, generateFn: () => string) {
	const sourceEventId =
		typeof eventId === "string" && eventId.trim()
			? eventId.trim()
			: generateFn();
	const storedEventId =
		sanitizeString(sourceEventId, VALIDATION_LIMITS.EVENT_ID_MAX_LENGTH) ||
		generateFn();
	return { sourceEventId, storedEventId };
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

export function insertTrackEvent(
	trackData: any,
	clientId: string,
	userAgent: string,
	ip: string,
	request: Request
): Promise<void> {
	return record("insertTrackEvent", async () => {
		const log = useLogger();
		const { sourceEventId, storedEventId } = directEventIdentity(
			trackData.eventId,
			() => randomUUIDv7()
		);

		const deliveryId = stableAnalyticsEventId(clientId, "track", sourceEventId);
		let trackEvent: EventsInsert;
		try {
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
				event: {
					id: storedEventId,
					name: trackData.name,
					path: trackData.path,
				},
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

			trackEvent = buildTrackEvent(trackData, {
				clientId,
				eventId: sourceEventId,
				anonymousId,
				geo: geoData,
				ua,
				now,
			});
		} catch (error) {
			throw deliveryUnavailable(error);
		}

		const reservation = await reserveDuplicate(
			deliveryId,
			"track",
			storedEventId
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
			await runPromise(
				send("analytics-events", trackEvent, undefined, {
					allowDirectFallback: reservation.ambiguous !== true,
				})
			);
		} catch (error) {
			await settleFailedReservations(error, [reservation]);
			throw deliveryUnavailable(error);
		}

		await markDuplicateReservationDelivered(reservation);
	});
}

export function insertOutgoingLink(
	linkData: any,
	clientId: string,
	request: Request
): Promise<void> {
	return record("insertOutgoingLink", async () => {
		const log = useLogger();
		const { sourceEventId, storedEventId } = directEventIdentity(
			linkData.eventId,
			() => randomUUIDv7()
		);

		const deliveryId = stableAnalyticsEventId(
			clientId,
			"outgoing_link",
			sourceEventId
		);
		let outgoingLinkEvent: OutgoingLinksInsert;
		try {
			log.set({
				event: {
					id: storedEventId,
					type: "outgoing_link",
					href: linkData.href,
				},
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

			outgoingLinkEvent = {
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
		} catch (error) {
			throw deliveryUnavailable(error);
		}

		const reservation = await reserveDuplicate(
			deliveryId,
			"outgoing_link",
			storedEventId
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
			await runPromise(
				send("analytics-outgoing-links", outgoingLinkEvent, undefined, {
					allowDirectFallback: reservation.ambiguous !== true,
				})
			);
		} catch (error) {
			await settleFailedReservations(error, [reservation]);
			throw deliveryUnavailable(error);
		}

		await markDuplicateReservationDelivered(reservation);
	});
}

interface DeliveryItem<T> {
	readonly deliveryId: string;
	readonly event: T;
	readonly sourceEventId: string;
}

async function deliverItems<T>(
	eventType: string,
	topic: string,
	items: DeliveryItem<T>[]
): Promise<void> {
	const uniqueItems = Array.from(
		new Map(items.map((item) => [item.deliveryId, item])).values()
	);
	if (uniqueItems.length === 0) {
		return;
	}

	const acquisitionItems = [...uniqueItems].sort((left, right) =>
		left.deliveryId.localeCompare(right.deliveryId)
	);
	const reservations = await reserveDuplicateBatch(
		acquisitionItems.map((item) => ({
			eventId: item.deliveryId,
			eventType,
			sourceEventId: item.sourceEventId,
		}))
	);
	if (reservations.some((reservation) => reservation.retryable)) {
		throw deliveryUnavailable(
			new Error("A concurrent attempt owns this analytics batch")
		);
	}

	const reservationById = new Map(
		acquisitionItems.map((item, index) => [
			item.deliveryId,
			reservations[index],
		])
	);
	const accepted = uniqueItems.flatMap((item) => {
		const reservation = reservationById.get(item.deliveryId);
		return reservation && !reservation.duplicate ? [{ item, reservation }] : [];
	});
	if (accepted.length === 0) {
		return;
	}

	const groups = [
		accepted.filter(({ reservation }) => !reservation.ambiguous),
		accepted.filter(({ reservation }) => reservation.ambiguous),
	].filter((group) => group.length > 0);
	const deliveryResults = await Promise.allSettled(
		groups.map(async (group) => {
			try {
				await runPromise(
					sendBatch(
						topic,
						group.map(({ item }) => item.event),
						group.map(({ item }) => item.deliveryId),
						{
							allowDirectFallback: group[0]?.reservation.ambiguous !== true,
						}
					)
				);
			} catch (error) {
				await settleFailedReservations(
					error,
					group.map(({ reservation }) => reservation)
				);
				throw error;
			}
			await Promise.allSettled(
				group.map(({ reservation }) =>
					markDuplicateReservationDelivered(reservation)
				)
			);
		})
	);
	const failure = deliveryResults.find(
		(result): result is PromiseRejectedResult => result.status === "rejected"
	);
	if (failure) {
		throw deliveryUnavailable(failure.reason);
	}
}

async function deliverSpanBatch<TSource, TEvent extends object>(
	eventType: string,
	topic: string,
	scope: string,
	sources: TSource[],
	events: TEvent[]
): Promise<void> {
	if (events.length === 0) {
		return;
	}
	if (sources.length !== events.length) {
		throw new Error("Analytics source and delivery batch lengths differ");
	}

	const deliveryIds = sources.map((source, index) =>
		stableBatchDeliveryId(scope, eventType, source, index)
	);
	await deliverItems(
		eventType,
		topic,
		events.map((event, index) => ({
			deliveryId: deliveryIds[index] as string,
			event: {
				...event,
				delivery_id: deliveryIds[index] as string,
			},
			sourceEventId: deliveryIds[index] as string,
		}))
	);
}

export function insertTrackEventsBatch(
	events: BatchEvent<EventsInsert>[]
): Promise<void> {
	return record("insertTrackEventsBatch", () =>
		deliverItems(
			"track",
			"analytics-events",
			events.map((item) => ({
				deliveryId: item.event.id,
				event: item.event,
				sourceEventId: item.sourceEventId,
			}))
		)
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

		await deliverSpanBatch(
			"error",
			"analytics-error-spans",
			clientId,
			errors,
			spans
		);
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

		await deliverSpanBatch(
			"vital",
			"analytics-vitals-spans",
			clientId,
			vitals,
			spans
		);
	});
}

export function insertOutgoingLinksBatch(
	events: BatchEvent<OutgoingLinksInsert>[]
): Promise<void> {
	return record("insertOutgoingLinksBatch", () =>
		deliverItems(
			"outgoing_link",
			"analytics-outgoing-links",
			events.map((item) => ({
				deliveryId: item.event.id,
				event: item.event,
				sourceEventId: item.sourceEventId,
			}))
		)
	);
}

export function insertCustomEvents(
	events: Array<{
		event_id?: string;
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

		await deliverSpanBatch(
			"custom_event",
			"analytics-custom-events",
			events[0]?.owner_id ?? "",
			events,
			spans
		);
	});
}
