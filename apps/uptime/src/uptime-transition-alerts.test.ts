import { describe, expect, test } from "bun:test";
import { MonitorStatus } from "./types";
import {
	buildSslExpiryNotificationPayload,
	buildTransitionNotificationPayload,
	buildUptimeDeliveryPlan,
	resolveSslExpiryAlert,
	resolveTransitionKind,
	resolveUptimeEmailPreference,
	shouldReleaseTransitionClaim,
	sslExpiryAlertKey,
} from "./uptime-transition-alerts";
import type { UptimeData } from "./types";

const { UP, DOWN } = MonitorStatus;

const baseUptimeData: UptimeData = {
	attempt: 1,
	check_type: "http",
	event_id: "uptime-event-1",
	env: "production",
	error: "",
	failure_streak: 0,
	http_code: 200,
	probe_ip: "192.0.2.1",
	probe_region: "test-region",
	redirect_count: 0,
	response_bytes: 100,
	retries: 0,
	site_id: "monitor-1",
	ssl_expiry: null,
	ssl_valid: 1,
	status: UP,
	timestamp: Date.UTC(2026, 6, 11, 12, 30),
	total_ms: 245,
	ttfb_ms: 120,
	url: "https://example.com",
	user_agent: "Databuddy test",
};

describe("resolveTransitionKind — happy path transitions", () => {
	test("fresh monitor going UP is silent", () => {
		expect(resolveTransitionKind(undefined, UP)).toBeNull();
	});

	test("fresh monitor going DOWN fires a down alert", () => {
		expect(resolveTransitionKind(undefined, DOWN)).toBe("down");
	});

	test("UP → DOWN fires a down alert", () => {
		expect(resolveTransitionKind(UP, DOWN)).toBe("down");
	});

	test("DOWN → UP fires a recovered alert", () => {
		expect(resolveTransitionKind(DOWN, UP)).toBe("recovered");
	});
});

describe("resolveTransitionKind — dedupe invariants", () => {
	test("DOWN → DOWN is silent (no duplicate down alerts)", () => {
		expect(resolveTransitionKind(DOWN, DOWN)).toBeNull();
	});

	test("UP → UP is silent", () => {
		expect(resolveTransitionKind(UP, UP)).toBeNull();
	});
});

describe("resolveTransitionKind — defensive inputs", () => {
	test("unknown numeric current status is silent", () => {
		expect(resolveTransitionKind(DOWN, 99)).toBeNull();
		expect(resolveTransitionKind(UP, -1)).toBeNull();
	});
});

describe("shouldReleaseTransitionClaim", () => {
	test("releases the dedupe claim when every configured alarm delivery fails", () => {
		expect(shouldReleaseTransitionClaim(2, 0)).toBe(true);
	});

	test("keeps the claim after any alarm delivers or when nothing was configured", () => {
		expect(shouldReleaseTransitionClaim(2, 1)).toBe(false);
		expect(shouldReleaseTransitionClaim(0, 0)).toBe(false);
	});

	test("releases when email delivery is deferred and no non-email alarm fires", () => {
		expect(shouldReleaseTransitionClaim(0, 0, true)).toBe(true);
		expect(shouldReleaseTransitionClaim(2, 0, true)).toBe(true);
	});

	test("keeps the claim after non-email delivery to avoid duplicate retries", () => {
		expect(shouldReleaseTransitionClaim(1, 1, true)).toBe(false);
	});
});

describe("resolveUptimeEmailPreference", () => {
	test("keeps a settings lookup failure distinct so the claim can be released", () => {
		expect(resolveUptimeEmailPreference(null, "down")).toBeNull();
		expect(resolveUptimeEmailPreference(null, "recovered")).toBeNull();
	});

	test("returns the configured preference when settings load successfully", () => {
		const settings = {
			uptime: { downEmails: false, recoveryEmails: true },
		};

		expect(resolveUptimeEmailPreference(settings, "down")).toBe(false);
		expect(resolveUptimeEmailPreference(settings, "recovered")).toBe(true);
	});

	test("SSL expiry emails follow the down alert preference", () => {
		const settings = {
			uptime: { downEmails: false, recoveryEmails: true },
		};

		expect(resolveUptimeEmailPreference(settings, "ssl_expiry")).toBe(false);
	});
});

describe("buildUptimeDeliveryPlan", () => {
	test("defers only email destinations when preference lookup fails", () => {
		const plan = buildUptimeDeliveryPlan(
			[
				{
					id: "alarm-1",
					destinations: [
						{ type: "email", identifier: "ops@example.com", config: {} },
						{
							type: "slack",
							identifier: "https://hooks.slack.com/services/test",
							config: {},
						},
						{
							type: "webhook",
							identifier: "https://example.com/alerts",
							config: {},
						},
					],
				},
			],
			null
		);

		expect(plan.emailDeliveryDeferred).toBe(true);
		expect(plan.sendable).toHaveLength(1);
		expect(plan.sendable[0]?.destinations.map((dest) => dest.type)).toEqual([
			"slack",
			"webhook",
		]);
	});

	test("leaves an email-only alarm retryable when settings are unavailable", () => {
		const plan = buildUptimeDeliveryPlan(
			[
				{
					id: "alarm-1",
					destinations: [
						{ type: "email", identifier: "ops@example.com", config: {} },
					],
				},
			],
			null
		);

		expect(plan.sendable).toEqual([]);
		expect(
			shouldReleaseTransitionClaim(
				plan.sendable.length,
				0,
				plan.emailDeliveryDeferred
			)
		).toBe(true);
	});
});

