import { describe, expect, it } from "bun:test";
import { VALIDATION_LIMITS } from "../constants";
import { analyticsEventSchema } from "./analytics";
import { identifyPayloadSchema } from "./identity";

describe("identifyPayloadSchema", () => {
	it("accepts a bare profile id", () => {
		const result = identifyPayloadSchema.safeParse({ profileId: "user_42" });
		expect(result.success).toBe(true);
	});

	it("accepts scalar traits including null for deletion", () => {
		const result = identifyPayloadSchema.safeParse({
			profileId: "user_42",
			anonymousId: "anon_123",
			traits: { email: "jo@acme.com", seats: 5, active: true, plan: null },
		});
		expect(result.success).toBe(true);
	});

	it("rejects empty profile ids", () => {
		const result = identifyPayloadSchema.safeParse({ profileId: "" });
		expect(result.success).toBe(false);
	});

	it("rejects profile ids over the length limit", () => {
		const result = identifyPayloadSchema.safeParse({
			profileId: "x".repeat(VALIDATION_LIMITS.USER_ID_MAX_LENGTH + 1),
		});
		expect(result.success).toBe(false);
	});

	it("accepts an optional websiteId for API-key requests", () => {
		const result = identifyPayloadSchema.safeParse({
			profileId: "user_42",
			websiteId: "site_1",
		});
		expect(result.success).toBe(true);
	});

	it("rejects empty websiteId strings", () => {
		const result = identifyPayloadSchema.safeParse({
			profileId: "user_42",
			websiteId: "",
		});
		expect(result.success).toBe(false);
	});

	it("rejects nested trait values", () => {
		const result = identifyPayloadSchema.safeParse({
			profileId: "user_42",
			traits: { address: { city: "Berlin" } },
		});
		expect(result.success).toBe(false);
	});

	it("rejects too many trait keys", () => {
		const traits = Object.fromEntries(
			Array.from(
				{ length: VALIDATION_LIMITS.PROPERTIES_MAX_KEYS + 1 },
				(_, i) => [`key_${i}`, "v"]
			)
		);
		const result = identifyPayloadSchema.safeParse({
			profileId: "user_42",
			traits,
		});
		expect(result.success).toBe(false);
	});

	it("rejects oversized serialized traits", () => {
		const result = identifyPayloadSchema.safeParse({
			profileId: "user_42",
			traits: {
				a: "x".repeat(VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH),
				b: "x".repeat(VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH),
				c: "x".repeat(VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH),
				d: "x".repeat(VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH),
				e: "x".repeat(VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH),
				f: "x".repeat(VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH),
				g: "x".repeat(VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH),
				h: "x".repeat(VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH),
				i: "x".repeat(VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH),
			},
		});
		expect(result.success).toBe(false);
	});
});

describe("analyticsEventSchema profileId", () => {
	const validEvent = {
		eventId: "test-id",
		name: "screen_view",
		path: "https://example.com/page",
		timestamp: Date.now(),
	};

	it("accepts events with a profileId", () => {
		const result = analyticsEventSchema.safeParse({
			...validEvent,
			profileId: "user_42",
		});
		expect(result.success).toBe(true);
	});

	it("accepts events without a profileId", () => {
		const result = analyticsEventSchema.safeParse(validEvent);
		expect(result.success).toBe(true);
	});

	it("rejects empty profileId strings", () => {
		const result = analyticsEventSchema.safeParse({
			...validEvent,
			profileId: "",
		});
		expect(result.success).toBe(false);
	});
});
