import { describe, expect, test } from "vitest";
import { CONTROL_CHARS, longString, XSS_PAYLOADS } from "../test-helpers";
import { buildTrackEvent, type TrackEventContext } from "./event-service";

// ── Fixtures ──

const NOW = 1_700_000_000_000;

const fullTrackData = {
	name: "pageview",
	timestamp: 1_700_000_001_000,
	sessionStartTime: 1_700_000_000_500,
	sessionId: "sess_abc123",
	anonymousId: "anon_1",
	referrer: "https://google.com",
	path: "/dashboard",
	title: "Dashboard | App",
	screen_resolution: "1920x1080",
	viewport_size: "1024x768",
	language: "en-US",
	timezone: "America/New_York",
	connection_type: "wifi",
	rtt: 50,
	downlink: 10.5,
	time_on_page: 30_000,
	scroll_depth: 75,
	interaction_count: 12,
	page_count: 3,
	utm_source: "google",
	utm_medium: "cpc",
	utm_campaign: "summer",
	utm_term: "analytics",
	utm_content: "banner",
	gclid: "gclid_abc",
	load_time: 1500,
	dom_ready_time: 800,
	dom_interactive: 600,
	ttfb: 200,
	connection_time: 50,
	render_time: 100,
	redirect_time: 10,
	domain_lookup_time: 30,
	properties: { plan: "pro", color: "blue" },
};

const fullCtx: TrackEventContext = {
	clientId: "ws_test",
	eventId: "evt_123",
	anonymousId: "salted_anon_1",
	geo: {
		anonymizedIP: "abc123def456",
		country: "United States",
		region: "California",
		city: "San Francisco",
	},
	ua: {
		browserName: "Chrome",
		browserVersion: "120.0",
		osName: "Windows",
		osVersion: "10",
		deviceType: "desktop",
		deviceBrand: "Dell",
		deviceModel: "XPS",
	},
	now: NOW,
};

// ── Field mapping snapshot ──

