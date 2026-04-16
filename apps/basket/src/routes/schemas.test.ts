import {
	analyticsEventSchema,
	batchedCustomEventSpansSchema,
	batchedErrorsSchema,
	batchedVitalsSchema,
	outgoingLinkSchema,
} from "@databuddy/validation";
import { schemaTable } from "../test-helpers";
import { trackEventSchema } from "./track-event-schema";

const now = Date.now();

// ── trackEventSchema ──

schemaTable(
	"trackEventSchema",
	trackEventSchema,
	[
		["single event, minimal", { name: "signup" }],
		[
			"single event, full",
			{
				name: "purchase",
				namespace: "billing",
				timestamp: now,
				properties: { plan: "pro" },
				anonymousId: "abc",
				sessionId: "sess",
				source: "api",
			},
		],
		["single event, websiteId", { name: "ev", websiteId: "ws_123" }],
		["array of events", [{ name: "a" }, { name: "b" }]],
		["array, single element", [{ name: "a" }]],
		["timestamp as string", { name: "ev", timestamp: "2024-01-01T00:00:00Z" }],
		["timestamp as Date", { name: "ev", timestamp: new Date() }],
	],
	[
		["missing name", { namespace: "x" }],
		["empty name", { name: "" }],
		["name too long (257)", { name: "a".repeat(257) }],
		["namespace too long (65)", { name: "ev", namespace: "a".repeat(65) }],
		[
			"array too large (101)",
			Array.from({ length: 101 }, () => ({ name: "x" })),
		],
		["not an object", "string"],
		["number", 42],
		["null", null],
	]
);

// ── analyticsEventSchema ──

const validAnalyticsEvent = {
	eventId: "evt_123",
	name: "pageview",
	path: "https://example.com/page",
};

schemaTable(
	"analyticsEventSchema",
	analyticsEventSchema,
	[
		["minimal valid", validAnalyticsEvent],
		[
			"with optional fields",
			{
				...validAnalyticsEvent,
				anonymousId: "anon_1",
				sessionId: "sess_1",
				timestamp: now,
				sessionStartTime: now,
				title: "My Page",
				screen_resolution: "1920x1080",
				viewport_size: "1024x768",
				language: "en-US",
				timezone: "America/New_York",
				connection_type: "wifi",
				rtt: 50,
				downlink: 10.5,
			},
		],
		[
			"with UTM params",
			{
				...validAnalyticsEvent,
				utm_source: "google",
				utm_medium: "cpc",
				utm_campaign: "summer",
			},
		],
		[
			"with performance metrics",
			{
				...validAnalyticsEvent,
				load_time: 1500,
				ttfb: 200,
				dom_ready_time: 800,
			},
		],
		[
			"nullable fields set to null",
			{
				...validAnalyticsEvent,
				title: null,
				screen_resolution: null,
				language: null,
			},
		],
		[
			"localhost path in dev-like scenario",
			{
				...validAnalyticsEvent,
				path: "http://localhost:3000/page",
			},
		],
	],
	[
		["missing eventId", { name: "pageview", path: "https://example.com" }],
		["missing name", { eventId: "x", path: "https://example.com" }],
		["missing path", { eventId: "x", name: "pageview" }],
		["invalid path (not URL)", { ...validAnalyticsEvent, path: "not-a-url" }],
		["empty name", { eventId: "x", name: "", path: "https://example.com" }],
		["not an object", "string"],
	]
);

// ── outgoingLinkSchema ──

const validOutgoingLink = {
	eventId: "evt_link_1",
	href: "https://external.com/page",
};

schemaTable(
	"outgoingLinkSchema",
	outgoingLinkSchema,
	[
		["minimal valid", validOutgoingLink],
		[
			"with optional fields",
			{
				...validOutgoingLink,
				anonymousId: "anon",
				sessionId: "sess",
				timestamp: now,
				text: "Click here",
				properties: '{"key":"val"}',
			},
		],
		["nullable text", { ...validOutgoingLink, text: null }],
	],
	[
		["missing eventId", { href: "https://x.com" }],
		["missing href", { eventId: "x" }],
		["href too long", { eventId: "x", href: "a".repeat(2049) }],
	]
);

// ── batchedVitalsSchema ──

const validVital = {
	timestamp: now,
	path: "https://example.com/page",
	metricName: "LCP" as const,
	metricValue: 2500,
};

schemaTable(
	"batchedVitalsSchema",
	batchedVitalsSchema,
	[
		["single vital", [validVital]],
		[
			"all metric types",
			["FCP", "LCP", "CLS", "INP", "TTFB", "FPS"].map((m) => ({
				...validVital,
				metricName: m,
				metricValue: Math.random() * 5000,
			})),
		],
		[
			"with optional IDs",
			[{ ...validVital, anonymousId: "anon", sessionId: "sess" }],
		],
		["empty array", []],
	],
	[
		["invalid metric name", [{ ...validVital, metricName: "INVALID" }]],
		[
			"missing metricValue",
			[{ timestamp: now, path: "https://x.com", metricName: "LCP" }],
		],
		["missing path", [{ timestamp: now, metricName: "LCP", metricValue: 100 }]],
		["too many (21)", Array.from({ length: 21 }, () => validVital)],
		["not an array", validVital],
	]
);

// ── batchedErrorsSchema ──

const validError = {
	timestamp: now,
	path: "https://example.com/page",
	message: "TypeError: Cannot read property 'x' of undefined",
};

schemaTable(
	"batchedErrorsSchema",
	batchedErrorsSchema,
	[
		["single error", [validError]],
		[
			"with all optional fields",
			[
				{
					...validError,
					filename: "app.js",
					lineno: 42,
					colno: 10,
					stack: "Error: ...\n  at foo (app.js:42)",
					errorType: "TypeError",
					anonymousId: "anon",
					sessionId: "sess",
				},
			],
		],
		["empty array", []],
	],
	[
		["missing message", [{ timestamp: now, path: "https://x.com" }]],
		["missing path", [{ timestamp: now, message: "err" }]],
		["too many (51)", Array.from({ length: 51 }, () => validError)],
		["not an array", validError],
	]
);

// ── batchedCustomEventSpansSchema ──

const validCustomEvent = {
	timestamp: now,
	path: "https://example.com/page",
	eventName: "purchase",
};

schemaTable(
	"batchedCustomEventSpansSchema",
	batchedCustomEventSpansSchema,
	[
		["single event", [validCustomEvent]],
		[
			"with optional fields",
			[
				{
					...validCustomEvent,
					anonymousId: "anon",
					sessionId: "sess",
					properties: '{"key":"val"}',
				},
			],
		],
		["empty array", []],
	],
	[
		["missing eventName", [{ timestamp: now, path: "https://x.com" }]],
		[
			"empty eventName",
			[{ timestamp: now, path: "https://x.com", eventName: "" }],
		],
		["missing path", [{ timestamp: now, eventName: "x" }]],
		["too many (101)", Array.from({ length: 101 }, () => validCustomEvent)],
		["not an array", validCustomEvent],
	]
);
