import { describe, expect, it } from "bun:test";
import { ORPCError } from "@orpc/server";
import { parseTriggerConditions, resolveTriggerUpdate } from "./alarms";

function thrownCode(run: () => unknown) {
	try {
		run();
	} catch (error) {
		return error instanceof ORPCError ? error.code : undefined;
	}
}

describe("parseTriggerConditions", () => {
	it("keeps the linked monitor ids of an uptime alert", () => {
		expect(
			parseTriggerConditions("uptime", { monitorIds: ["sched_1", "sched_2"] })
		).toEqual({ monitorIds: ["sched_1", "sched_2"] });
	});

	it("defaults monitorIds to an empty list so a new alert can link monitors later", () => {
		expect(parseTriggerConditions("uptime", {})).toEqual({ monitorIds: [] });
	});

	it("rejects a malformed monitorIds field", () => {
		expect(
			thrownCode(() =>
				parseTriggerConditions("uptime", { monitorIds: "sched_1" })
			)
		).toBe("BAD_REQUEST");
	});

	it("rejects trigger types that nothing evaluates", () => {
		expect(thrownCode(() => parseTriggerConditions("traffic_spike", {}))).toBe(
			"BAD_REQUEST"
		);
	});
});

describe("resolveTriggerUpdate", () => {
	const current = {
		triggerType: "uptime",
		triggerConditions: { monitorIds: ["sched_1"] },
	};

	it("returns undefined when the update does not touch the trigger", () => {
		expect(resolveTriggerUpdate({}, current)).toBeUndefined();
	});

	it("keeps the stored trigger type when only conditions change", () => {
		expect(
			resolveTriggerUpdate(
				{ triggerConditions: { monitorIds: ["sched_1", "sched_2"] } },
				current
			)
		).toEqual({ triggerConditions: { monitorIds: ["sched_1", "sched_2"] } });
	});

	it("re-validates the stored conditions when only the trigger type is sent", () => {
		expect(resolveTriggerUpdate({ triggerType: "uptime" }, current)).toEqual({
			triggerType: "uptime",
			triggerConditions: { monitorIds: ["sched_1"] },
		});
	});

	it("rejects switching an existing alert to an unevaluated trigger type", () => {
		expect(
			thrownCode(() =>
				resolveTriggerUpdate({ triggerType: "traffic_spike" }, current)
			)
		).toBe("BAD_REQUEST");
	});
});
