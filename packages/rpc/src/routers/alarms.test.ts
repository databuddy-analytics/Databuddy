import { describe, expect, it } from "bun:test";

const { parseTriggerConditions } = await import("./alarms");

describe("parseTriggerConditions", () => {
	it("accepts a uptime alarm with monitorIds", () => {
		expect(
			parseTriggerConditions("uptime", { monitorIds: ["sched_1", "sched_2"] })
		).toEqual({ monitorIds: ["sched_1", "sched_2"] });
	});

	it("defaults monitorIds to an empty array when omitted", () => {
		expect(parseTriggerConditions("uptime", {})).toEqual({ monitorIds: [] });
	});

	it("rejects a uptime alarm with a malformed monitorIds field", () => {
		let error: unknown;
		try {
			parseTriggerConditions("uptime", { monitorIds: "sched_1" });
		} catch (caught) {
			error = caught;
		}

		expect(error).toMatchObject({ code: "BAD_REQUEST" });
	});

	it("rejects traffic_spike alarms because no evaluator exists yet", () => {
		let error: unknown;
		try {
			parseTriggerConditions("traffic_spike", {
				metric: "pageviews",
				direction: "down",
				window: "15m",
				sensitivity: "medium",
				minBaseline: 100,
			});
		} catch (caught) {
			error = caught;
		}

		expect(error).toMatchObject({
			code: "BAD_REQUEST",
			message: expect.stringContaining("traffic_spike"),
		});
	});

	it("rejects error_rate alarms because no evaluator exists yet", () => {
		let error: unknown;
		try {
			parseTriggerConditions("error_rate", {
				window: "1h",
				thresholdPercent: 5,
				minSessions: 50,
			});
		} catch (caught) {
			error = caught;
		}

		expect(error).toMatchObject({
			code: "BAD_REQUEST",
			message: expect.stringContaining("error_rate"),
		});
	});

	it("rejects an unknown trigger type", () => {
		let error: unknown;
		try {
			parseTriggerConditions("something_else", {});
		} catch (caught) {
			error = caught;
		}

		expect(error).toMatchObject({ code: "BAD_REQUEST" });
	});
});
