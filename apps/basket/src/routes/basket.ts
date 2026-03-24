import type { AnalyticsEvent, CustomOutgoingLink } from "@databuddy/db";
import {
	batchedCustomEventSpansSchema,
	batchedErrorsSchema,
	batchedVitalsSchema,
} from "@databuddy/validation";
import {
	insertCustomEvents,
	insertErrorSpans,
	insertIndividualVitals,
	insertOutgoingLink,
	insertOutgoingLinksBatch,
	insertTrackEvent,
	insertTrackEventsBatch,
} from "@lib/event-service";
import { checkForBot, validateRequest } from "@lib/request-validation";
import { getDailySalt, saltAnonymousId } from "@lib/security";
import {
	basketErrors,
	buildBasketErrorPayload,
	createIngestSchemaValidationError,
} from "@lib/structured-errors";
import { record } from "@lib/tracing";
import { analyticsEventSchema, outgoingLinkSchema } from "@utils/event-schema";
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
	validatePerformanceMetric,
	validateSessionId,
} from "@utils/validation";
import { randomUUIDv7 } from "bun";
import { Elysia } from "elysia";
import { createError, EvlogError } from "evlog";
import { useLogger } from "evlog/elysia";

function processTrackEventData(
	trackData: any,
	clientId: string,
	userAgent: string,
	ip: string,
	request?: Request
): Promise<AnalyticsEvent> {
	return record("processTrackEventData", async () => {
		const eventId = parseEventId(trackData.eventId, () => randomUUIDv7());

		const [geoData, uaData, salt] = await Promise.all([
			getGeo(ip, request),
			parseUserAgent(userAgent),
			getDailySalt(),
		]);

		const { anonymizedIP, country, region, city } = geoData;
		const {
			browserName,
			browserVersion,
			osName,
			osVersion,
			deviceType,
			deviceBrand,
			deviceModel,
		} = uaData;

		const now = Date.now();
		const timestamp = parseTimestamp(trackData.timestamp);
		const sessionStartTime = parseTimestamp(trackData.sessionStartTime);

		let anonymousId = sanitizeString(
			trackData.anonymousId,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		);
		anonymousId = saltAnonymousId(anonymousId, salt);

		return {
			id: randomUUIDv7(),
			client_id: clientId,
			event_name: sanitizeString(
				trackData.name,
				VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
			),
			anonymous_id: anonymousId,
			time: timestamp,
			session_id: validateSessionId(trackData.sessionId),
			event_type: "track",
			event_id: eventId,
			session_start_time: sessionStartTime,
			timestamp,
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
			properties: parseProperties(trackData.properties),
			created_at: now,
		};
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

			const validation = await validateRequest(eventData, query, request);
			if ("error" in validation) {
				log.set({ rejected: "validation" });
				return createPixelResponse();
			}

			const { clientId, userAgent, ip } = validation;
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
	.post("/vitals", async (context) => {
		const { body, query, request } = context as {
			body: unknown;
			query: Record<string, string>;
			request: Request;
		};
		const log = useLogger();
		log.set({ route: "vitals" });

		try {
			const validation = await validateRequest(body, query, request);
			if ("error" in validation) {
				log.set({ rejected: "validation" });
				return validation.error;
			}

			const { clientId, userAgent } = validation;
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

			return new Response(
				JSON.stringify({
					status: "success",
					type: "web_vitals",
					count: parseResult.data.length,
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				}
			);
		} catch (error) {
			if (error instanceof EvlogError) {
				throw error;
			}
			const err = error instanceof Error ? error : new Error(String(error));
			log.error(err);
			throw createError({
				message: "Internal server error",
				status: 500,
				why: process.env.NODE_ENV === "development" ? err.message : undefined,
				cause: err,
			});
		}
	})
	.post("/errors", async (context) => {
		const { body, query, request } = context as {
			body: unknown;
			query: Record<string, string>;
			request: Request;
		};
		const log = useLogger();
		log.set({ route: "errors" });

		try {
			const validation = await validateRequest(body, query, request);
			if ("error" in validation) {
				log.set({ rejected: "validation" });
				return validation.error;
			}

			const { clientId, userAgent } = validation;
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

			return new Response(
				JSON.stringify({
					status: "success",
					type: "error",
					count: parseResult.data.length,
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				}
			);
		} catch (error) {
			if (error instanceof EvlogError) {
				throw error;
			}
			const err = error instanceof Error ? error : new Error(String(error));
			log.error(err);
			throw createError({
				message: "Internal server error",
				status: 500,
				why: process.env.NODE_ENV === "development" ? err.message : undefined,
				cause: err,
			});
		}
	})
	.post("/events", async (context) => {
		const { body, query, request } = context as {
			body: unknown;
			query: Record<string, string>;
			request: Request;
		};
		const log = useLogger();
		log.set({ route: "events" });

		try {
			const validation = await validateRequest(body, query, request);
			if ("error" in validation) {
				log.set({ rejected: "validation" });
				return validation.error;
			}

			const { clientId, userAgent, organizationId } = validation;
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

			return new Response(
				JSON.stringify({
					status: "success",
					type: "custom_event",
					count: parseResult.data.length,
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				}
			);
		} catch (error) {
			if (error instanceof EvlogError) {
				throw error;
			}
			const err = error instanceof Error ? error : new Error(String(error));
			log.error(err);
			throw createError({
				message: "Internal server error",
				status: 500,
				why: process.env.NODE_ENV === "development" ? err.message : undefined,
				cause: err,
			});
		}
	})
	.post("/", async (context) => {
		const { body, query, request } = context as {
			body: any;
			query: any;
			request: Request;
		};
		const log = useLogger();
		log.set({ route: "ingest" });

		try {
			const validation = await validateRequest(body, query, request);

			if ("error" in validation) {
				log.set({ rejected: "validation" });
				return validation.error;
			}

			const { clientId, userAgent, ip } = validation;
			const eventType = body.type || "track";
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
				return new Response(
					JSON.stringify({ status: "success", type: "track" }),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					}
				);
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
				return new Response(
					JSON.stringify({ status: "success", type: "outgoing_link" }),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					}
				);
			}

			log.set({ rejected: "unknown_type" });
			throw basketErrors.ingestUnknownEventType();
		} catch (error) {
			if (error instanceof EvlogError) {
				throw error;
			}
			const err = error instanceof Error ? error : new Error(String(error));
			log.error(err);
			throw createError({
				message: "Internal server error",
				status: 500,
				why: process.env.NODE_ENV === "development" ? err.message : undefined,
				cause: err,
			});
		}
	})
	.post("/batch", async (context) => {
		const { body, query, request } = context as {
			body: any;
			query: any;
			request: Request;
		};
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

			let validation: Awaited<ReturnType<typeof validateRequest>>;
			try {
				validation = await validateRequest(body, query, request);
			} catch (error) {
				if (error instanceof EvlogError) {
					const { status, payload } = buildBasketErrorPayload(error, {
						extra: { batch: true },
					});
					return new Response(JSON.stringify(payload), {
						status,
						headers: { "Content-Type": "application/json" },
					});
				}
				throw error;
			}

			if ("error" in validation) {
				log.set({ rejected: "validation" });
				const errorResponse = validation.error;
				const errorBody = (await errorResponse.json()) as Record<
					string,
					unknown
				>;
				return new Response(JSON.stringify({ ...errorBody, batch: true }), {
					status: errorResponse.status,
					headers: { "Content-Type": "application/json" },
				});
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

			return new Response(
				JSON.stringify({
					status: "success",
					batch: true,
					processed: results.length,
					batched: {
						track: trackEvents.length,
						outgoing_link: outgoingLinkEvents.length,
					},
					results,
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				}
			);
		} catch (error) {
			if (error instanceof EvlogError) {
				throw error;
			}
			const err = error instanceof Error ? error : new Error(String(error));
			log.error(err);
			throw createError({
				message: "Internal server error",
				status: 500,
				why: process.env.NODE_ENV === "development" ? err.message : undefined,
				cause: err,
			});
		}
	});

export default app;
