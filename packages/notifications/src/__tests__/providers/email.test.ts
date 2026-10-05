import { describe, expect, mock, test } from "bun:test";
import type { EmailPayload } from "../../types";
import { EmailProvider } from "../../providers/email";

describe("EmailProvider", () => {
	test("renders metadata labels and hides internal fields from recipients", async () => {
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
				httpCode: 503,
				sslExpiresAt: "2026-11-01T00:00:00Z",
				apiEndpoint: "https://acme.example/health",
				monitorId: "internal-monitor-id",
				template: "anomaly",
				zScore: 9.42,
			},
		});

		expect(result).toEqual({ success: true, channel: "email" });
		expect(delivered?.text).toContain("Dashboard URL:");
		expect(delivered?.text).toContain("HTTP code: 503");
		expect(delivered?.text).toContain("SSL expires at: 2026-11-01T00:00:00Z");
		expect(delivered?.text).toContain(
			"API endpoint: https://acme.example/health"
		);
		expect(delivered?.html).toContain(">HTTP code</td>");
		expect(delivered?.html).toContain(">SSL expires at</td>");
		expect(delivered?.html).toContain(">API endpoint</td>");
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

		expect(delivered?.text).toContain("URL: https://acme.example/health");
		expect(delivered?.text).not.toContain("Dashboard URL:");
		expect(delivered?.text).not.toContain("HTTP code:");
		expect(delivered?.text).not.toContain("Monitor name:");
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

		expect(delivered?.text).toContain("URL: https://acme.example/health");
		expect(delivered?.text).not.toContain("Days remaining:");
		expect(delivered?.text).not.toContain("Expires at:");
		expect(delivered?.text).not.toContain("Monitor name:");
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
