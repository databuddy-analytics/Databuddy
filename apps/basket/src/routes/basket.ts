import crypto, { createHash, randomUUID } from 'node:crypto';
import {
	type AnalyticsEvent,
	type BlockedTraffic,
	clickHouse,
	type ErrorEvent,
	type WebVitalsEvent,
} from '@databuddy/db';
import { redis } from '@databuddy/redis';
import { Autumn as autumn } from 'autumn-js';
import { Elysia } from 'elysia';
import { getWebsiteByIdV2, isValidOrigin } from '../hooks/auth';
import { logger } from '../lib/logger';
import {
	analyticsEventSchema,
	errorEventSchema,
	webVitalsEventSchema,
} from '../utils/event-schema';
import { extractIpFromRequest, getGeo } from '../utils/ip-geo';
import { detectBot, parseUserAgent } from '../utils/user-agent';
import {
	sanitizeString,
	VALIDATION_LIMITS,
	validatePayloadSize,
	validatePerformanceMetric,
	validateSessionId,
} from '../utils/validation';

async function getDailySalt(): Promise<string> {
	const saltKey = `salt:${Math.floor(Date.now() / (24 * 60 * 60 * 1000))}`;
	let salt = await redis.get(saltKey);
	if (!salt) {
		salt = crypto.randomBytes(32).toString('hex');
		await redis.setex(saltKey, 60 * 60 * 24, salt);
	}
	return salt;
}

function saltAnonymousId(anonymousId: string, salt: string): string {
	return createHash('sha256')
		.update(anonymousId + salt)
		.digest('hex');
}

async function validateRequest(body: any, query: any, request: Request) {
	if (!validatePayloadSize(body, VALIDATION_LIMITS.PAYLOAD_MAX_SIZE)) {
		await logBlockedTraffic(
			request,
			body,
			query,
			'payload_too_large',
			'Validation Error'
		);
		return { error: { status: 'error', message: 'Payload too large' } };
	}

	const clientId = sanitizeString(
		query.client_id,
		VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
	);
	if (!clientId) {
		await logBlockedTraffic(
			request,
			body,
			query,
			'missing_client_id',
			'Validation Error'
		);
		return { error: { status: 'error', message: 'Missing client ID' } };
	}

	const website = await getWebsiteByIdV2(clientId);
	if (!website || website.status !== 'ACTIVE') {
		await logBlockedTraffic(
			request,
			body,
			query,
			'invalid_client_id',
			'Validation Error',
			undefined,
			clientId
		);
		return {
			error: { status: 'error', message: 'Invalid or inactive client ID' },
		};
	}

	if (website.ownerId) {
		const { data } = await autumn.check({
			customer_id: website.ownerId,
			feature_id: 'events',
			send_event: true,
		});

		if (!data?.allowed) {
			await logBlockedTraffic(
				request,
				body,
				query,
				'exceeded_event_limit',
				'Validation Error',
				undefined,
				clientId
			);
			return { error: { status: 'error', message: 'Exceeded event limit' } };
		}
	}

	const origin = request.headers.get('origin');
	if (origin && !isValidOrigin(origin, website.domain)) {
		await logBlockedTraffic(
			request,
			body,
			query,
			'origin_not_authorized',
			'Security Check',
			undefined,
			clientId
		);
		return { error: { status: 'error', message: 'Origin not authorized' } };
	}

	const userAgent =
		sanitizeString(
			request.headers.get('user-agent'),
			VALIDATION_LIMITS.STRING_MAX_LENGTH
		) || '';
	const botCheck = detectBot(userAgent, request);
	if (botCheck.isBot) {
		await logBlockedTraffic(
			request,
			body,
			query,
			botCheck.reason || 'unknown_bot',
			botCheck.category || 'Bot Detection',
			botCheck.botName,
			clientId
		);
		return { error: { status: 'ignored' } };
	}

	const ip = extractIpFromRequest(request);

	return {
		success: true,
		clientId,
		userAgent,
		ip,
		ownerId: website.ownerId,
	};
}

