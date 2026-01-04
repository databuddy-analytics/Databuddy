import { randomUUID } from "node:crypto";
import type { AnalyticsEvent, CustomOutgoingLink } from "@databuddy/db";
import {
	batchedCustomEventSpansSchema,
	batchedErrorsSchema,
	batchedVitalsSchema,
} from "@databuddy/validation";
import {
	insertCustomEventSpans,
	insertErrorSpans,
	insertIndividualVitals,
	insertOutgoingLink,
	insertOutgoingLinksBatch,
	insertTrackEvent,
	insertTrackEventsBatch,
} from "@lib/event-service";
import { checkForBot, validateRequest } from "@lib/request-validation";
import { getDailySalt, saltAnonymousId } from "@lib/security";
import { captureError, record } from "@lib/tracing";
import { analyticsEventSchema, outgoingLinkSchema } from "@utils/event-schema";
import { getGeo } from "@utils/ip-geo";
import {
	createBotDetectedResponse,
	createSchemaErrorResponse,
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
import { Elysia } from "elysia";

function processTrackEventData(
	trackData: any,
	clientId: string,
	userAgent: string,
	ip: string
): Promise<AnalyticsEvent> {
	return record("processTrackEventData", async () => {
		const eventId = parseEventId(trackData.eventId, randomUUID);

		const [geoData, uaData, salt] = await Promise.all([
			getGeo(ip),
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
			id: randomUUID(),
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

function processOutgoingLinkData(
	linkData: any,
	clientId: string
): CustomOutgoingLink {
	const timestamp = parseTimestamp(linkData.timestamp);

	return {
		id: randomUUID(),
		client_id: clientId,
		anonymous_id: sanitizeString(
			linkData.anonymousId,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		),
		session_id: validateSessionId(linkData.sessionId),
		href: sanitizeString(linkData.href, VALIDATION_LIMITS.PATH_MAX_LENGTH),
		text: sanitizeString(linkData.text, VALIDATION_LIMITS.TEXT_MAX_LENGTH),
		properties: parseProperties(linkData.properties),
		timestamp,
	};
}

const app = new Elysia()
	.get("/px.jpg", async ({ query, request }) => {
		try {
			const { eventData, eventType } = parsePixelQuery(
				query as Record<string, string>
			);

			const validation = await validateRequest(eventData, query, request);
			if ("error" in validation) {
				return createPixelResponse();
			}

			const { clientId, userAgent, ip } = validation;

			const botError = await checkForBot(
				request,
				eventData,
				query,
				clientId,
				userAgent
			);
			if (botError) {
				return createPixelResponse();
			}

			if (eventType === "track") {
				insertTrackEvent(eventData, clientId, userAgent, ip);
			} else if (eventType === "outgoing_link") {
				insertOutgoingLink(eventData, clientId, userAgent, ip);
			}

			return createPixelResponse();
		} catch (error) {
			captureError(error, { message: "Error processing pixel request" });
			return createPixelResponse();
		}
	})
	.post("/vitals", async (context) => {
		const { body, query, request } = context as {
			body: unknown;
			query: Record<string, string>;
			request: Request;
		};

		try {
			const validation = await validateRequest(body, query, request);
			if ("error" in validation) {
				return validation.error;
			}

			const { clientId, userAgent } = validation;

			// v2.x tracker sends batched individual vital metrics to /vitals
			const parseResult = batchedVitalsSchema.safeParse(body);

			if (!parseResult.success) {
				return createSchemaErrorResponse(parseResult.error.issues);
			}

			const botError = await checkForBot(
				request,
				body,
				query,
				clientId,
				userAgent
			);
			if (botError) {
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
			captureError(error, { message: "Error processing vitals" });
			return new Response(
				JSON.stringify({ status: "error", message: "Internal server error" }),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				}
			);
		}
	})
	.post("/errors", async (context) => {
		const { body, query, request } = context as {
			body: unknown;
			query: Record<string, string>;
			request: Request;
		};

		try {
			const validation = await validateRequest(body, query, request);
			if ("error" in validation) {
				return validation.error;
			}

			const { clientId, userAgent } = validation;

			const parseResult = batchedErrorsSchema.safeParse(body);

			if (!parseResult.success) {
				return createSchemaErrorResponse(parseResult.error.issues);
			}

			const botError = await checkForBot(
				request,
				body,
				query,
				clientId,
				userAgent
			);
			if (botError) {
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
			captureError(error, { message: "Error processing error" });
			return new Response(
				JSON.stringify({ status: "error", message: "Internal server error" }),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				}
			);
		}
	})
	.post("/events", async (context) => {
		const { body, query, request } = context as {
			body: unknown;
			query: Record<string, string>;
			request: Request;
		};

		try {
			const validation = await validateRequest(body, query, request);
			if ("error" in validation) {
				return validation.error;
			}

			const { clientId, userAgent } = validation;

			const parseResult = batchedCustomEventSpansSchema.safeParse(body);

			if (!parseResult.success) {
				return createSchemaErrorResponse(parseResult.error.issues);
			}

			const botError = await checkForBot(
				request,
				body,
				query,
				clientId,
				userAgent
			);
			if (botError) {
				return botError.error;
			}

			await insertCustomEventSpans(parseResult.data, clientId);

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
			captureError(error, { message: "Error processing custom events" });
			return new Response(
				JSON.stringify({ status: "error", message: "Internal server error" }),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				}
			);
		}
	})
	.post("/", async (context) => {
		const { body, query, request } = context as {
			body: any;
			query: any;
			request: Request;
		};

		try {
			const validation = await validateRequest(body, query, request);

			if ("error" in validation) {
				return validation.error;
			}

			const { clientId, userAgent, ip } = validation;
			const eventType = body.type || "track";

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
					return botError.error;
				}

				if (!parseResult.success) {
					return createSchemaErrorResponse(parseResult.error.issues);
				}

				insertTrackEvent(body, clientId, userAgent, ip);
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
					return botError.error;
				}

				if (!parseResult.success) {
					return createSchemaErrorResponse(parseResult.error.issues);
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

			return new Response(
				JSON.stringify({ status: "error", message: "Unknown event type" }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				}
			);
		} catch (error) {
			captureError(error, { message: "Error processing event" });
			return new Response(
				JSON.stringify({ status: "error", message: "Internal server error" }),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				}
			);
		}
	})
	.post("/batch", async (context) => {
		const { body, query, request } = context as {
			body: any;
			query: any;
			request: Request;
		};

		try {
			if (!Array.isArray(body)) {
				captureError(new Error("Batch endpoint received non-array body"), {
					body,
				});
				return new Response(
					JSON.stringify({
						status: "error",
						message: "Batch endpoint expects array of events",
					}),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					}
				);
			}

			if (body.length > VALIDATION_LIMITS.BATCH_MAX_SIZE) {
				return new Response(
					JSON.stringify({ status: "error", message: "Batch too large" }),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					}
				);
			}

			const validation = await validateRequest(body, query, request);
			if ("error" in validation) {
				const errorResponse = validation.error;
				if (errorResponse instanceof Response) {
					const errorBody = await errorResponse.json();
					return new Response(JSON.stringify({ ...errorBody, batch: true }), {
						status: errorResponse.status,
						headers: { "Content-Type": "application/json" },
					});
				}
				return errorResponse;
			}

			const { clientId, userAgent, ip } = validation;

			const trackEvents: AnalyticsEvent[] = [];
			const outgoingLinkEvents: CustomOutgoingLink[] = [];
			const results: any[] = [];

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
							results.push(createBotDetectedResponse(eventType));
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
							results.push({
								...createSchemaErrorResponse(parseResult.error.issues),
								eventType,
								eventId: event.eventId,
							});
							continue;
						}

						const trackEvent = await processTrackEventData(
							event,
							clientId,
							userAgent,
							ip
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
							results.push(createBotDetectedResponse(eventType));
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
							results.push({
								...createSchemaErrorResponse(parseResult.error.issues),
								eventType,
								eventId: event.eventId,
							});
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
			captureError(error, { message: "Error processing batch event" });
			return new Response(
				JSON.stringify({ status: "error", message: "Internal server error" }),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				}
			);
		}
	});

export default app;
