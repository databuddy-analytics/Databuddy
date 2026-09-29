import { describe, expect, test } from "bun:test";
import {
	ALARM_DESTINATION_REGISTRY,
	ALARM_DESTINATION_TYPES,
	isForbiddenWebhookHeaderName,
	maskTail,
	redactDestinationConfig,
	webhookHeadersSchema,
} from "./alarm-destinations";

describe("isForbiddenWebhookHeaderName", () => {
	test.each([
		["Content-Type"],
		["content-type"],
		["X-Original-URL"],
		["x-original-url"],
		["Authorization"],
		["Cookie"],
		["Host"],
	])("blocks %s", (name) => {
		expect(isForbiddenWebhookHeaderName(name)).toBe(true);
	});

	test.each([
		["X-Alarm"],
		["X-Custom-Header"],
		["Accept"],
	])("allows %s", (name) => {
		expect(isForbiddenWebhookHeaderName(name)).toBe(false);
	});
});

describe("webhookHeadersSchema", () => {
	test("rejects a header named Content-Type", () => {
		const result = webhookHeadersSchema.safeParse({
			"Content-Type": "application/json",
		});
		expect(result.success).toBe(false);
	});

	test("rejects a header named X-Original-URL", () => {
		const result = webhookHeadersSchema.safeParse({
			"X-Original-URL": "/admin",
		});
		expect(result.success).toBe(false);
	});

	test("rejects header names or values containing line breaks", () => {
		expect(
			webhookHeadersSchema.safeParse({ "X-Bad\r\nName": "value" }).success
		).toBe(false);
		expect(
			webhookHeadersSchema.safeParse({ "X-Header": "bad\r\nvalue" }).success
		).toBe(false);
	});

	test("accepts an allowed custom header", () => {
		const result = webhookHeadersSchema.safeParse({ "X-Alarm": "keep-me" });
		expect(result.success).toBe(true);
	});

	test("rejects more than 20 headers", () => {
		const headers = Object.fromEntries(
			Array.from({ length: 21 }, (_, i) => [`X-Header-${i}`, "value"])
		);
		expect(webhookHeadersSchema.safeParse(headers).success).toBe(false);
	});
});

describe("maskTail", () => {
	test("keeps the last 4 characters and masks the rest", () => {
		expect(maskTail("hooks.slack.com/services/T000/B000/secret")).toBe(
			`${"•".repeat("hooks.slack.com/services/T000/B000/secret".length - 4)}cret`
		);
	});

	test("masks everything when the value is short", () => {
		expect(maskTail("abc")).toBe("•••");
	});
});

describe("redactDestinationConfig", () => {
	test("masks string values inside a secret record field", () => {
		const redacted = redactDestinationConfig(
			{ headers: { "X-Alarm": "keep-me-1234" }, method: "POST" },
			["headers"]
		);
		expect(redacted.method).toBe("POST");
		expect((redacted.headers as Record<string, string>)["X-Alarm"]).toBe(
			maskTail("keep-me-1234")
		);
	});

	test("leaves config untouched when no secret fields are present", () => {
		const config = { method: "POST" };
		expect(redactDestinationConfig(config, ["headers"])).toEqual(config);
	});
});

describe("ALARM_DESTINATION_REGISTRY", () => {
	test("has one entry per registered type", () => {
		for (const type of ALARM_DESTINATION_TYPES) {
			expect(ALARM_DESTINATION_REGISTRY[type].type).toBe(type);
		}
	});

	test("slack identifier schema accepts only hooks.slack.com URLs", () => {
		const { identifierSchema } = ALARM_DESTINATION_REGISTRY.slack;
		expect(
			identifierSchema.safeParse(
				"https://hooks.slack.com/services/T000/B000/xxx"
			).success
		).toBe(true);
		expect(identifierSchema.safeParse("https://evil.example.com").success).toBe(
			false
		);
	});

	test("email identifier schema accepts only valid emails", () => {
		const { identifierSchema } = ALARM_DESTINATION_REGISTRY.email;
		expect(identifierSchema.safeParse("alerts@example.com").success).toBe(true);
		expect(identifierSchema.safeParse("not-an-email").success).toBe(false);
	});

	test("webhook identifier schema accepts only http(s) URLs", () => {
		const { identifierSchema } = ALARM_DESTINATION_REGISTRY.webhook;
		expect(
			identifierSchema.safeParse("https://api.example.com/webhooks/x").success
		).toBe(true);
		expect(identifierSchema.safeParse("ftp://example.com").success).toBe(false);
	});

	test("only webhook declares secret config fields", () => {
		expect(ALARM_DESTINATION_REGISTRY.slack.secretFields).toEqual([]);
		expect(ALARM_DESTINATION_REGISTRY.email.secretFields).toEqual([]);
		expect(ALARM_DESTINATION_REGISTRY.webhook.secretFields).toEqual([
			"headers",
		]);
	});
});