async function insertError(
	errorData: any,
	clientId: string,
	userAgent: string,
	ip: string
): Promise<void> {
	const eventId = sanitizeString(
		errorData.payload.eventId,
		VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
	);
	if (await checkDuplicate(eventId, 'error')) {
		return;
	}

	const payload = errorData.payload;
	const now = Date.now();

	const { anonymizedIP, country, region } = await getGeo(ip);
	const { browserName, browserVersion, osName, osVersion, deviceType } =
		parseUserAgent(userAgent);

	const errorEvent: ErrorEvent = {
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
		// Enriched fields
		ip: anonymizedIP || '',
		country: country || '',
		region: region || '',
		browser_name: browserName || '',
		browser_version: browserVersion || '',
		os_name: osName || '',
		os_version: osVersion || '',
		device_type: deviceType || '',
		created_at: now,
	};

	try {
		await clickHouse.insert({
			table: 'analytics.errors',
			values: [errorEvent],
			format: 'JSONEachRow',
		});
	} catch (err) {
		logger.error('Failed to insert error event', {
			error: err as Error,
			eventId,
		});
		throw err;
	}
}

async function insertWebVitals(
	vitalsData: any,
	clientId: string,
	userAgent: string,
	ip: string
): Promise<void> {
	const eventId = sanitizeString(
		vitalsData.payload.eventId,
		VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
	);

	if (await checkDuplicate(eventId, 'web_vitals')) {
		return;
	}

	const payload = vitalsData.payload;
	const now = Date.now();

	const { country, region } = await getGeo(ip);
	const { browserName, browserVersion, osName, osVersion, deviceType } =
		parseUserAgent(userAgent);

	const webVitalsEvent: WebVitalsEvent = {
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
		// Enriched fields
		country: country || '',
		region: region || '',
		browser_name: browserName || '',
		browser_version: browserVersion || '',
		os_name: osName || '',
		os_version: osVersion || '',
		device_type: deviceType || '',
		created_at: now,
	};

	try {
		await clickHouse.insert({
			table: 'analytics.web_vitals',
			values: [webVitalsEvent],
			format: 'JSONEachRow',
		});
	} catch (err) {
		logger.error('Failed to insert web vitals event', {
			error: err as Error,
			eventId,
		});
		throw err;
	}
}

