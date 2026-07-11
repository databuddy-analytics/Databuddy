import { describe, expect, it } from "bun:test";
import {
	deriveMonitorFreshness,
	deriveMonitorStatus,
	deriveOverallStatus,
} from "./status-page-health";

describe("status page health", () => {
	const now = Date.parse("2026-07-11T12:00:00Z");

	it("marks missing, invalid, and overdue checks as uncertain", () => {
		expect(deriveMonitorFreshness(null, "minute", now)).toBe("unknown");
		expect(deriveMonitorFreshness("not-a-date", "minute", now)).toBe(
			"unknown"
		);
		expect(
			deriveMonitorFreshness("2026-07-11 11:50:00", "minute", now)
		).toBe("stale");
	});

	it("uses the monitor cadence when deciding freshness", () => {
		expect(
			deriveMonitorFreshness("2026-07-11 11:56:00", "minute", now)
		).toBe("fresh");
		expect(
			deriveMonitorFreshness("2026-07-11 09:30:00", "hour", now)
		).toBe("fresh");
		expect(
			deriveMonitorFreshness("2026-07-11 08:30:00", "hour", now)
		).toBe("stale");
	});

	it("never reports a stale successful check as up", () => {
		expect(
			deriveMonitorStatus({
				lastStatus: 1,
				lastHttpCode: 200,
				freshness: "stale",
			})
		).toBe("unknown");
	});

	it("does not report empty or uncertain monitor sets as operational", () => {
		expect(deriveOverallStatus([])).toBe("unknown");
		expect(
			deriveOverallStatus([
				{ currentStatus: "unknown", freshness: "unknown" },
			])
		).toBe("unknown");
		expect(
			deriveOverallStatus([
				{ currentStatus: "up", freshness: "fresh" },
				{ currentStatus: "unknown", freshness: "stale" },
			])
		).toBe("unknown");
	});

	it("keeps known incidents authoritative", () => {
		expect(
			deriveOverallStatus([], [
				{
					status: "investigating",
					severity: "critical",
					affectedMonitors: [],
				},
			])
		).toBe("outage");
	});

	it("only reports operational when every monitor is freshly up", () => {
		expect(
			deriveOverallStatus([
				{ currentStatus: "up", freshness: "fresh" },
				{ currentStatus: "up", freshness: "fresh" },
			])
		).toBe("operational");
	});
});
