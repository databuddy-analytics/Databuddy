import { t } from "elysia";

// Base event structure shared by all events
const BaseEventPayload = t.Object({
	eventId: t.Optional(t.String()), // UUID from client for deduplication
	name: t.String(),
	anonymousId: t.String(),
	// Session data
	sessionId: t.String(),
	sessionStartTime: t.Number(),
	timestamp: t.Number(),
	// Page context
	path: t.String(),
	title: t.String(),
	referrer: t.String(),
	// User context
	screen_resolution: t.String(),
	viewport_size: t.String(),
	timezone: t.String(),
	language: t.String(),
	// Connection info
	connection_type: t.Optional(t.String()), // "wifi", "cellular", "ethernet", "unknown"
	rtt: t.Optional(t.Number()), // ms
	downlink: t.Optional(t.Number()), // Mbps
	// UTM parameters
	utm_source: t.Optional(t.String()),
	utm_medium: t.Optional(t.String()),
	utm_campaign: t.Optional(t.String()),
	utm_term: t.Optional(t.String()),
	utm_content: t.Optional(t.String()),
});

export const TrackEvent = t.Object({
	type: t.Literal("track"),
	payload: t.Intersect([
		BaseEventPayload,
		t.Object({
			// Performance metrics
			load_time: t.Optional(t.Number()),
			dom_ready_time: t.Optional(t.Number()),
			dom_interactive: t.Optional(t.Number()),
			ttfb: t.Optional(t.Number()),
			request_time: t.Optional(t.Number()),
			render_time: t.Optional(t.Number()),
			redirect_time: t.Optional(t.Number()),
			domain_lookup_time: t.Optional(t.Number()),
			connection_time: t.Optional(t.Number()),
			// Engagement metrics
			page_count: t.Optional(t.Number()),
			time_on_page: t.Optional(t.Number()),
			scroll_depth: t.Optional(t.Number()),
			interaction_count: t.Optional(t.Number()),
			is_bounce: t.Optional(t.Number()), // 0 or 1
			exit_intent: t.Optional(t.Number()), // 0 or 1
			has_exit_intent: t.Optional(t.Boolean()),
			page_size: t.Optional(t.Number()),
			// Link tracking
			href: t.Optional(t.String()),
			text: t.Optional(t.String()),
			// Custom event value
			value: t.Optional(t.Union([t.String(), t.Number(), t.Boolean()])),
		}),
	]),
});

// Minimal base for error and web vitals events
const MinimalBasePayload = t.Object({
	eventId: t.Optional(t.String()), // UUID from client for deduplication
	anonymousId: t.String(),
	sessionId: t.String(),
	timestamp: t.Number(),
	path: t.String(),
});

// Error events
export const ErrorEvent = t.Object({
	type: t.Literal("error"),
	payload: t.Intersect([
		MinimalBasePayload,
		t.Object({
			message: t.String(),
			filename: t.Optional(t.String()),
			lineno: t.Optional(t.Number()),
			colno: t.Optional(t.Number()),
			stack: t.Optional(t.String()),
			errorType: t.Optional(t.String()),
		}),
	]),
});

// Web Vitals events
export const WebVitalsEvent = t.Object({
	type: t.Literal("web_vitals"),
	payload: t.Intersect([
		MinimalBasePayload,
		t.Object({
			fcp: t.Optional(t.Number()),
			lcp: t.Optional(t.Number()),
			cls: t.Optional(t.Number()),
			fid: t.Optional(t.Number()),
			inp: t.Optional(t.Number()),
		}),
	]),
});

// Union of all possible events
export const BasketEvent = t.Union([TrackEvent, ErrorEvent, WebVitalsEvent]);

// Export individual types for specific use cases
export type TrackEventType = typeof TrackEvent.static;
export type ErrorEventType = typeof ErrorEvent.static;
export type WebVitalsEventType = typeof WebVitalsEvent.static;
export type BasketEventType = typeof BasketEvent.static;
