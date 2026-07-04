import { describe, expect, it } from "bun:test";
import {
	buildOpenAiRegistrationCompletedEvent,
	hashOpenAiUserValue,
} from "./openai-ads-conversions";

describe("OpenAI Ads conversion helpers", () => {
	it("normalizes and hashes user identifiers", () => {
		expect(hashOpenAiUserValue(" Test@Example.com ")).toBe(
			"973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b"
		);
	});

	it("builds a registration_completed customer action without raw email", () => {
		const event = buildOpenAiRegistrationCompletedEvent({
			email: "founder@example.com",
			eventId: "conversion-1",
			ipAddress: "203.0.113.10",
			oppref: "openai-reference",
			sourceUrl: "https://app.databuddy.cc/register?utm_source=openai_ads",
			timestampMs: 1_788_000_000_000,
			userAgent: "Mozilla/5.0",
		});

		expect(event).toMatchObject({
			action_source: "web",
			data: { type: "customer_action" },
			id: "conversion-1",
			oppref: "openai-reference",
			source_url: "https://app.databuddy.cc/register?utm_source=openai_ads",
			timestamp_ms: 1_788_000_000_000,
			type: "registration_completed",
			user: {
				ip_address: "203.0.113.10",
				user_agent: "Mozilla/5.0",
			},
		});
		expect(JSON.stringify(event)).not.toContain("founder@example.com");
		expect(event.user?.email_sha256).toHaveLength(64);
	});
});
