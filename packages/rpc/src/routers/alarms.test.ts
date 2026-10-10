import { describe, expect, it } from "bun:test";

const { parseTriggerConditions, resolveTriggerUpdate } = await import(
	"./alarms"
);

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

describe("resolveTriggerUpdate", () => {
	const current = {
		triggerType: "uptime",
		triggerConditions: { monitorIds: ["sched_1"] },
	};

	it("returns undefined when neither field is part of the update", () => {
		expect(resolveTriggerUpdate({}, current)).toBeUndefined();
	});

	it("resolves triggerType from the stored row when only triggerConditions is sent (monitor-linking flow)", () => {
		const result = resolveTriggerUpdate(
			{ triggerConditions: { monitorIds: ["sched_1", "sched_2"] } },
			current
		);

		expect(result).toEqual({
			triggerConditions: { monitorIds: ["sched_1", "sched_2"] },
		});
	});

	it("resolves triggerConditions from the stored row when only triggerType is sent", () => {
		const result = resolveTriggerUpdate({ triggerType: "uptime" }, current);

		expect(result).toEqual({
			triggerType: "uptime",
			triggerConditions: { monitorIds: ["sched_1"] },
		});
	});

	it("re-validates the resolved pair, rejecting a switch to an unsupported trigger type", () => {
		let error: unknown;
		try {
			resolveTriggerUpdate({ triggerType: "traffic_spike" }, current);
		} catch (caught) {
			error = caught;
		}

		expect(error).toMatchObject({ code: "BAD_REQUEST" });
	});
});
