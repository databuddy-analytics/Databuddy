import { describe, expect, mock, test } from "bun:test";
import type { EmailPayload } from "../../types";
import { EmailProvider } from "../../providers/email";
import { buildUptimeNotificationPayload } from "../../templates/uptime";

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

	test("does not duplicate uptime message fields or expose raw timestamps", async () => {
		let delivered: EmailPayload | undefined;
		const provider = new EmailProvider({
			defaultTo: "recipient@example.com",
			sendEmailAction: async (payload) => {
				delivered = payload;
			},
		});
		const checkedAt = 1_700_000_000_000;
		const payload = buildUptimeNotificationPayload({
			checkedAt,
			error: "Connection refused",
			httpCode: 503,
			kind: "down",
			probeRegion: "eu-west-1",
			siteLabel: "Acme Corp",
			totalMs: 250,
			ttfbMs: 100,
			url: "https://acme.example",
		});

		await provider.send(payload);

		expect(delivered?.text).toBe(payload.message);
		expect(delivered?.html).not.toContain(String(checkedAt));
		expect(delivered?.text).not.toContain(String(checkedAt));
		expect(payload.metadata).toMatchObject({
			checkedAt,
			httpCode: 503,
			template: "uptime",
		});
	});

	test("hides repeated transition fields but keeps its unique monitored URL", async () => {
		let delivered: EmailPayload | undefined;
		const provider = new EmailProvider({
			defaultTo: "recipient@example.com",
			sendEmailAction: async (payload) => {
				delivered = payload;
			},
		});

		await provider.send({
			title: "Health check failed: Acme",
			message:
				"A health check failed for Acme. HTTP 503. View details: https://app.databuddy.cc/monitors/1",
			metadata: {
				dashboardUrl: "https://app.databuddy.cc/monitors/1",
				httpCode: 503,
				kind: "down",
				monitorId: "monitor-1",
				monitorName: "Acme",
				template: "uptime-transition",
				url: "https://acme.example/health",
			},
		});

		expect(delivered?.text).toContain("Url: https://acme.example/health");
		expect(delivered?.text).not.toContain("Dashboard Url:");
		expect(delivered?.text).not.toContain("Http Code:");
		expect(delivered?.text).not.toContain("Monitor Name:");
		expect(delivered?.text).not.toContain("monitor-1");
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
