import { randomUUID } from 'node:crypto';
import { Elysia } from 'elysia';
import { logBlockedTraffic } from '../lib/blocked-traffic';
import {
	insertCustomEvent,
	insertCustomEventsBatch,
	insertError,
	insertErrorsBatch,
	insertOutgoingLink,
	insertOutgoingLinksBatch,
	insertTrackEvent,
	insertTrackEventsBatch,
	insertWebVitals,
	insertWebVitalsBatch,
} from '../lib/event-service';
import { validateRequest, checkForBot } from '../lib/request-validation';
import { getDailySalt, saltAnonymousId } from '../lib/security';
import {
	analyticsEventSchema,
	customEventSchema,
	errorEventSchema,
	outgoingLinkSchema,
	webVitalsEventSchema,
} from '../utils/event-schema';
import { FILTERED_ERROR_MESSAGES, VALIDATION_LIMITS } from '../utils/validation';
import { getGeo } from '../utils/ip-geo';
import { parseUserAgent } from '../utils/user-agent';
import {
	sanitizeString,
	validatePerformanceMetric,
	validateSessionId,
} from '../utils/validation';
import type {
	AnalyticsEvent,
	CustomEvent,
	CustomOutgoingLink,
	ErrorEvent,
	WebVitalsEvent,
} from '@databuddy/db';