describe("buildTrackEvent — field mapping", () => {
	test("full input → every field mapped correctly", () => {
		const result = buildTrackEvent(fullTrackData, fullCtx);

		// Identity
		expect(result.id).toBeTruthy(); // randomUUIDv7
		expect(result.client_id).toBe("ws_test");
		expect(result.event_id).toBe("evt_123");
		expect(result.event_type).toBe("track");

		// Names & content
		expect(result.event_name).toBe("pageview");
		expect(result.title).toBe("Dashboard | App");
		expect(result.referrer).toBe("https://google.com");
		expect(result.path).toBe("/dashboard");
		expect(result.url).toBe("/dashboard"); // url === path

		// User identity
		expect(result.anonymous_id).toBe("salted_anon_1");
		expect(result.session_id).toBe("sess_abc123");

		// Timestamps — uses trackData values when numeric
		expect(result.timestamp).toBe(1_700_000_001_000);
		expect(result.time).toBe(1_700_000_001_000);
		expect(result.session_start_time).toBe(1_700_000_000_500);
		expect(result.created_at).toBe(NOW);

		// Geo
		expect(result.ip).toBe("abc123def456");
		expect(result.country).toBe("United States");
		expect(result.region).toBe("California");
		expect(result.city).toBe("San Francisco");

		// UA
		expect(result.user_agent).toBe(""); // always empty (privacy)
		expect(result.browser_name).toBe("Chrome");
		expect(result.browser_version).toBe("120.0");
		expect(result.os_name).toBe("Windows");
		expect(result.os_version).toBe("10");
		expect(result.device_type).toBe("desktop");
		expect(result.device_brand).toBe("Dell");
		expect(result.device_model).toBe("XPS");

		// Client context — passthrough
		expect(result.screen_resolution).toBe("1920x1080");
		expect(result.viewport_size).toBe("1024x768");
		expect(result.language).toBe("en-US");
		expect(result.timezone).toBe("America/New_York");
		expect(result.connection_type).toBe("wifi");
		expect(result.rtt).toBe(50);
		expect(result.downlink).toBe(10.5);

		// Engagement
		expect(result.time_on_page).toBe(30_000);
		expect(result.scroll_depth).toBe(75);
		expect(result.interaction_count).toBe(12);
		expect(result.page_count).toBe(3);

		// UTM
		expect(result.utm_source).toBe("google");
		expect(result.utm_medium).toBe("cpc");
		expect(result.utm_campaign).toBe("summer");
		expect(result.utm_term).toBe("analytics");
		expect(result.utm_content).toBe("banner");
		expect(result.gclid).toBe("gclid_abc");

		// Performance — validated through validatePerformanceMetric
		expect(result.load_time).toBe(1500);
		expect(result.dom_ready_time).toBe(800);
		expect(result.dom_interactive).toBe(600);
		expect(result.ttfb).toBe(200);
		expect(result.connection_time).toBe(50);
		expect(result.render_time).toBe(100);
		expect(result.redirect_time).toBe(10);
		expect(result.domain_lookup_time).toBe(30);

		// Properties
		expect(result.properties).toBe('{"plan":"pro","color":"blue"}');
	});

	test("minimal input → defaults applied", () => {
		const result = buildTrackEvent({ name: "click" }, fullCtx);

		expect(result.event_name).toBe("click");
		expect(result.timestamp).toBe(NOW); // falls back to ctx.now
		expect(result.time).toBe(NOW);
		expect(result.session_start_time).toBe(NOW);
		expect(result.page_count).toBe(1); // default
		expect(result.properties).toBe("{}"); // empty
		expect(result.referrer).toBe("");
		expect(result.path).toBe("");
		expect(result.url).toBe("");
		expect(result.title).toBe("");
		expect(result.session_id).toBe("");
	});

	test("missing geo fields → empty strings", () => {
		const ctx = { ...fullCtx, geo: { anonymizedIP: "" } };
		const result = buildTrackEvent({ name: "x" }, ctx);
		expect(result.ip).toBe("");
		expect(result.country).toBe("");
		expect(result.region).toBe("");
		expect(result.city).toBe("");
	});

	test("missing UA fields → empty strings", () => {
		const ctx = { ...fullCtx, ua: {} };
		const result = buildTrackEvent({ name: "x" }, ctx);
		expect(result.browser_name).toBe("");
		expect(result.os_name).toBe("");
		expect(result.device_type).toBe("");
	});

	test("non-numeric timestamp → uses ctx.now", () => {
		const result = buildTrackEvent(
			{ name: "x", timestamp: "not-a-number", sessionStartTime: null },
			fullCtx
		);
		expect(result.timestamp).toBe(NOW);
		expect(result.session_start_time).toBe(NOW);
	});

	test("performance metrics validated (negative → undefined)", () => {
		const result = buildTrackEvent(
			{ name: "x", load_time: -1, ttfb: 999_999 },
			fullCtx
		);
		expect(result.load_time).toBeUndefined();
		expect(result.ttfb).toBeUndefined(); // >300000
	});

	test("event_name sanitized (truncated to 255)", () => {
		const result = buildTrackEvent({ name: longString(300) }, fullCtx);
		expect(result.event_name.length).toBeLessThanOrEqual(255);
	});

	test("referrer/path/title sanitized (truncated to 2048)", () => {
		const result = buildTrackEvent(
			{
				name: "x",
				referrer: longString(3000),
				path: longString(3000),
				title: longString(3000),
			},
			fullCtx
		);
		expect(result.referrer.length).toBeLessThanOrEqual(2048);
		expect(result.path.length).toBeLessThanOrEqual(2048);
		expect(result.title.length).toBeLessThanOrEqual(2048);
	});
});

// ── Sanitization boundary ──

