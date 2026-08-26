import { describe, expect, test } from "vitest";
import { CONTROL_CHARS, longString, XSS_PAYLOADS } from "../test-helpers";
import { buildTrackEvent, type TrackEventContext } from "./event-service";

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

describe("buildTrackEvent — field mapping", () => {
	test("full input → every field mapped correctly", () => {
		const result = buildTrackEvent(fullTrackData, fullCtx);

		expect(result).toMatchObject({
			client_id: "ws_test",
			event_name: "pageview",
			title: "Dashboard | App",
			referrer: "https://google.com",
			path: "/dashboard",
			url: "/dashboard",
			anonymous_id: "salted_anon_1",
			session_id: "sess_abc123",
			timestamp: 1_700_000_001_000,
			time: 1_700_000_001_000,
			created_at: NOW,
			ip: "abc123def456",
			country: "United States",
			region: "California",
			city: "San Francisco",
			user_agent: "",
			browser_name: "Chrome",
			browser_version: "120.0",
			os_name: "Windows",
			os_version: "10",
			device_type: "desktop",
			device_brand: "Dell",
			device_model: "XPS",
			viewport_size: "1024x768",
			language: "en-US",
			timezone: "America/New_York",
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
			dom_ready_time: 800,
			ttfb: 200,
			render_time: 100,
			properties: '{"plan":"pro","color":"blue"}',
		});
		expect(result.id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
		);
	});

	test("minimal input → defaults applied", () => {
		const result = buildTrackEvent({ name: "click" }, fullCtx);

		expect(result).toMatchObject({
			event_name: "click",
			timestamp: NOW,
			time: NOW,
			page_count: 1,
			properties: "{}",
			referrer: "",
			path: "",
			url: "",
			title: "",
			session_id: "",
		});
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
	});

	test("performance metrics over the 300s cap → undefined", () => {
		const result = buildTrackEvent({ name: "x", ttfb: 999_999 }, fullCtx);
		expect(result.ttfb).toBeUndefined();
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

	test("properties are JSON-stringified verbatim, not HTML-sanitized", () => {
		const result = buildTrackEvent(
			{ name: "x", properties: { evil: "<script>alert(1)</script>" } },
			fullCtx
		);
		expect(JSON.parse(result.properties as string)).toEqual({
			evil: "<script>alert(1)</script>",
		});
	});

	test("passthrough fields (language, timezone, etc.) are NOT sanitized", () => {
		const result = buildTrackEvent(
			{
				name: "x",
				language: "<img onerror=alert(1)>",
				timezone: "America/New_York",
			},
			fullCtx
		);
		expect(result.language).toBe("<img onerror=alert(1)>");
		expect(result.timezone).toBe("America/New_York");
	});

	test("session_id with stripped tags still passes the session id charset", () => {
		const result = buildTrackEvent(
			{ name: "x", sessionId: "sess<script>123" },
			fullCtx
		);
		expect(result.session_id).toBe("sess123");
	});
});
