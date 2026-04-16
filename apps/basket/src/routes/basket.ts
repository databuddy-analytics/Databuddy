import type {
	AnalyticsEvent,
	CustomOutgoingLink,
} from "@databuddy/db/clickhouse/schema";
import {
	analyticsEventSchema,
	batchedCustomEventSpansSchema,
	batchedErrorsSchema,
	batchedVitalsSchema,
	outgoingLinkSchema,
} from "@databuddy/validation";
import {
	buildTrackEvent,
	insertCustomEvents,
	insertErrorSpans,
	insertIndividualVitals,
	insertOutgoingLink,
	insertOutgoingLinksBatch,
	insertTrackEvent,
	insertTrackEventsBatch,
} from "@lib/event-service";
import {
	checkForBot,
	type ValidatedRequest,
	validateRequest,
} from "@lib/request-validation";
import { getDailySalt, saltAnonymousId } from "@lib/security";
import {
	basketErrors,
	buildBasketErrorPayload,
	createIngestSchemaValidationError,
	rethrowOrWrap,
} from "@lib/structured-errors";
import { record } from "@lib/tracing";
import { getGeo } from "@utils/ip-geo";
import {
	batchBotIgnoredItem,
	batchSchemaItemFailure,
	parseEventId,
	parseProperties,
	parseTimestamp,
	validateEventSchema,
} from "@utils/parsing-helpers";
import { createPixelResponse, parsePixelQuery } from "@utils/pixel";
import { parseUserAgent } from "@utils/user-agent";
import {
	sanitizeString,
	VALIDATION_LIMITS,
	validateSessionId,
} from "@utils/validation";
import { randomUUIDv7 } from "bun";
import { Elysia } from "elysia";
import { EvlogError } from "evlog";
import { useLogger } from "evlog/elysia";

function processTrackEventData(
	trackData: any,
	clientId: string,
	userAgent: string,
	ip: string,
	request?: Request
) {
	return record("processTrackEventData", async () => {
		const eventId = parseEventId(trackData.eventId, () => randomUUIDv7());

		const [geoData, ua, salt] = await Promise.all([
			getGeo(ip, request),
			parseUserAgent(userAgent),
			getDailySalt(),
		]);

		let anonymousId = sanitizeString(
			trackData.anonymousId,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		);
		anonymousId = saltAnonymousId(anonymousId, salt);

		return buildTrackEvent(trackData, {
			clientId,
			eventId,
			anonymousId,
			geo: geoData,
			ua,
			now: Date.now(),
		});
	});
}

async function processOutgoingLinkData(
	linkData: any,
	clientId: string
): Promise<CustomOutgoingLink> {
	const timestamp = parseTimestamp(linkData.timestamp);
	const salt = await getDailySalt();

	let anonymousId = sanitizeString(
		linkData.anonymousId,
		VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
	);
	if (anonymousId) {
		anonymousId = saltAnonymousId(anonymousId, salt);
	}

	return {
		id: randomUUIDv7(),
		client_id: clientId,
		anonymous_id: anonymousId,
		session_id: validateSessionId(linkData.sessionId),
		href: sanitizeString(linkData.href, VALIDATION_LIMITS.PATH_MAX_LENGTH),
		text: sanitizeString(linkData.text, VALIDATION_LIMITS.TEXT_MAX_LENGTH),
		properties: parseProperties(linkData.properties),
		timestamp,
	};
}

