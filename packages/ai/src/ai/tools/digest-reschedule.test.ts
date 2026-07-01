import { describe, expect, it } from "bun:test";
import {
	computeReschedulePatch,
	computeRescheduleProposal,
} from "./digest-reschedule";

const baseExisting = {
	cron: null as string | null,
	frequency: "weekly" as const,
	timezone: "UTC",
};

describe("computeReschedulePatch", () => {
	it("returns an empty patch when nothing is supplied", () => {
		expect(computeReschedulePatch({})).toEqual({});
	});

	it("forces frequency=custom when only cron is supplied", () => {
		expect(computeReschedulePatch({ cron: "0 8 * * 5" })).toEqual({
			cron: "0 8 * * 5",
			frequency: "custom",
		});
	});

	it("does not override an explicit frequency when cron is supplied", () => {
		expect(
			computeReschedulePatch({ cron: "0 8 * * 5", frequency: "weekly" })
		).toEqual({
			cron: "0 8 * * 5",
			frequency: "weekly",
		});
	});

	it("clears the cron when switching to a non-custom cadence without a new cron", () => {
		expect(computeReschedulePatch({ frequency: "daily" })).toEqual({
			cron: null,
			frequency: "daily",
		});
	});

	it("keeps cron untouched when switching to custom without a new cron", () => {
		expect(computeReschedulePatch({ frequency: "custom" })).toEqual({
			frequency: "custom",
		});
	});

	it("passes timezone-only changes through without touching cron or frequency", () => {
		expect(computeReschedulePatch({ timezone: "Europe/Berlin" })).toEqual({
			timezone: "Europe/Berlin",
		});
	});

	it("supports combined cron + timezone updates", () => {
		expect(
			computeReschedulePatch({
				cron: "0 8 * * 5",
				timezone: "Europe/Berlin",
			})
		).toEqual({
			cron: "0 8 * * 5",
			frequency: "custom",
			timezone: "Europe/Berlin",
		});
	});
});

describe("computeRescheduleProposal", () => {
	it("flags a cadence change when frequency differs", () => {
		const proposal = computeRescheduleProposal(baseExisting, {
			frequency: "daily",
		});

		expect(proposal.frequency).toBe("daily");
		expect(proposal.cron).toBeNull();
		expect(proposal.timezone).toBe("UTC");
		expect(proposal.changes).toEqual(["cadence weekly -> daily"]);
	});

	it("auto-promotes frequency to custom when only cron is supplied", () => {
		const proposal = computeRescheduleProposal(baseExisting, {
			cron: "0 8 * * 5",
		});

		expect(proposal.frequency).toBe("custom");
		expect(proposal.cron).toBe("0 8 * * 5");
		expect(proposal.changes).toContain("cadence weekly -> custom");
		expect(proposal.changes).toContain("cron none -> 0 8 * * 5");
	});

	it("renders a cron transition with prior value when one existed", () => {
		const proposal = computeRescheduleProposal(
			{ ...baseExisting, cron: "0 9 * * *", frequency: "custom" },
			{ cron: "0 8 * * 5" }
		);

		expect(proposal.changes).toContain("cron 0 9 * * * -> 0 8 * * 5");
	});

	it("clears cron when switching to a non-custom cadence", () => {
		const proposal = computeRescheduleProposal(
			{ ...baseExisting, cron: "0 9 * * *", frequency: "custom" },
			{ frequency: "daily" }
		);

		expect(proposal.cron).toBeNull();
		expect(proposal.changes).toContain("cron 0 9 * * * -> none");
	});

	it("reports timezone-only changes without touching cron/cadence", () => {
		const proposal = computeRescheduleProposal(baseExisting, {
			timezone: "Europe/Berlin",
		});

		expect(proposal.timezone).toBe("Europe/Berlin");
		expect(proposal.frequency).toBe("weekly");
		expect(proposal.cron).toBeNull();
		expect(proposal.changes).toEqual(["timezone UTC -> Europe/Berlin"]);
	});

	it("emits an empty change list when nothing actually moves", () => {
		const proposal = computeRescheduleProposal(baseExisting, {
			frequency: "weekly",
			timezone: "UTC",
		});

		expect(proposal.changes).toEqual([]);
	});

	it("combines cadence + cron + timezone changes in deterministic order", () => {
		const proposal = computeRescheduleProposal(baseExisting, {
			cron: "0 8 * * 5",
			timezone: "Europe/Berlin",
		});

		expect(proposal.changes).toEqual([
			"cadence weekly -> custom",
			"cron none -> 0 8 * * 5",
			"timezone UTC -> Europe/Berlin",
		]);
	});
});
