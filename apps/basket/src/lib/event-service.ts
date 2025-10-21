import { randomUUID } from 'node:crypto';
import {
	type AnalyticsEvent,
	type CustomEvent,
	type CustomOutgoingLink,
	type ErrorEvent,
	type WebVitalsEvent,
	clickHouse,
} from '@databuddy/db';
import { checkDuplicate } from './security';
import { sendEvent } from './producer';
import { getGeo } from '../utils/ip-geo';
import { parseUserAgent } from '../utils/user-agent';
import {
	sanitizeString,
	VALIDATION_LIMITS,
	validatePerformanceMetric,
	validateSessionId,
} from '../utils/validation';

/**
 * Insert an error event into the database
 */
export async function insertError(
	errorData: any,
	clientId: string,
	userAgent: string,
	ip: string
): Promise<void> {
	let eventId = sanitizeString(
		errorData.payload.eventId,
		VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
	);

	if (!eventId) {
		eventId = randomUUID();
	}

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
		console.error('Failed to insert error event', {
			error: err as Error,
			eventId,
		});
		throw err;
	}
}

/**
 * Insert web vitals metrics into the database
 */
export async function insertWebVitals(
	vitalsData: any,
	clientId: string,
	userAgent: string,
	ip: string
): Promise<void> {
	let eventId = sanitizeString(
		vitalsData.payload.eventId,
		VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
	);

	if (!eventId) {
		eventId = randomUUID();
	}

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
		console.error('Failed to insert web vitals event', {
			error: err as Error,
			eventId,
		});
		throw err;
	}
}

/**
 * Insert a custom event into the database
 */
export async function insertCustomEvent(
	customData: any,
	clientId: string,
	_userAgent: string,
	_ip: string
): Promise<void> {
	let eventId = sanitizeString(
		customData.eventId,
		VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
	);

	if (!eventId) {
		eventId = randomUUID();
	}

	if (await checkDuplicate(eventId, 'custom')) {
		return;
	}

	const now = Date.now();

	const customEvent: CustomEvent = {
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

	try {
		await clickHouse.insert({
			table: 'analytics.custom_events',
			values: [customEvent],
			format: 'JSONEachRow',
		});
	} catch (err) {
		throw err;
	}
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

	if (await checkDuplicate(eventId, 'outgoing_link')) {
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
			: '{}',
		timestamp:
			typeof linkData.timestamp === 'number' ? linkData.timestamp : now,
	};

	try {
		await clickHouse.insert({
			table: 'analytics.outgoing_links',
			values: [outgoingLinkEvent],
			format: 'JSONEachRow',
		});
	} catch (err) {
		console.error('Failed to insert outgoing link event', {
			error: err as Error,
			eventId,
		});
		throw err;
	}
}

/**
 * Insert a track event (pageview/analytics event) into ClickHouse
 * Optionally also sends to Kafka if feature flag is enabled
 */
export async function insertTrackEvent(
	trackData: any,
	clientId: string,
	userAgent: string,
	ip: string
): Promise<void> {
	let eventId = sanitizeString(
		trackData.eventId,
		VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
	);

	if (!eventId) {
		eventId = randomUUID();
	}

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

	try {
		await clickHouse.insert({
			table: 'analytics.events',
			values: [trackEvent],
			format: 'JSONEachRow',
		});

		if (process.env.ENABLE_KAFKA_EVENTS === 'true') {
			try {
				sendEvent('analytics-events', trackEvent);
			} catch (kafkaErr) {
				console.error('Failed to send track event to Kafka', {
					error: kafkaErr as Error,
					eventId,
				});
			}
		}
	} catch (err) {
		console.error('Failed to insert track event', {
			error: err as Error,
			eventId,
		});
		throw err;
	}
}

