import { describe, expect, test } from "bun:test";
import { MonitorStatus } from "./types";
import {
	buildTransitionNotificationPayload,
	countFiredAlarms,
	resolveTransitionKind,
	resolveUptimeEmailPreference,
	shouldReleaseTransitionClaim,
} from "./uptime-transition-alerts";
import type { UptimeData } from "./types";

const { UP, DOWN, PENDING, MAINTENANCE } = MonitorStatus;

const baseUptimeData: UptimeData = {
	attempt: 1,
	check_type: "http",
	content_hash: "",
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
	ssl_expiry: 0,
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

	test("repeated DOWN checks stay silent across many calls", () => {
		for (let i = 0; i < 50; i += 1) {
			expect(resolveTransitionKind(DOWN, DOWN)).toBeNull();
		}
	});
});

describe("resolveTransitionKind — intermediate states", () => {
	test("PENDING → DOWN fires a down alert (first real signal is failure)", () => {
		expect(resolveTransitionKind(PENDING, DOWN)).toBe("down");
	});

	test("PENDING → UP is silent (no prior DOWN to recover from)", () => {
		expect(resolveTransitionKind(PENDING, UP)).toBeNull();
	});

	test("MAINTENANCE → UP is silent (not a recovery event)", () => {
		expect(resolveTransitionKind(MAINTENANCE, UP)).toBeNull();
	});

	test("MAINTENANCE → DOWN fires a down alert", () => {
		expect(resolveTransitionKind(MAINTENANCE, DOWN)).toBe("down");
	});

	test("any → PENDING is silent (not a user-facing transition)", () => {
		expect(resolveTransitionKind(UP, PENDING)).toBeNull();
		expect(resolveTransitionKind(DOWN, PENDING)).toBeNull();
		expect(resolveTransitionKind(undefined, PENDING)).toBeNull();
	});

	test("any → MAINTENANCE is silent", () => {
		expect(resolveTransitionKind(UP, MAINTENANCE)).toBeNull();
		expect(resolveTransitionKind(DOWN, MAINTENANCE)).toBeNull();
		expect(resolveTransitionKind(undefined, MAINTENANCE)).toBeNull();
	});
});

describe("resolveTransitionKind — defensive inputs", () => {
	test("unknown numeric current status is silent", () => {
		expect(resolveTransitionKind(DOWN, 99)).toBeNull();
		expect(resolveTransitionKind(UP, -1)).toBeNull();
	});

	test("NaN current never fires", () => {
		expect(resolveTransitionKind(DOWN, Number.NaN)).toBeNull();
		expect(resolveTransitionKind(UP, Number.NaN)).toBeNull();
	});

	test("NaN previous with DOWN current still alerts (prev !== DOWN)", () => {
		expect(resolveTransitionKind(Number.NaN, DOWN)).toBe("down");
	});
});

describe("resolveTransitionKind — state machine matrix", () => {
	const states = [undefined, UP, DOWN, PENDING, MAINTENANCE] as const;
	const expected: Record<string, "down" | "recovered" | null> = {
		"undefined→0": "down",
		"undefined→1": null,
		"undefined→2": null,
		"undefined→3": null,
		"1→0": "down",
		"1→1": null,
		"1→2": null,
		"1→3": null,
		"0→0": null,
		"0→1": "recovered",
		"0→2": null,
		"0→3": null,
		"2→0": "down",
		"2→1": null,
		"2→2": null,
		"2→3": null,
		"3→0": "down",
		"3→1": null,
		"3→2": null,
		"3→3": null,
	};

	for (const prev of states) {
		for (const curr of states) {
			if (curr === undefined) {
				continue;
			}
			const key = `${prev === undefined ? "undefined" : prev}→${curr}`;
			test(`${key} → ${expected[key]}`, () => {
				expect(resolveTransitionKind(prev, curr)).toBe(expected[key]);
			});
		}
	}
});

describe("countFiredAlarms", () => {
	test("counts alarms with at least one successful destination", () => {
		expect(countFiredAlarms([2, 0, 1])).toBe(2);
	});

	test("does not count alarms where every destination failed or was filtered", () => {
		expect(countFiredAlarms([0, 0, 0])).toBe(0);
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
