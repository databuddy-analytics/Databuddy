import { describe, expect, mock, test } from "bun:test";
import type { EmailPayload } from "../../types";
import { EmailProvider } from "../../providers/email";

describe("EmailProvider", () => {
	test("builds plain text and hides internal metadata from recipients", async () => {
		let delivered: EmailPayload | undefined;
		const sendEmailAction = mock(async (payload: EmailPayload) => {
			delivered = payload;
		});
		const provider = new EmailProvider({
			defaultTo: "recipient@example.com",
			sendEmailAction,
		});

		const result = await provider.send({
			title: "Site alert",
			message: "The site is unavailable.",
			metadata: {
				dashboardUrl: "https://app.databuddy.cc/monitors/1",
				monitorId: "internal-monitor-id",
				template: "uptime",
				zScore: 9.42,
			},
		});

		expect(result).toEqual({ success: true, channel: "email" });
		expect(delivered?.text).toContain("Dashboard Url:");
		expect(delivered?.text).not.toContain("internal-monitor-id");
		expect(delivered?.text).not.toContain("Template:");
		expect(delivered?.text).not.toContain("Z score:");
	});

	test("returns a failed channel result when delivery throws", async () => {
		const provider = new EmailProvider({
			defaultTo: "recipient@example.com",
			sendEmailAction: async () => {
				throw new Error("Email delivery failed: provider unavailable");
			},
		});

		const result = await provider.send({
			title: "Site alert",
			message: "The site is unavailable.",
		});

		expect(result).toEqual({
			success: false,
			channel: "email",
			error: "Email delivery failed: provider unavailable",
		});
	});
});
