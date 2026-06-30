import { describe, expect, test } from "vitest";
import {
	decideBlockedTrafficAlert,
	matchesTrackingAlertIgnoredOrigin,
	shouldEvaluateBlockedTrafficAlert,
	shouldIgnoreBlockedTrafficAlertEvent,
} from "./blocked-traffic-alerts";

describe("blocked traffic alert rules", () => {
	test("ignores non-actionable reasons and missing client IDs", () => {
		expect(
			shouldIgnoreBlockedTrafficAlertEvent({
				block_reason: "known_scraper",
				client_id: "site_1",
				origin: "https://example.com",
				referrer: "",
			})
		).toBe(true);
		expect(
			shouldIgnoreBlockedTrafficAlertEvent({
				block_reason: "origin_not_authorized",
				client_id: "",
				origin: "https://example.com",
				referrer: "",
			})
		).toBe(true);
	});

	test("ignores dev-only origins seen in ClickHouse", () => {
		for (const origin of [
			"http://localhost:3000",
			"http://127.0.0.1:5173",
			"http://10.0.0.120:3000",
			"null",
			"https://mock-preview.local-credentialless.webcontainer-api.io",
		]) {
			expect(
				shouldIgnoreBlockedTrafficAlertEvent({
					block_reason: "origin_not_authorized",
					client_id: "site_1",
					origin,
					referrer: "",
				})
			).toBe(true);
		}
	});

	test("uses referrer only when origin is absent", () => {
		expect(
			shouldIgnoreBlockedTrafficAlertEvent({
				block_reason: "origin_missing",
				client_id: "site_1",
				origin: "",
				referrer: "http://localhost:3000/page",
			})
		).toBe(true);
		expect(
			shouldIgnoreBlockedTrafficAlertEvent({
				block_reason: "origin_not_authorized",
				client_id: "site_1",
				origin: "https://example.com",
				referrer: "http://localhost:3000/page",
			})
		).toBe(false);
	});

	test("matches configured ignored origins without broad wildcards", () => {
		expect(
			matchesTrackingAlertIgnoredOrigin("https://preview.example.com", [
				"*.example.com",
			])
		).toBe(true);
		expect(
			matchesTrackingAlertIgnoredOrigin("https://example.com", ["example.com"])
		).toBe(true);
		expect(
			matchesTrackingAlertIgnoredOrigin("https://not-example.com", [
				"example.com",
			])
		).toBe(false);
	});

	test("alerts critical when tracking is zero but the site had baseline traffic", () => {
		expect(
			decideBlockedTrafficAlert({
				baselineEvents: 5,
				count: 3,
				previousBlocked: 0,
				recentEvents: 0,
			})
		).toEqual({ kind: "tracking_zero", severity: "critical" });
	});

	test("does not alert tracking-zero for new or already-working sites", () => {
		expect(
			decideBlockedTrafficAlert({
				baselineEvents: 4,
				count: 3,
				previousBlocked: 0,
				recentEvents: 0,
			})
		).toBeNull();
		expect(
			decideBlockedTrafficAlert({
				baselineEvents: 100,
				count: 3,
				previousBlocked: 0,
				recentEvents: 1,
			})
		).toBeNull();
	});

	test("alerts warning on a real blocked spike", () => {
		expect(
			decideBlockedTrafficAlert({
				baselineEvents: 0,
				count: 25,
				previousBlocked: 0,
				recentEvents: 10,
			})
		).toEqual({ kind: "blocked_spike", severity: "warning" });
	});

	test("requires blocked spike to beat noisy previous windows", () => {
		expect(
			decideBlockedTrafficAlert({
				baselineEvents: 0,
				count: 25,
				previousBlocked: 20,
				recentEvents: 10,
			})
		).toBeNull();
		expect(
			decideBlockedTrafficAlert({
				baselineEvents: 0,
				count: 60,
				previousBlocked: 20,
				recentEvents: 10,
			})
		).toEqual({ kind: "blocked_spike", severity: "warning" });
	});

	test("continues checking spikes after the first spike threshold", () => {
		expect(shouldEvaluateBlockedTrafficAlert(3)).toBe(true);
		expect(shouldEvaluateBlockedTrafficAlert(4)).toBe(false);
		expect(shouldEvaluateBlockedTrafficAlert(24)).toBe(false);
		expect(shouldEvaluateBlockedTrafficAlert(25)).toBe(true);
		expect(shouldEvaluateBlockedTrafficAlert(50)).toBe(true);
		expect(shouldEvaluateBlockedTrafficAlert(75)).toBe(true);
	});
});