describe("buildTransitionNotificationPayload", () => {
	test("describes a failed check without declaring the whole site down", () => {
		const payload = buildTransitionNotificationPayload({
			dashboardUrl: "https://app.databuddy.cc/monitors/monitor-1",
			data: {
				...baseUptimeData,
				error: "upstream returned an error",
				http_code: 503,
				status: DOWN,
			},
			kind: "down",
			monitorId: "monitor-1",
			siteLabel: "Example",
		});

		expect(payload.title).toBe("Health check failed: Example");
		expect(payload.message).toContain("A health check failed for Example");
		expect(payload.message).toContain("2026-07-11T12:30:00.000Z");
		expect(payload.message).toContain("HTTP 503");
		expect(payload.message).toContain("Reason: upstream returned an error");
		expect(payload.metadata).not.toHaveProperty("checkedAt");
		expect(payload.message).not.toContain("is down");
		expect(payload.title).not.toContain("[DOWN]");
	});

	test("recovery copy only claims that the latest check passed", () => {
		const payload = buildTransitionNotificationPayload({
			dashboardUrl: "https://app.databuddy.cc/monitors/monitor-1",
			data: baseUptimeData,
			kind: "recovered",
			monitorId: "monitor-1",
			siteLabel: "Example",
		});

		expect(payload.title).toBe("Health check passed: Example");
		expect(payload.message).toContain(
			"A health check passed for Example after a previous failed check"
		);
		expect(payload.message).toContain("Response time 245 ms");
		expect(payload.message).not.toContain("outage");
		expect(payload.message).not.toContain("operational again");
	});
});

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 1);

describe("resolveSslExpiryAlert", () => {
	test("alerts at exactly 14 days and stays silent one millisecond beyond", () => {
		expect(
			resolveSslExpiryAlert(
				{ ...baseUptimeData, ssl_expiry: NOW + 14 * DAY_MS },
				NOW
			)
		).toEqual({
			daysRemaining: 14,
			expiresAt: NOW + 14 * DAY_MS,
			expired: false,
		});
		expect(
			resolveSslExpiryAlert(
				{ ...baseUptimeData, ssl_expiry: NOW + 14 * DAY_MS + 1 },
				NOW
			)
		).toBeNull();
	});

	test("rounds a partial day up so a live certificate never reports 0 days", () => {
		expect(
			resolveSslExpiryAlert({ ...baseUptimeData, ssl_expiry: NOW + 1 }, NOW)
		).toMatchObject({ daysRemaining: 1, expired: false });
	});

	test("flags an already expired certificate", () => {
		expect(
			resolveSslExpiryAlert(
				{ ...baseUptimeData, ssl_expiry: NOW - 2 * DAY_MS },
				NOW
			)
		).toMatchObject({ daysRemaining: 0, expired: true });
		expect(
			resolveSslExpiryAlert({ ...baseUptimeData, ssl_expiry: NOW }, NOW)
		).toMatchObject({ expired: true });
	});

	test("ignores unknown expiry and non-https checks", () => {
		expect(
			resolveSslExpiryAlert({ ...baseUptimeData, ssl_expiry: null }, NOW)
		).toBeNull();
		expect(
			resolveSslExpiryAlert({ ...baseUptimeData, ssl_expiry: 0 }, NOW)
		).toBeNull();
		expect(
			resolveSslExpiryAlert(
				{
					...baseUptimeData,
					ssl_expiry: NOW + DAY_MS,
					url: "http://example.com",
				},
				NOW
			)
		).toBeNull();
	});
});

describe("sslExpiryAlertKey", () => {
	test("dedupes per certificate so a renewed certificate can alert again", () => {
		const current = sslExpiryAlertKey("schedule-1", NOW + DAY_MS);

		expect(sslExpiryAlertKey("schedule-1", NOW + DAY_MS)).toBe(current);
		expect(sslExpiryAlertKey("schedule-1", NOW + 90 * DAY_MS)).not.toBe(
			current
		);
		expect(sslExpiryAlertKey("schedule-2", NOW + DAY_MS)).not.toBe(current);
	});
});

describe("buildSslExpiryNotificationPayload", () => {
	const build = (ssl_expiry: number) => {
		const alert = resolveSslExpiryAlert({ ...baseUptimeData, ssl_expiry }, NOW);
		if (alert === null) {
			throw new Error("expected an SSL expiry alert");
		}
		return buildSslExpiryNotificationPayload({
			alert,
			dashboardUrl: "https://app.databuddy.cc/monitors/monitor-1",
			monitorId: "monitor-1",
			siteLabel: "Example",
			url: "https://example.com",
		});
	};

	test("keeps an early warning at normal priority", () => {
		const payload = build(NOW + 10 * DAY_MS);

		expect(payload.title).toBe("SSL certificate expires in 10 days: Example");
		expect(payload.priority).toBe("normal");
	});

	test("escalates within 3 days and after expiry", () => {
		const soon = build(NOW + 3 * DAY_MS);
		const expired = build(NOW - DAY_MS);

		expect(soon.priority).toBe("high");
		expect(build(NOW + DAY_MS).title).toBe(
			"SSL certificate expires in 1 day: Example"
		);
		expect(expired.title).toBe("SSL certificate expired: Example");
		expect(expired.priority).toBe("high");
	});
});