async function insertTrackEvent(
	trackData: any,
	clientId: string,
	userAgent: string,
	ip: string
): Promise<void> {
	const eventId = sanitizeString(
		trackData.eventId,
		VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
	);
	if (await checkDuplicate(eventId, 'track')) {
		return;
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

	const trackEvent: AnalyticsEvent = {
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
		user_agent:
			sanitizeString(userAgent, VALIDATION_LIMITS.STRING_MAX_LENGTH) || '',
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
		exit_intent: trackData.exit_intent || 0,
		page_count: trackData.page_count || 1,
		is_bounce: trackData.is_bounce || 0,
		has_exit_intent: trackData.has_exit_intent,
		page_size: trackData.page_size,

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
		request_time: validatePerformanceMetric(trackData.request_time),
		render_time: validatePerformanceMetric(trackData.render_time),
		redirect_time: validatePerformanceMetric(trackData.redirect_time),
		domain_lookup_time: validatePerformanceMetric(trackData.domain_lookup_time),

		fcp: validatePerformanceMetric(trackData.fcp),
		lcp: validatePerformanceMetric(trackData.lcp),
		cls: validatePerformanceMetric(trackData.cls),
		fid: validatePerformanceMetric(trackData.fid),
		inp: validatePerformanceMetric(trackData.inp),

		href: trackData.href,
		text: trackData.text,
		value: trackData.value,

		error_message: undefined,
		error_filename: undefined,
		error_lineno: undefined,
		error_colno: undefined,
		error_stack: undefined,
		error_type: undefined,

		properties: trackData.properties
			? JSON.stringify(trackData.properties)
			: '{}',
		created_at: now,
	};

	try {
		await clickHouse.insert({
			table: 'analytics.events',
			values: [trackEvent],
			format: 'JSONEachRow',
		});
	} catch (err) {
		logger.error('Failed to insert track event', {
			error: err as Error,
			eventId,
		});
		throw err;
	}
}

async function checkDuplicate(
	eventId: string,
	eventType: string
): Promise<boolean> {
	const key = `dedup:${eventType}:${eventId}`;
	if (await redis.exists(key)) {
		return true;
	}

	const ttl = eventId.startsWith('exit_') ? 172_800 : 86_400;
	await redis.setex(key, ttl, '1');
	return false;
}

async function logBlockedTraffic(
	request: Request,
	body: any,
	_query: any,
	blockReason: string,
	blockCategory: string,
	botName?: string,
	clientId?: string
): Promise<void> {
	try {
		const ip = extractIpFromRequest(request);
		const userAgent =
			sanitizeString(
				request.headers.get('user-agent'),
				VALIDATION_LIMITS.STRING_MAX_LENGTH
			) || '';

		const { anonymizedIP, country, region, city } = await getGeo(ip);
		const { browserName, browserVersion, osName, osVersion, deviceType } =
			parseUserAgent(userAgent);

		const now = Date.now();

		const blockedEvent: BlockedTraffic = {
			id: randomUUID(),
			client_id: clientId || '',
			timestamp: now,

			path: sanitizeString(body?.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
			url: sanitizeString(
				body?.url || body?.href,
				VALIDATION_LIMITS.STRING_MAX_LENGTH
			),
			referrer: sanitizeString(
				body?.referrer || request.headers.get('referer'),
				VALIDATION_LIMITS.STRING_MAX_LENGTH
			),
			method: 'POST',
			origin: sanitizeString(
				request.headers.get('origin'),
				VALIDATION_LIMITS.STRING_MAX_LENGTH
			),

			ip: anonymizedIP || ip,
			user_agent: userAgent || '',
			accept_header: sanitizeString(
				request.headers.get('accept'),
				VALIDATION_LIMITS.STRING_MAX_LENGTH
			),
			language: sanitizeString(
				request.headers.get('accept-language'),
				VALIDATION_LIMITS.STRING_MAX_LENGTH
			),

			block_reason: blockReason,
			block_category: blockCategory,
			bot_name: botName || '',

			country: country || '',
			region: region || '',
			city: city || '',
			browser_name: browserName || '',
			browser_version: browserVersion || '',
			os_name: osName || '',
			os_version: osVersion || '',
			device_type: deviceType || '',

			payload_size:
				blockReason === 'payload_too_large'
					? JSON.stringify(body || {}).length
					: undefined,

			created_at: now,
		};

		clickHouse
			.insert({
				table: 'analytics.blocked_traffic',
				values: [blockedEvent],
				format: 'JSONEachRow',
			})
			.then(() => {
				logger.info(
					`Logged blocked traffic, origin: ${blockedEvent.origin}, reason: ${blockedEvent.block_reason}, category: ${blockedEvent.block_category}`,
					{ blockedEvent }
				);
			})
			.catch((err) => {
				logger.error('Failed to log blocked traffic', { error: err as Error });
			});
	} catch (error) {
		logger.error('Failed to log blocked traffic', { error: error as Error });
	}
}

const app = new Elysia()
	.post(
		'/',
		async ({
			body,
			query,
			request,
		}: {
			body: any;
			query: any;
			request: Request;
		}) => {
			const validation = await validateRequest(body, query, request);
			if (!validation.success) {
				return validation.error;
			}

			const { clientId, userAgent, ip } = validation;

			const salt = await getDailySalt();
			if (body.anonymous_id) {
				body.anonymous_id = saltAnonymousId(body.anonymous_id, salt);
			}

			const eventType = body.type || 'track';

			if (eventType === 'track') {
				const parseResult = analyticsEventSchema.safeParse(body);
				if (!parseResult.success) {
					console.error(
						'Blocked event schema errors:',
						parseResult.error.issues,
						'Payload:',
						body
					);
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
				insertTrackEvent(body, clientId, userAgent, ip);
				return { status: 'success', type: 'track' };
			}

			if (eventType === 'error') {
				const parseResult = errorEventSchema.safeParse(body);
				if (!parseResult.success) {
					console.error(
						'Blocked event schema errors:',
						parseResult.error.issues,
						'Payload:',
						body
					);
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
				insertError(body, clientId, userAgent, ip);
				return { status: 'success', type: 'error' };
			}

			if (eventType === 'web_vitals') {
				const parseResult = webVitalsEventSchema.safeParse(body);
				if (!parseResult.success) {
					console.error(
						'Blocked event schema errors:',
						parseResult.error.issues,
						'Payload:',
						body
					);
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
				insertWebVitals(body, clientId, userAgent, ip);
				return { status: 'success', type: 'web_vitals' };
			}

			return { status: 'error', message: 'Unknown event type' };
		}
	)
	.post(
		'/batch',
		async ({
			body,
			query,
			request,
		}: {
			body: any;
			query: any;
			request: Request;
		}) => {
			if (!Array.isArray(body)) {
				return {
					status: 'error',
					message: 'Batch endpoint expects array of events',
				};
			}

			if (body.length > VALIDATION_LIMITS.BATCH_MAX_SIZE) {
				return { status: 'error', message: 'Batch too large' };
			}

			const validation = await validateRequest(body, query, request);
			if (!validation.success) {
				return { ...validation.error, batch: true };
			}

			const { clientId, userAgent, ip } = validation;

			const salt = await getDailySalt();
			for (const event of body) {
				if (event.anonymous_id) {
					event.anonymous_id = saltAnonymousId(event.anonymous_id, salt);
				}
			}

			const results = [];
			const processingPromises = body.map(async (event: any) => {
				const eventType = event.type || 'track';

				if (eventType === 'track') {
					const parseResult = analyticsEventSchema.safeParse(event);
					if (!parseResult.success) {
						console.error(
							'Blocked event schema errors:',
							parseResult.error.issues,
							'Payload:',
							event
						);
						await logBlockedTraffic(
							request,
							event,
							query,
							'invalid_schema',
							'Schema Validation',
							undefined,
							clientId
						);
						return {
							status: 'error',
							message: 'Invalid event schema',
							eventType,
							errors: parseResult.error.issues,
							eventId: event.eventId || event.payload?.eventId,
						};
					}
					try {
						await insertTrackEvent(event, clientId, userAgent, ip);
						return {
							status: 'success',
							type: 'track',
							eventId: event.eventId,
						};
					} catch (error) {
						return {
							status: 'error',
							message: 'Processing failed',
							eventType,
							error: String(error),
						};
					}
				}
				if (eventType === 'error') {
					const parseResult = errorEventSchema.safeParse(event);
					if (!parseResult.success) {
						console.error(
							'Blocked event schema errors:',
							parseResult.error.issues,
							'Payload:',
							event
						);
						await logBlockedTraffic(
							request,
							event,
							query,
							'invalid_schema',
							'Schema Validation',
							undefined,
							clientId
						);
						return {
							status: 'error',
							message: 'Invalid event schema',
							eventType,
							errors: parseResult.error.issues,
							eventId: event.payload?.eventId,
						};
					}
					try {
						await insertError(event, clientId, userAgent, ip);
						return {
							status: 'success',
							type: 'error',
							eventId: event.payload?.eventId,
						};
					} catch (error) {
						return {
							status: 'error',
							message: 'Processing failed',
							eventType,
							error: String(error),
						};
					}
				}
				if (eventType === 'web_vitals') {
					const parseResult = webVitalsEventSchema.safeParse(event);
					if (!parseResult.success) {
						console.error(
							'Blocked event schema errors:',
							parseResult.error.issues,
							'Payload:',
							event
						);
						await logBlockedTraffic(
							request,
							event,
							query,
							'invalid_schema',
							'Schema Validation',
							undefined,
							clientId
						);
						return {
							status: 'error',
							message: 'Invalid event schema',
							eventType,
							errors: parseResult.error.issues,
							eventId: event.payload?.eventId,
						};
					}
					try {
						await insertWebVitals(event, clientId, userAgent, ip);
						return {
							status: 'success',
							type: 'web_vitals',
							eventId: event.payload?.eventId,
						};
					} catch (error) {
						return {
							status: 'error',
							message: 'Processing failed',
							eventType,
							error: String(error),
						};
					}
				}
				return {
					status: 'error',
					message: 'Unknown event type',
					eventType,
				};
			});

			results.push(...(await Promise.all(processingPromises)));

			return {
				status: 'success',
				batch: true,
				processed: results.length,
				results,
			};
		}
	);

export default app;