describe("buildTrackEvent — sanitization boundary", () => {
	for (const payload of XSS_PAYLOADS) {
		test(`XSS in name: ${payload.slice(0, 30)}…`, () => {
			const result = buildTrackEvent({ name: payload }, fullCtx);
			expect(result.event_name).not.toContain("<");
			expect(result.event_name).not.toContain(">");
		});
	}

	test("XSS in all text fields stripped", () => {
		const xss = '<script>alert("xss")</script>';
		const result = buildTrackEvent(
			{
				name: xss,
				referrer: xss,
				path: xss,
				title: xss,
			},
			fullCtx
		);
		for (const field of [
			result.event_name,
			result.referrer,
			result.path,
			result.title,
		]) {
			expect(field).not.toContain("<script>");
			expect(field).not.toContain("<");
		}
	});

	test("control chars stripped from text fields", () => {
		const dirty = `clean${CONTROL_CHARS}text`;
		const result = buildTrackEvent(
			{ name: dirty, referrer: dirty, path: dirty, title: dirty },
			fullCtx
		);
		for (const field of [
			result.event_name,
			result.referrer,
			result.path,
			result.title,
		]) {
			for (const char of CONTROL_CHARS) {
				expect(field).not.toContain(char);
			}
		}
	});

	test("properties with XSS are JSON-stringified (not sanitized — stored as JSON)", () => {
		const result = buildTrackEvent(
			{ name: "x", properties: { evil: "<script>alert(1)</script>" } },
			fullCtx
		);
		// Properties are JSON-stringified, not HTML-sanitized (they're stored as JSON in CH)
		expect(result.properties).toContain("script");
		expect(typeof result.properties).toBe("string");
		// But it's valid JSON
		expect(() => JSON.parse(result.properties as string)).not.toThrow();
	});

	test("passthrough fields (screen_resolution, language, etc.) are NOT sanitized", () => {
		const result = buildTrackEvent(
			{
				name: "x",
				screen_resolution: "<script>",
				language: "<img onerror=alert(1)>",
				timezone: "America/New_York",
			},
			fullCtx
		);
		// These pass through raw — this is the current behavior
		// This test documents it so we notice if it changes
		expect(result.screen_resolution).toBe("<script>");
		expect(result.language).toBe("<img onerror=alert(1)>");
	});

	test("session_id validated (rejects special chars)", () => {
		const result = buildTrackEvent(
			{ name: "x", sessionId: "sess<script>123" },
			fullCtx
		);
		// sanitizeString strips <script>, then regex check rejects remaining if invalid
		expect(result.session_id).not.toContain("<");
	});
});

// ── Response contract shapes ──

describe("buildTrackEvent — output shape completeness", () => {
	const REQUIRED_FIELDS = [
		"id",
		"client_id",
		"event_name",
		"anonymous_id",
		"time",
		"session_id",
		"event_type",
		"event_id",
		"session_start_time",
		"timestamp",
		"referrer",
		"url",
		"path",
		"title",
		"ip",
		"user_agent",
		"browser_name",
		"browser_version",
		"os_name",
		"os_version",
		"device_type",
		"device_brand",
		"device_model",
		"country",
		"region",
		"city",
		"screen_resolution",
		"viewport_size",
		"language",
		"timezone",
		"connection_type",
		"rtt",
		"downlink",
		"time_on_page",
		"scroll_depth",
		"interaction_count",
		"page_count",
		"utm_source",
		"utm_medium",
		"utm_campaign",
		"utm_term",
		"utm_content",
		"gclid",
		"load_time",
		"dom_ready_time",
		"dom_interactive",
		"ttfb",
		"connection_time",
		"render_time",
		"redirect_time",
		"domain_lookup_time",
		"properties",
		"created_at",
	] as const;

	test("output has all required fields", () => {
		const result = buildTrackEvent(fullTrackData, fullCtx);
		for (const field of REQUIRED_FIELDS) {
			expect(result).toHaveProperty(field);
		}
	});

	test("output has no unexpected fields", () => {
		const result = buildTrackEvent(fullTrackData, fullCtx);
		const keys = Object.keys(result);
		for (const key of keys) {
			expect(REQUIRED_FIELDS).toContain(key as any);
		}
	});
});
