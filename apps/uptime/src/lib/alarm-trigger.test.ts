import { describe, expect, it } from "bun:test";
import { MonitorStatus } from "../types";
import { getConsecutiveFailureThreshold } from "./alarm-trigger";

describe("alarm-trigger", () => {
	describe("getConsecutiveFailureThreshold", () => {
		it("should default to 3 consecutive failures when no trigger conditions", () => {
			expect(getConsecutiveFailureThreshold(null)).toBe(3);
			expect(getConsecutiveFailureThreshold(undefined)).toBe(3);
		});

		it("should use custom threshold from trigger conditions", () => {
			expect(getConsecutiveFailureThreshold({ consecutiveFailures: 5 })).toBe(5);
			expect(getConsecutiveFailureThreshold({ consecutiveFailures: 1 })).toBe(1);
			expect(getConsecutiveFailureThreshold({ consecutiveFailures: 10 })).toBe(10);
		});

		it("should default to 3 for invalid threshold values", () => {
			expect(getConsecutiveFailureThreshold({ consecutiveFailures: -1 })).toBe(3);
			expect(getConsecutiveFailureThreshold({ consecutiveFailures: 0 })).toBe(3);
			expect(getConsecutiveFailureThreshold({ consecutiveFailures: "invalid" })).toBe(3);
			expect(getConsecutiveFailureThreshold({})).toBe(3);
		});

		it("should default to 3 for non-object trigger conditions", () => {
			expect(getConsecutiveFailureThreshold("string")).toBe(3);
			expect(getConsecutiveFailureThreshold(42)).toBe(3);
			expect(getConsecutiveFailureThreshold(true)).toBe(3);
		});

		it("should ignore extra fields in trigger conditions", () => {
			expect(
				getConsecutiveFailureThreshold({
					consecutiveFailures: 7,
					otherField: "ignored",
				})
			).toBe(7);
		});
	});

	describe("MonitorStatus values", () => {
		it("should have correct status enum values", () => {
			expect(MonitorStatus.UP).toBe(1);
			expect(MonitorStatus.DOWN).toBe(0);
		});
	});

	/**
	 * Note: checkAndTriggerAlarms requires database and notification service
	 * dependencies. Full integration tests for alarm matching, notification
	 * deduplication, and the website/org-level query logic should be added
	 * when a test database fixture is available.
	 *
	 * Key behaviors to verify in integration tests:
	 * - Alarms with websiteId match only their specific monitor + org-level alarms
	 * - Org-level alarms (websiteId IS NULL) fire for all monitors in the org
	 * - Monitors without websiteId only match org-level alarms
	 * - Consecutive failure threshold triggers notification at exactly the threshold
	 * - Recovery notifications fire once when site comes back up
	 * - Duplicate down notifications are suppressed after threshold is reached
	 * - Unsupported notification channels are captured via captureError
	 */
});