async function processTrackEventData(
	trackData: any,
	clientId: string,
	userAgent: string,
	ip: string
): Promise<AnalyticsEvent> {
	let eventId = sanitizeString(
		trackData.eventId,
		VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
	);

	if (!eventId) {
		eventId = randomUUID();
	}

	const { anonymizedIP, country, region, city } = await getGeo(ip);
	const {
		browserName,
		browserVersion,
		osName,
		osVersion,
		deviceType,
		deviceBrand,
		deviceModel,
	} = parseUserAgent(userAgent);
	const now = Date.now();

	return {
		id: randomUUID(),
		client_id: clientId,
		event_name: sanitizeString(
			trackData.name,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		),
		anonymous_id: sanitizeString(
			trackData.anonymousId,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		),
		time: typeof trackData.timestamp === 'number' ? trackData.timestamp : now,
		session_id: validateSessionId(trackData.sessionId),
		event_type: 'track',
		event_id: eventId,
		session_start_time:
			typeof trackData.sessionStartTime === 'number'
				? trackData.sessionStartTime
				: now,
		timestamp:
			typeof trackData.timestamp === 'number' ? trackData.timestamp : now,
		referrer: sanitizeString(
			trackData.referrer,
			VALIDATION_LIMITS.STRING_MAX_LENGTH
		),
		url: sanitizeString(trackData.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
		path: sanitizeString(trackData.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
		title: sanitizeString(trackData.title, VALIDATION_LIMITS.STRING_MAX_LENGTH),
		ip: anonymizedIP || '',
		user_agent: '',
		browser_name: browserName || '',
		browser_version: browserVersion || '',
		os_name: osName || '',
		os_version: osVersion || '',
		device_type: deviceType || '',
		device_brand: deviceBrand || '',
		device_model: deviceModel || '',
		country: country || '',
		region: region || '',
		city: city || '',
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
		domain_lookup_time: validatePerformanceMetric(trackData.domain_lookup_time),
		properties: trackData.properties
			? JSON.stringify(trackData.properties)
			: '{}',
		created_at: now,
	};
}

async function processErrorEventData(
	errorData: any,
	clientId: string,
	userAgent: string,
	ip: string
): Promise<ErrorEvent> {
	let eventId = sanitizeString(
		errorData.payload.eventId,
		VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
	);

	if (!eventId) {
		eventId = randomUUID();
	}

	const payload = errorData.payload;
	const now = Date.now();

	const { anonymizedIP, country, region } = await getGeo(ip);
	const { browserName, browserVersion, osName, osVersion, deviceType } =
		parseUserAgent(userAgent);

	return {
		id: randomUUID(),
		client_id: clientId,
		event_id: eventId,
		anonymous_id: sanitizeString(
			payload.anonymousId,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		),
		session_id: validateSessionId(payload.sessionId),
		timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : now,
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
		ip: anonymizedIP || '',
		user_agent: '',
		country: country || '',
		region: region || '',
		browser_name: browserName || '',
		browser_version: browserVersion || '',
		os_name: osName || '',
		os_version: osVersion || '',
		device_type: deviceType || '',
		created_at: now,
	};
}

async function processWebVitalsEventData(
	vitalsData: any,
	clientId: string,
	userAgent: string,
	ip: string
): Promise<WebVitalsEvent> {
	let eventId = sanitizeString(
		vitalsData.payload.eventId,
		VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
	);

	if (!eventId) {
		eventId = randomUUID();
	}

	const payload = vitalsData.payload;
	const now = Date.now();

	const { country, region } = await getGeo(ip);
	const { browserName, browserVersion, osName, osVersion, deviceType } =
		parseUserAgent(userAgent);

	return {
		id: randomUUID(),
		client_id: clientId,
		event_id: eventId,
		anonymous_id: sanitizeString(
			payload.anonymousId,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		),
		session_id: validateSessionId(payload.sessionId),
		timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : now,
		path: sanitizeString(payload.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
		fcp: validatePerformanceMetric(payload.fcp),
		lcp: validatePerformanceMetric(payload.lcp),
		cls: validatePerformanceMetric(payload.cls),
		fid: validatePerformanceMetric(payload.fid),
		inp: validatePerformanceMetric(payload.inp),
		ip: '',
		user_agent: '',
		country: country || '',
		region: region || '',
		browser_name: browserName || '',
		browser_version: browserVersion || '',
		os_name: osName || '',
		os_version: osVersion || '',
		device_type: deviceType || '',
		created_at: now,
	};
}

async function processCustomEventData(
	customData: any,
	clientId: string
): Promise<CustomEvent> {
	let eventId = sanitizeString(
		customData.eventId,
		VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
	);

	if (!eventId) {
		eventId = randomUUID();
	}

	const now = Date.now();

	return {
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
			: '{}',
		timestamp:
			typeof customData.timestamp === 'number' ? customData.timestamp : now,
	};
}

async function processOutgoingLinkData(
	linkData: any,
	clientId: string
): Promise<CustomOutgoingLink> {
	let eventId = sanitizeString(
		linkData.eventId,
		VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
	);

	if (!eventId) {
		eventId = randomUUID();
	}

	const now = Date.now();

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
		properties: linkData.properties
			? JSON.stringify(linkData.properties)
			: '{}',
		timestamp:
			typeof linkData.timestamp === 'number' ? linkData.timestamp : now,
	};
}


const app = new Elysia()
	.post('/', async (context) => {
		const { body, query, request } = context as {
			body: any;
			query: any;
			request: Request;
		};

		try {
			const validation = await validateRequest(body, query, request);
			if ('error' in validation) {
				console.error('Request validation failed:', validation.error);
				return validation.error;
			}

			const { clientId, userAgent, ip } = validation;

			const salt = await getDailySalt();
			if (body.anonymous_id) {
				body.anonymous_id = saltAnonymousId(body.anonymous_id, salt);
			}

			const eventType = body.type || 'track';

			if (eventType === 'track') {
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

				let parseResult;
				if (process.env.NODE_ENV === 'development') {
					parseResult = { success: true, data: body };
				} else {
					parseResult = analyticsEventSchema.safeParse(body);
					if (!parseResult.success) {
						await logBlockedTraffic(
							request,
							body,
							query,
							'invalid_schema',
							'Schema Validation',
							undefined,
							clientId
						);
						return {
							status: 'error',
							message: 'Invalid event schema',
							errors: parseResult.error.issues,
						};
					}
				}
				insertTrackEvent(body, clientId, userAgent, ip);
				return { status: 'success', type: 'track' };
			}

			if (eventType === 'error') {
				if (FILTERED_ERROR_MESSAGES.has(body.payload?.message)) {
					return {
						status: 'ignored',
						type: 'error',
						reason: 'filtered_message',
					};
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

				let parseResult;
				if (process.env.NODE_ENV === 'development') {
					parseResult = { success: true, data: body };
				} else {
					parseResult = errorEventSchema.safeParse(body);
					if (!parseResult.success) {
						await logBlockedTraffic(
							request,
							body,
							query,
							'invalid_schema',
							'Schema Validation',
							undefined,
							clientId
						);
						return {
							status: 'error',
							message: 'Invalid event schema',
							errors: parseResult.error.issues,
						};
					}
				}
				insertError(body, clientId, userAgent, ip);
				return { status: 'success', type: 'error' };
			}

			if (eventType === 'web_vitals') {
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

				let parseResult;
				if (process.env.NODE_ENV === 'development') {
					parseResult = { success: true, data: body };
				} else {
					parseResult = webVitalsEventSchema.safeParse(body);
					if (!parseResult.success) {
						await logBlockedTraffic(
							request,
							body,
							query,
							'invalid_schema',
							'Schema Validation',
							undefined,
							clientId
						);
						return {
							status: 'error',
							message: 'Invalid event schema',
							errors: parseResult.error.issues,
						};
					}
				}
				insertWebVitals(body, clientId, userAgent, ip);
				return { status: 'success', type: 'web_vitals' };
			}

			if (eventType === 'custom') {
				let parseResult;
				if (process.env.NODE_ENV === 'development') {
					parseResult = { success: true, data: body };
				} else {
					parseResult = customEventSchema.safeParse(body);
					if (!parseResult.success) {
						await logBlockedTraffic(
							request,
							body,
							query,
							'invalid_schema',
							'Schema Validation',
							undefined,
							clientId
						);
						return {
							status: 'error',
							message: 'Invalid event schema',
							errors: parseResult.error.issues,
						};
					}
				}

				const eventId = body.eventId || randomUUID();
				const customEventWithId = { ...body, eventId };

				await insertCustomEvent(customEventWithId, clientId, userAgent, ip);
				return { status: 'success', type: 'custom', eventId };
			}

			if (eventType === 'outgoing_link') {
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

				let parseResult;
				if (process.env.NODE_ENV === 'development') {
					parseResult = { success: true, data: body };
				} else {
					parseResult = outgoingLinkSchema.safeParse(body);
					if (!parseResult.success) {
						await logBlockedTraffic(
							request,
							body,
							query,
							'invalid_schema',
							'Schema Validation',
							undefined,
							clientId
						);
						return {
							status: 'error',
							message: 'Invalid event schema',
							errors: parseResult.error.issues,
						};
					}
				}
				insertOutgoingLink(body, clientId, userAgent, ip);
				return { status: 'success', type: 'outgoing_link' };
			}

			return { status: 'error', message: 'Unknown event type' };
		} catch (error) {
			console.error('Error processing event:', error);
			return { status: 'error', message: 'Internal server error' };
		}
	})
	.post('/batch', async (context) => {
		const { body, query, request } = context as {
			body: any;
			query: any;
			request: Request;
		};

		try {
			if (!Array.isArray(body)) {
				console.error('Batch endpoint received non-array body');
				return {
					status: 'error',
					message: 'Batch endpoint expects array of events',
				};
			}

			if (body.length > VALIDATION_LIMITS.BATCH_MAX_SIZE) {
				return { status: 'error', message: 'Batch too large' };
			}

			const validation = await validateRequest(body, query, request);
			if ('error' in validation) {
				return { ...validation.error, batch: true };
			}

			const { clientId, userAgent, ip } = validation;

			const salt = await getDailySalt();
			for (const event of body) {
				if (event.anonymous_id) {
					event.anonymous_id = saltAnonymousId(event.anonymous_id, salt);
				}
			}

			const trackEvents: AnalyticsEvent[] = [];
			const errorEvents: ErrorEvent[] = [];
			const webVitalsEvents: WebVitalsEvent[] = [];
			const customEvents: CustomEvent[] = [];
			const outgoingLinkEvents: CustomOutgoingLink[] = [];
			const results: any[] = [];

			for (const event of body) {
				const eventType = event.type || 'track';

				try {
					if (eventType === 'track') {
						const botError = await checkForBot(
							request,
							event,
							query,
							clientId,
							userAgent
						);
						if (botError) {
							results.push({
								status: 'error',
								message: 'Bot detected',
								eventType,
								error: 'ignored',
							});
							continue;
						}

						if (process.env.NODE_ENV !== 'development') {
							const parseResult = analyticsEventSchema.safeParse(event);
							if (!parseResult.success) {
								await logBlockedTraffic(
									request,
									event,
									query,
									'invalid_schema',
									'Schema Validation',
									undefined,
									clientId
								);
								results.push({
									status: 'error',
									message: 'Invalid event schema',
									eventType,
									errors: parseResult.error.issues,
									eventId: event.eventId,
								});
								continue;
							}
						}

						const trackEvent = await processTrackEventData(
							event,
							clientId,
							userAgent,
							ip
						);
						trackEvents.push(trackEvent);
						results.push({
							status: 'success',
							type: 'track',
							eventId: event.eventId,
						});
					} else if (eventType === 'error') {
						if (FILTERED_ERROR_MESSAGES.has(event.payload?.message)) {
							results.push({
								status: 'ignored',
								type: 'error',
								reason: 'filtered_message',
							});
							continue;
						}

						const botError = await checkForBot(
							request,
							event,
							query,
							clientId,
							userAgent
						);
						if (botError) {
							results.push({
								status: 'error',
								message: 'Bot detected',
								eventType,
								error: 'ignored',
							});
							continue;
						}

						if (process.env.NODE_ENV !== 'development') {
							const parseResult = errorEventSchema.safeParse(event);
							if (!parseResult.success) {
								await logBlockedTraffic(
									request,
									event,
									query,
									'invalid_schema',
									'Schema Validation',
									undefined,
									clientId
								);
								results.push({
									status: 'error',
									message: 'Invalid event schema',
									eventType,
									errors: parseResult.error.issues,
									eventId: event.payload?.eventId,
								});
								continue;
							}
						}

						const errorEvent = await processErrorEventData(
							event,
							clientId,
							userAgent,
							ip
						);
						errorEvents.push(errorEvent);
						results.push({
							status: 'success',
							type: 'error',
							eventId: event.payload?.eventId,
						});
					} else if (eventType === 'web_vitals') {
						const botError = await checkForBot(
							request,
							event,
							query,
							clientId,
							userAgent
						);
						if (botError) {
							results.push({
								status: 'error',
								message: 'Bot detected',
								eventType,
								error: 'ignored',
							});
							continue;
						}

						if (process.env.NODE_ENV !== 'development') {
							const parseResult = webVitalsEventSchema.safeParse(event);
							if (!parseResult.success) {
								await logBlockedTraffic(
									request,
									event,
									query,
									'invalid_schema',
									'Schema Validation',
									undefined,
									clientId
								);
								results.push({
									status: 'error',
									message: 'Invalid event schema',
									eventType,
									errors: parseResult.error.issues,
									eventId: event.payload?.eventId,
								});
								continue;
							}
						}

						const vitalsEvent = await processWebVitalsEventData(
							event,
							clientId,
							userAgent,
							ip
						);
						webVitalsEvents.push(vitalsEvent);
						results.push({
							status: 'success',
							type: 'web_vitals',
							eventId: event.payload?.eventId,
						});
					} else if (eventType === 'custom') {
						if (process.env.NODE_ENV !== 'development') {
							const parseResult = customEventSchema.safeParse(event);
							if (!parseResult.success) {
								await logBlockedTraffic(
									request,
									event,
									query,
									'invalid_schema',
									'Schema Validation',
									undefined,
									clientId
								);
								results.push({
									status: 'error',
									message: 'Invalid event schema',
									eventType,
									errors: parseResult.error.issues,
									eventId: event.eventId,
								});
								continue;
							}
						}

						const customEvent = await processCustomEventData(event, clientId);
						customEvents.push(customEvent);
						results.push({
							status: 'success',
							type: 'custom',
							eventId: event.eventId,
						});
					} else if (eventType === 'outgoing_link') {
						const botError = await checkForBot(
							request,
							event,
							query,
							clientId,
							userAgent
						);
						if (botError) {
							results.push({
								status: 'error',
								message: 'Bot detected',
								eventType,
								error: 'ignored',
							});
							continue;
						}

						if (process.env.NODE_ENV !== 'development') {
							const parseResult = outgoingLinkSchema.safeParse(event);
							if (!parseResult.success) {
								await logBlockedTraffic(
									request,
									event,
									query,
									'invalid_schema',
									'Schema Validation',
									undefined,
									clientId
								);
								results.push({
									status: 'error',
									message: 'Invalid event schema',
									eventType,
									errors: parseResult.error.issues,
									eventId: event.eventId,
								});
								continue;
							}
						}

						const linkEvent = await processOutgoingLinkData(event, clientId);
						outgoingLinkEvents.push(linkEvent);
						results.push({
							status: 'success',
							type: 'outgoing_link',
							eventId: event.eventId,
						});
					} else {
						results.push({
							status: 'error',
							message: 'Unknown event type',
							eventType,
						});
					}
				} catch (error) {
					results.push({
						status: 'error',
						message: 'Processing failed',
						eventType,
						error: String(error),
					});
				}
			}

			await Promise.all([
				insertTrackEventsBatch(trackEvents),
				insertErrorsBatch(errorEvents),
				insertWebVitalsBatch(webVitalsEvents),
				insertCustomEventsBatch(customEvents),
				insertOutgoingLinksBatch(outgoingLinkEvents),
			]);

			return {
				status: 'success',
				batch: true,
				processed: results.length,
				batched: {
					track: trackEvents.length,
					error: errorEvents.length,
					web_vitals: webVitalsEvents.length,
					custom: customEvents.length,
					outgoing_link: outgoingLinkEvents.length,
				},
				results,
			};
		} catch (error) {
			console.error('Error processing batch event:', error);
			return { status: 'error', message: 'Internal server error' };
		}
	});

export default app;
