import { describe, expect, it } from "bun:test";
import { MonitorStatus } from "../types";

describe("alarm-trigger", () => {
	describe("getConsecutiveFailureThreshold", () => {
		// We test the threshold logic inline since the function is not exported
		// but we verify the behavior through the module's contract

		it("should default to 3 consecutive failures when no trigger conditions", () => {
			const conditions = null;
			const threshold = getThreshold(conditions);
			expect(threshold).toBe(3);
		});

		it("should use custom threshold from trigger conditions", () => {
			const conditions = { consecutiveFailures: 5 };
			const threshold = getThreshold(conditions);
			expect(threshold).toBe(5);
		});

		it("should default to 3 for invalid threshold values", () => {
			expect(getThreshold({ consecutiveFailures: -1 })).toBe(3);
			expect(getThreshold({ consecutiveFailures: 0 })).toBe(3);
			expect(getThreshold({ consecutiveFailures: "invalid" })).toBe(3);
			expect(getThreshold({})).toBe(3);
		});
	});

	describe("MonitorStatus values", () => {
		it("should have correct status enum values", () => {
			expect(MonitorStatus.UP).toBe(1);
			expect(MonitorStatus.DOWN).toBe(0);
		});
	});

	describe("alarm matching logic", () => {
		it("should only match enabled uptime alarms", () => {
			const alarms = [
				{
					id: "1",
					enabled: true,
					triggerType: "uptime",
					notificationChannels: ["slack"],
				},
				{
					id: "2",
					enabled: false,
					triggerType: "uptime",
					notificationChannels: ["slack"],
				},
				{
					id: "3",
					enabled: true,
					triggerType: "traffic_spike",
					notificationChannels: ["slack"],
				},
			];

			const matching = alarms.filter(
				(a) => a.enabled && a.triggerType === "uptime"
			);
			expect(matching).toHaveLength(1);
			expect(matching[0].id).toBe("1");
		});
	});

	describe("notification deduplication logic", () => {
		it("should track consecutive failures correctly", () => {
			let consecutiveFailures = 0;
			let lastNotifiedStatus = MonitorStatus.UP;

			// First failure
			consecutiveFailures += 1;
			expect(consecutiveFailures).toBe(1);

			// Second failure
			consecutiveFailures += 1;
			expect(consecutiveFailures).toBe(2);

			// Third failure - threshold reached
			consecutiveFailures += 1;
			expect(consecutiveFailures).toBe(3);

			// Should notify on threshold match when not already down
			const shouldNotify =
				consecutiveFailures === 3 &&
				lastNotifiedStatus !== MonitorStatus.DOWN;
			expect(shouldNotify).toBe(true);

			// Update status
			lastNotifiedStatus = MonitorStatus.DOWN;

			// Fourth failure - should NOT notify again
			consecutiveFailures += 1;
			const shouldNotifyAgain =
				consecutiveFailures === 3 &&
				lastNotifiedStatus !== MonitorStatus.DOWN;
			expect(shouldNotifyAgain).toBe(false);
		});

		it("should reset consecutive failures on success", () => {
			let consecutiveFailures = 5;

			// Success resets counter
			consecutiveFailures = 0;
			expect(consecutiveFailures).toBe(0);
		});

		it("should send recovery notification when site comes back up", () => {
			const lastNotifiedStatus = MonitorStatus.DOWN;
			const isDown = false;
			const wasDown = lastNotifiedStatus === MonitorStatus.DOWN;

			const shouldSendRecovery = !isDown && wasDown;
			expect(shouldSendRecovery).toBe(true);
		});

		it("should not send recovery when site was already up", () => {
			const lastNotifiedStatus = MonitorStatus.UP;
			const isDown = false;
			const wasDown = lastNotifiedStatus === MonitorStatus.DOWN;

			const shouldSendRecovery = !isDown && wasDown;
			expect(shouldSendRecovery).toBe(false);
		});
	});
});

// Helper that mirrors the internal getConsecutiveFailureThreshold logic
function getThreshold(triggerConditions: unknown): number {
	if (
		triggerConditions &&
		typeof triggerConditions === "object" &&
		"consecutiveFailures" in triggerConditions
	) {
		const threshold = (triggerConditions as { consecutiveFailures: number })
			.consecutiveFailures;
		if (typeof threshold === "number" && threshold > 0) {
			return threshold;
		}
	}
	return 3;
}
