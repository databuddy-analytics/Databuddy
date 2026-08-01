import type {
	EventsInsert,
	OutgoingLinksInsert,
} from "@databuddy/db/clickhouse/tables";
import type {
	AnalyticsEventInput,
	OutgoingLinkInput,
} from "@databuddy/validation";
import {
	analyticsEventSchema,
	batchedCustomEventSpansSchema,
	batchedErrorsSchema,
	batchedVitalsSchema,
	errorSpanSchema,
	individualVitalSchema,
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
	stableAnalyticsEventId,
	type BatchEvent,
} from "@lib/event-service";
import { summarizeRejectedBody } from "@lib/rejection-summary";
import {
	checkForBot,
	type ValidatedRequest,
	validateRequest,
} from "@lib/request-validation";
import {
	getDailySalt,
	applyVisitorIdPrivacy,
	shouldAnonymizeVisitorIds,
} from "@lib/security";
import {
	basketErrors,
	createIngestSchemaValidationError,
	rethrowOrWrap,
} from "@lib/structured-errors";
import { record } from "@lib/tracing";
import {
	extractTrustedClientIp,
	getGeo,
	getVisitorCountryForAutoMode,
} from "@utils/ip-geo";
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
	trackData: AnalyticsEventInput,
	clientId: string,
	userAgent: string,
	ip: string,
	request: Request
) {
	return record("processTrackEventData", async () => {
		const eventId = parseEventId(trackData.eventId, () => randomUUIDv7());

		const [geoData, ua] = await Promise.all([
			getGeo(ip, request),
			parseUserAgent(userAgent),
		]);
		const trustedCountry = extractTrustedClientIp(request)
			? geoData.country
			: undefined;
		const anonymizeVisitorIds = shouldAnonymizeVisitorIds(
			trackData.anonymizeVisitorIds,
			trustedCountry
		);
		const salt = anonymizeVisitorIds ? await getDailySalt() : undefined;

		const anonymousId = applyVisitorIdPrivacy(
			trackData.anonymousId,
			anonymizeVisitorIds,
			salt
		);

		return {
			event: buildTrackEvent(trackData, {
				clientId,
				eventId,
				anonymousId,
				geo: geoData,
				ua,
				now: Date.now(),
			}),
			sourceEventId: eventId,
		};
	});
}

async function processOutgoingLinkData(
	linkData: OutgoingLinkInput,
	clientId: string,
	visitorCountry?: unknown
): Promise<BatchEvent<OutgoingLinksInsert>> {
	const eventId = parseEventId(linkData.eventId, () => randomUUIDv7());
	const timestamp = parseTimestamp(linkData.timestamp);
	const anonymizeVisitorIds = shouldAnonymizeVisitorIds(
		linkData.anonymizeVisitorIds,
		visitorCountry
	);
	const salt = anonymizeVisitorIds ? await getDailySalt() : undefined;

	const anonymousId = applyVisitorIdPrivacy(
		linkData.anonymousId,
		anonymizeVisitorIds,
		salt
	);

	return {
		event: {
			id: stableAnalyticsEventId(clientId, "outgoing_link", eventId),
			client_id: clientId,
			anonymous_id: anonymousId,
			session_id: validateSessionId(linkData.sessionId),
			href: sanitizeString(linkData.href, VALIDATION_LIMITS.PATH_MAX_LENGTH),
			text: sanitizeString(linkData.text, VALIDATION_LIMITS.TEXT_MAX_LENGTH),
			properties: parseProperties(linkData.properties),
			timestamp,
		},
		sourceEventId: eventId,
	};
}

