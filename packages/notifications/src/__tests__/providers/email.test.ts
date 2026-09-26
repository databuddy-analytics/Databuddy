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
				template: "anomaly",
				zScore: 9.42,
			},
		});

		expect(result).toEqual({ success: true, channel: "email" });
		expect(delivered?.text).toContain("Dashboard Url:");
		expect(delivered?.text).not.toContain("internal-monitor-id");
		expect(delivered?.text).not.toContain("Template:");
		expect(delivered?.text).not.toContain("Z score:");
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

	test("hides repeated SSL expiry fields but keeps its unique monitored URL", async () => {
		let delivered: EmailPayload | undefined;
		const provider = new EmailProvider({
			defaultTo: "recipient@example.com",
			sendEmailAction: async (payload) => {
				delivered = payload;
			},
		});

		await provider.send({
			title: "SSL certificate expires in 5 days: Acme",
			message:
				"The SSL certificate for Acme expires at 2026-10-01T00:00:00.000Z. View details: https://app.databuddy.cc/monitors/1",
			metadata: {
				dashboardUrl: "https://app.databuddy.cc/monitors/1",
				daysRemaining: 5,
				expiresAt: "2026-10-01T00:00:00.000Z",
				monitorName: "Acme",
				template: "uptime-ssl-expiry",
				url: "https://acme.example/health",
			},
		});

		expect(delivered?.text).toContain("Url: https://acme.example/health");
		expect(delivered?.text).not.toContain("Days Remaining:");
		expect(delivered?.text).not.toContain("Expires At:");
		expect(delivered?.text).not.toContain("Monitor Name:");
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
