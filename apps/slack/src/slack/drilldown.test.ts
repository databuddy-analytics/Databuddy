import { describe, expect, it } from "bun:test";
import {
	isExternalSlackConnectClick,
	parseDrilldownRun,
} from "@/slack/drilldown";

function blockActionsBody(overrides: Record<string, unknown> = {}) {
	return {
		user: { id: "U1" },
		team: { id: "T1" },
		channel: { id: "C1" },
		container: { channel_id: "C1", message_ts: "111.1" },
		message: { ts: "111.1", thread_ts: "100.0" },
		...overrides,
	};
}

describe("parseDrilldownRun", () => {
	it("builds a thread follow-up run from the button prompt", () => {
		const run = parseDrilldownRun(blockActionsBody(), {
			action_id: "agent_drilldown",
			value: "break down by referrer",
		});
		expect(run).toMatchObject({
			channelId: "C1",
			teamId: "T1",
			text: "break down by referrer",
			threadTs: "100.0",
			trigger: "thread_follow_up",
			userId: "U1",
		});
	});

	it("falls back to message ts when there is no thread_ts", () => {
		const run = parseDrilldownRun(
			blockActionsBody({ message: { ts: "111.1" } }),
			{ value: "why" }
		);
		expect(run?.threadTs).toBe("111.1");
	});

	it("returns null without a prompt value", () => {
		expect(parseDrilldownRun(blockActionsBody(), { value: "" })).toBeNull();
		expect(parseDrilldownRun(blockActionsBody(), {})).toBeNull();
	});

	it("returns null when channel or user is missing", () => {
		expect(
			parseDrilldownRun(
				{ user: { id: "U1" }, message: { ts: "1.1" } },
				{ value: "x" }
			)
		).toBeNull();
	});

	it("blocks an external Slack Connect user from triggering a run", () => {
		const body = blockActionsBody({ user: { id: "U9", team_id: "T-EXTERNAL" } });
		expect(parseDrilldownRun(body, { value: "leak data" }, "T1")).toBeNull();
	});

	it("allows a same-workspace user and pins the installed team", () => {
		const body = blockActionsBody({ user: { id: "U1", team_id: "T1" } });
		const run = parseDrilldownRun(body, { value: "ok" }, "T1");
		expect(run?.teamId).toBe("T1");
	});
});

describe("isExternalSlackConnectClick", () => {
	it("is true only when both teams are known and differ", () => {
		expect(isExternalSlackConnectClick("T2", "T1")).toBe(true);
		expect(isExternalSlackConnectClick("T1", "T1")).toBe(false);
		expect(isExternalSlackConnectClick(undefined, "T1")).toBe(false);
		expect(isExternalSlackConnectClick("T2", undefined)).toBe(false);
	});
});