const app = new Elysia()
	.get("/px.jpg", async ({ query, request }) => {
		const log = useLogger();
		log.set({ route: "pixel" });
		const retryablePixelResponse = (error: unknown) => {
			const status =
				error instanceof EvlogError && error.status >= 400 && error.status < 600
					? error.status
					: 503;
			const retryable =
				status === 408 || status === 425 || status === 429 || status >= 500;
			if (!retryable) {
				return createPixelResponse();
			}
			log.error(error instanceof Error ? error : new Error(String(error)));
			return createPixelResponse({ retryAfterSeconds: 5, status });
		};

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
				await insertTrackEvent(eventData, clientId, userAgent, ip, request);
			} else if (eventType === "outgoing_link") {
				await insertOutgoingLink(eventData, clientId, request);
			} else if (eventType === "web_vitals") {
				const vitalParse = individualVitalSchema.safeParse(eventData);
				if (!vitalParse.success) {
					log.set({ rejected: "schema" });
					return createPixelResponse();
				}
				const visitorCountry = await getVisitorCountryForAutoMode(
					[vitalParse.data],
					request
				);
				await insertIndividualVitals(
					[vitalParse.data],
					clientId,
					visitorCountry
				);
			} else if (eventType === "error") {
				const errorParse = errorSpanSchema.safeParse(eventData);
				if (!errorParse.success) {
					log.set({ rejected: "schema" });
					return createPixelResponse();
				}
				const visitorCountry = await getVisitorCountryForAutoMode(
					[errorParse.data],
					request
				);
				await insertErrorSpans([errorParse.data], clientId, visitorCountry);
			}

			return createPixelResponse();
		} catch (error) {
			return retryablePixelResponse(error);
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

			const visitorCountry = await getVisitorCountryForAutoMode(
				parseResult.data,
				request
			);
			await insertIndividualVitals(parseResult.data, clientId, visitorCountry);

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

			const visitorCountry = await getVisitorCountryForAutoMode(
				parseResult.data,
				request
			);
			await insertErrorSpans(parseResult.data, clientId, visitorCountry);

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

		const captureRejectedBody = () => {
			const summary = summarizeRejectedBody(body);
			if (summary) {
				log.set(summary);
			}
		};

		try {
			const { clientId, userAgent, organizationId } = await validateRequest(
				body,
				query,
				request
			);
			log.set({ clientId, organizationId });

			if (!organizationId) {
				log.set({ rejected: "missing_organization" });
				captureRejectedBody();
				throw basketErrors.ingestWebsiteMissingOrganization();
			}

			const parseResult = batchedCustomEventSpansSchema.safeParse(body);
			if (!parseResult.success) {
				log.set({ rejected: "schema" });
				captureRejectedBody();
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
				...(event.eventId ? { event_id: event.eventId } : {}),
				owner_id: organizationId,
				website_id: clientId,
				timestamp: event.timestamp,
				event_name: event.eventName,
				path: event.path,
				properties: event.properties as Record<string, unknown> | undefined,
				anonymous_id: event.anonymousId ?? undefined,
				anonymizeVisitorIds: event.anonymizeVisitorIds,
				profile_id: event.profileId ?? undefined,
				session_id: event.sessionId ?? undefined,
			}));

			const visitorCountry = await getVisitorCountryForAutoMode(
				events,
				request
			);
			await insertCustomEvents(events, visitorCountry);

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
			const eventType =
				(body as { type?: string } | null | undefined)?.type ?? "track";
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

				await insertTrackEvent(
					parseResult.data,
					clientId,
					userAgent,
					ip,
					request
				);
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

				await insertOutgoingLink(parseResult.data, clientId, request);
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

			const validation: ValidatedRequest = await validateRequest(
				body,
				query,
				request
			);

			const { clientId, userAgent, ip } = validation;
			log.set({ clientId });

			const trackEvents: BatchEvent<EventsInsert>[] = [];
			const outgoingLinkEvents: BatchEvent<OutgoingLinksInsert>[] = [];
			const results: Record<string, unknown>[] = [];
			let batchVisitorCountry: string | undefined;
			let hasResolvedBatchVisitorCountry = false;
			const getBatchVisitorCountry = async () => {
				if (!hasResolvedBatchVisitorCountry) {
					const trustedIp = extractTrustedClientIp(request);
					batchVisitorCountry = trustedIp
						? (await getGeo(trustedIp, request)).country
						: undefined;
					hasResolvedBatchVisitorCountry = true;
				}
				return batchVisitorCountry;
			};

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
							parseResult.data,
							clientId,
							userAgent,
							ip,
							request
						);
						trackEvents.push(trackEvent);
						results.push({
							status: "success",
							type: "track",
							eventId: parseResult.data.eventId,
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

						const visitorCountry =
							parseResult.data.anonymizeVisitorIds === "auto"
								? await getBatchVisitorCountry()
								: undefined;
						const linkEvent = await processOutgoingLinkData(
							parseResult.data,
							clientId,
							visitorCountry
						);
						outgoingLinkEvents.push(linkEvent);
						results.push({
							status: "success",
							type: "outgoing_link",
							eventId: parseResult.data.eventId,
						});
					} else {
						results.push({
							status: "error",
							message: "Unknown event type",
							eventType,
						});
					}
				} catch (error) {
					log.error(error instanceof Error ? error : new Error(String(error)));
					results.push({
						status: "error",
						message: "Processing failed",
						code: "EVENT_PROCESSING_FAILED",
						eventType,
					});
				}
			}

			const deliveryResults = await Promise.allSettled([
				insertTrackEventsBatch(trackEvents),
				insertOutgoingLinksBatch(outgoingLinkEvents),
			]);
			const deliveryFailure = deliveryResults.find(
				(result): result is PromiseRejectedResult =>
					result.status === "rejected"
			);
			if (deliveryFailure) {
				throw deliveryFailure.reason;
			}

			log.set({
				processed: results.length,
				batched: {
					track: trackEvents.length,
					outgoingLink: outgoingLinkEvents.length,
				},
			});

			const failedCount = results.filter(
				(result) =>
					typeof result === "object" &&
					result !== null &&
					"status" in result &&
					result.status === "error"
			).length;
			const responseStatus =
				failedCount === 0
					? "success"
					: failedCount === results.length
						? "error"
						: "partial";

			return Response.json({
				status: responseStatus,
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