const app = new Elysia()
	.get("/px.jpg", async ({ query, request }) => {
		const log = useLogger();
		log.set({ route: "pixel" });

		try {
			const { eventData, eventType } = parsePixelQuery(
				query as Record<string, string>
			);
			log.set({ eventType });

			const { clientId, userAgent, ip } = await validateRequest(
				eventData,
				query,
				request
			);
			log.set({ clientId });

			const botError = await checkForBot(
				request,
				eventData,
				query,
				clientId,
				userAgent
			);
			if (botError) {
				log.set({ rejected: "bot" });
				return createPixelResponse();
			}

			if (eventType === "track") {
				insertTrackEvent(eventData, clientId, userAgent, ip, request);
			} else if (eventType === "outgoing_link") {
				insertOutgoingLink(eventData, clientId, userAgent, ip);
			}

			return createPixelResponse();
		} catch (error) {
			if (error instanceof EvlogError) {
				return createPixelResponse();
			}
			log.error(error instanceof Error ? error : new Error(String(error)));
			return createPixelResponse();
		}
	})
	.post("/vitals", async ({ body, query, request }) => {
		const log = useLogger();
		log.set({ route: "vitals" });

		try {
			const { clientId, userAgent } = await validateRequest(
				body,
				query,
				request
			);
			log.set({ clientId });

			const parseResult = batchedVitalsSchema.safeParse(body);
			if (!parseResult.success) {
				log.set({ rejected: "schema" });
				throw createIngestSchemaValidationError(parseResult.error.issues);
			}

			log.set({ count: parseResult.data.length });

			const botError = await checkForBot(
				request,
				body,
				query,
				clientId,
				userAgent
			);
			if (botError) {
				log.set({ rejected: "bot" });
				return botError.error;
			}

			await insertIndividualVitals(parseResult.data, clientId);

			return Response.json({
				status: "success",
				type: "web_vitals",
				count: parseResult.data.length,
			});
		} catch (error) {
			rethrowOrWrap(error, log);
		}
	})
	.post("/errors", async ({ body, query, request }) => {
		const log = useLogger();
		log.set({ route: "errors" });

		try {
			const { clientId, userAgent } = await validateRequest(
				body,
				query,
				request
			);
			log.set({ clientId });

			const parseResult = batchedErrorsSchema.safeParse(body);
			if (!parseResult.success) {
				log.set({ rejected: "schema" });
				throw createIngestSchemaValidationError(parseResult.error.issues);
			}

			log.set({ count: parseResult.data.length });

			const botError = await checkForBot(
				request,
				body,
				query,
				clientId,
				userAgent
			);
			if (botError) {
				log.set({ rejected: "bot" });
				return botError.error;
			}

			await insertErrorSpans(parseResult.data, clientId);

			return Response.json({
				status: "success",
				type: "error",
				count: parseResult.data.length,
			});
		} catch (error) {
			rethrowOrWrap(error, log);
		}
	})
	.post("/events", async ({ body, query, request }) => {
		const log = useLogger();
		log.set({ route: "events" });

		try {
			const { clientId, userAgent, organizationId } = await validateRequest(
				body,
				query,
				request
			);
			log.set({ clientId, organizationId });

			if (!organizationId) {
				log.set({ rejected: "missing_organization" });
				throw basketErrors.ingestWebsiteMissingOrganization();
			}

			const parseResult = batchedCustomEventSpansSchema.safeParse(body);
			if (!parseResult.success) {
				log.set({ rejected: "schema" });
				throw createIngestSchemaValidationError(parseResult.error.issues);
			}

			log.set({ count: parseResult.data.length });

			const botError = await checkForBot(
				request,
				body,
				query,
				clientId,
				userAgent
			);
			if (botError) {
				log.set({ rejected: "bot" });
				return botError.error;
			}

			const events = parseResult.data.map((event) => ({
				owner_id: organizationId,
				website_id: clientId,
				timestamp: event.timestamp,
				event_name: event.eventName,
				path: event.path,
				properties: event.properties as Record<string, unknown> | undefined,
				anonymous_id: event.anonymousId ?? undefined,
				session_id: event.sessionId ?? undefined,
			}));

			await insertCustomEvents(events);

			return Response.json({
				status: "success",
				type: "custom_event",
				count: parseResult.data.length,
			});
		} catch (error) {
			rethrowOrWrap(error, log);
		}
	})
	.post("/", async ({ body, query, request }) => {
		const log = useLogger();
		log.set({ route: "ingest" });

		try {
			const { clientId, userAgent, ip } = await validateRequest(
				body,
				query,
				request
			);
			const eventType = (body as any).type || "track";
			log.set({ clientId, eventType });

			if (eventType === "track") {
				const [botError, parseResult] = await Promise.all([
					checkForBot(request, body, query, clientId, userAgent),
					validateEventSchema(
						analyticsEventSchema,
						body,
						request,
						query,
						clientId
					),
				]);

				if (botError) {
					log.set({ rejected: "bot" });
					return botError.error;
				}

				if (!parseResult.success) {
					log.set({ rejected: "schema" });
					throw createIngestSchemaValidationError(parseResult.error.issues);
				}

				insertTrackEvent(body, clientId, userAgent, ip, request);
				return Response.json({ status: "success", type: "track" });
			}

			if (eventType === "outgoing_link") {
				const [botError, parseResult] = await Promise.all([
					checkForBot(request, body, query, clientId, userAgent),
					validateEventSchema(
						outgoingLinkSchema,
						body,
						request,
						query,
						clientId
					),
				]);

				if (botError) {
					log.set({ rejected: "bot" });
					return botError.error;
				}

				if (!parseResult.success) {
					log.set({ rejected: "schema" });
					throw createIngestSchemaValidationError(parseResult.error.issues);
				}

				insertOutgoingLink(body, clientId, userAgent, ip);
				return Response.json({ status: "success", type: "outgoing_link" });
			}

			log.set({ rejected: "unknown_type" });
			throw basketErrors.ingestUnknownEventType();
		} catch (error) {
			rethrowOrWrap(error, log);
		}
	})
	.post("/batch", async ({ body, query, request }) => {
		const log = useLogger();
		log.set({ route: "batch" });

		try {
			if (!Array.isArray(body)) {
				log.set({ rejected: "not_array" });
				throw basketErrors.ingestBatchNotArray();
			}

			log.set({ batchSize: body.length });

			if (body.length > VALIDATION_LIMITS.BATCH_MAX_SIZE) {
				log.set({ rejected: "too_large" });
				throw basketErrors.ingestBatchTooLarge();
			}

			let validation: ValidatedRequest;
			try {
				validation = await validateRequest(body, query, request);
			} catch (error) {
				if (error instanceof EvlogError) {
					const { status, payload } = buildBasketErrorPayload(error, {
						extra: { batch: true },
					});
					return Response.json(payload, { status });
				}
				throw error;
			}

			const { clientId, userAgent, ip } = validation;
			log.set({ clientId });

			const trackEvents: AnalyticsEvent[] = [];
			const outgoingLinkEvents: CustomOutgoingLink[] = [];
			const results: Record<string, unknown>[] = [];

			for (const event of body) {
				const eventType = event.type || "track";

				try {
					if (eventType === "track") {
						const botError = await checkForBot(
							request,
							event,
							query,
							clientId,
							userAgent
						);
						if (botError) {
							results.push(batchBotIgnoredItem(eventType));
							continue;
						}

						const parseResult = await validateEventSchema(
							analyticsEventSchema,
							event,
							request,
							query,
							clientId
						);

						if (!parseResult.success) {
							results.push(
								batchSchemaItemFailure(
									parseResult.error.issues,
									eventType,
									event.eventId
								)
							);
							continue;
						}

						const trackEvent = await processTrackEventData(
							event,
							clientId,
							userAgent,
							ip,
							request
						);
						trackEvents.push(trackEvent);
						results.push({
							status: "success",
							type: "track",
							eventId: event.eventId,
						});
					} else if (eventType === "outgoing_link") {
						const botError = await checkForBot(
							request,
							event,
							query,
							clientId,
							userAgent
						);
						if (botError) {
							results.push(batchBotIgnoredItem(eventType));
							continue;
						}

						const parseResult = await validateEventSchema(
							outgoingLinkSchema,
							event,
							request,
							query,
							clientId
						);

						if (!parseResult.success) {
							results.push(
								batchSchemaItemFailure(
									parseResult.error.issues,
									eventType,
									event.eventId
								)
							);
							continue;
						}

						const linkEvent = await processOutgoingLinkData(event, clientId);
						outgoingLinkEvents.push(linkEvent);
						results.push({
							status: "success",
							type: "outgoing_link",
							eventId: event.eventId,
						});
					} else {
						results.push({
							status: "error",
							message: "Unknown event type",
							eventType,
						});
					}
				} catch (error) {
					results.push({
						status: "error",
						message: "Processing failed",
						eventType,
						error: String(error),
					});
				}
			}

			await Promise.all([
				insertTrackEventsBatch(trackEvents),
				insertOutgoingLinksBatch(outgoingLinkEvents),
			]);

			log.set({
				processed: results.length,
				batched: {
					track: trackEvents.length,
					outgoingLink: outgoingLinkEvents.length,
				},
			});

			return Response.json({
				status: "success",
				batch: true,
				processed: results.length,
				batched: {
					track: trackEvents.length,
					outgoing_link: outgoingLinkEvents.length,
				},
				results,
			});
		} catch (error) {
			rethrowOrWrap(error, log);
		}
	});

export default app;
