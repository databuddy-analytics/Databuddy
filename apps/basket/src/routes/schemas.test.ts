import {
	analyticsEventSchema,
	batchedCustomEventSpansSchema,
	batchedErrorsSchema,
	batchedVitalsSchema,
	MAX_FUTURE_MS,
	MIN_TIMESTAMP,
	outgoingLinkSchema,
} from "@databuddy/validation";
import { schemaTable } from "../test-helpers";
import { trackEventSchema } from "./track-event-schema";

const now = Date.now();

schemaTable(
	"trackEventSchema",
	trackEventSchema,
	[
		["single event, minimal", { name: "signup" }],
		["single event with delivery id", { eventId: "evt_1", name: "signup" }],
		["single event, websiteId", { name: "ev", websiteId: "ws_123" }],
		["array of events", [{ name: "a" }, { name: "b" }]],
		["auto visitor ID anonymization", { name: "ev", anonymizeVisitorIds: "auto" }],
		["timestamp as string", { name: "ev", timestamp: "2024-01-01T00:00:00Z" }],
	],
	[
		["missing name", { namespace: "x" }],
		["empty name", { name: "" }],
		["name too long (257)", { name: "a".repeat(257) }],
		["namespace too long (65)", { name: "ev", namespace: "a".repeat(65) }],
		["invalid timestamp string", { name: "ev", timestamp: "not-a-date" }],
		["timestamp before minimum", { name: "ev", timestamp: MIN_TIMESTAMP - 1 }],
		[
			"timestamp too far in future",
			{ name: "ev", timestamp: Date.now() + MAX_FUTURE_MS + 1000 },
		],
		[
			"array too large (101)",
			Array.from({ length: 101 }, () => ({ name: "x" })),
		],
		["not an object", "string"],
		["number", 42],
		["null", null],
	]
);

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

const validOutgoingLink = {
	eventId: "evt_link_1",
	href: "https://external.com/page",
};

schemaTable(
	"outgoingLinkSchema",
	outgoingLinkSchema,
	[
		["minimal valid", validOutgoingLink],
	],
	[
		["missing eventId", { href: "https://x.com" }],
		["missing href", { eventId: "x" }],
		["href too long", { eventId: "x", href: "a".repeat(2049) }],
	]
);

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
		["empty array", []],
	],
	[
		["missing message", [{ timestamp: now, path: "https://x.com" }]],
		["missing path", [{ timestamp: now, message: "err" }]],
		["too many (51)", Array.from({ length: 51 }, () => validError)],
		["not an array", validError],
	]
);

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
