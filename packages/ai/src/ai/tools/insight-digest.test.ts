import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { createInsightDigestTools } from "./insight-digest";

const schema = createInsightDigestTools().manage_insight_digest.inputSchema;

describe("manage_insight_digest input", () => {
	it("exposes one organization schedule with no website or cron scope", () => {
		const json = z.toJSONSchema(schema, { io: "input" });

		expect(json).not.toHaveProperty("properties.websiteId");
		expect(json).not.toHaveProperty("properties.cron");
		expect(schema.safeParse({ action: "status" }).success).toBe(true);
		expect(
			schema.safeParse({ action: "preview", confirmed: false }).success
		).toBe(false);
	});

	it("accepts only Off, Daily, and Weekly schedules", () => {
		for (const frequency of ["off", "daily", "weekly"] as const) {
			expect(
				schema.safeParse({
					action: "reschedule",
					confirmed: false,
					frequency,
				}).success
			).toBe(true);
		}

		for (const frequency of ["hourly", "custom"]) {
			expect(
				schema.safeParse({
					action: "reschedule",
					confirmed: false,
					frequency,
				}).success
			).toBe(false);
		}
	});

	it("accepts Slack channels but rejects direct messages", () => {
		for (const channelId of ["C012345678", "G012345678"]) {
			expect(
				schema.safeParse({
					action: "route",
					channelId,
					confirmed: false,
				}).success
			).toBe(true);
		}

		expect(
			schema.safeParse({
				action: "route",
				channelId: "D012345678",
				confirmed: false,
			}).success
		).toBe(false);
	});
});
