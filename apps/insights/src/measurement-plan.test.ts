import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import type { executeQuery } from "@databuddy/ai/query";
import type { BusinessMeasurementPlan } from "@databuddy/shared/organization-business-context";
import dayjs from "dayjs";
import { prepareInvestigation } from "./investigation";
import { detectRetentionSignals, measureActivationRetention, measurementPlanKey } from "./measurement-plan";

const plan: BusinessMeasurementPlan = {
	websiteId: "synthetic-site", domain: "example.com", name: "Shared reports",
	activationEvent: "report_shared", returnEvent: "report_opened", horizonDays: 7,
};
const asOf = dayjs("2026-09-09T12:00:00Z");
const params = { websiteId: plan.websiteId, timezone: "UTC", lookbackDays: 7 };

function fixture(options: { eligible?: number; before?: number; after?: number; incomplete?: number; identity?: number } = {}) {
	const eligible = options.eligible ?? 200;
	const before = options.before ?? 160;
	const after = options.after ?? 80;
	const incomplete = options.incomplete ?? 0;
	const events = Math.ceil((eligible + incomplete) / (options.identity ?? 1));
    const query: typeof executeQuery = async (request) => {
        const retained = request.from === "2026-08-18" ? before : after;
        const row = {
            cohort_from: request.from, cohort_to: request.to, observation_end: "2026-09-08",
            cohort_start: dayjs.tz(request.from, "UTC").toISOString(),
            cohort_end: dayjs.tz(request.to, "UTC").add(1,"day").toISOString(),
            observed_before: "2026-09-09T00:00:00.000Z", timezone:"UTC", horizon_days:7,
            identity_basis:"direct_profile_id", activation_basis:"first_in_cohort_window",
            activated_profiles: eligible + incomplete, eligible_profiles:eligible, retained_profiles:retained,
            not_retained_profiles: eligible-retained, incomplete_profiles:incomplete,
            activation_events:events, identified_activation_events:eligible+incomplete, unidentified_activation_events:events-eligible-incomplete,
        };
        return [{...row,row_type:"overall",cohort_date:null},{...row,row_type:"cohort",cohort_date:request.from}];
    };
	return query;
}

describe("saved activation and return measurement", () => {
	it("measures two independent complete cohorts in parallel native queries and preserves exact evidence", async () => {
		let calls = 0;
		const query: typeof executeQuery = async (...args) => {
			calls++;
			expect(args[0].type).toBe("identified_profile_retention");
			expect(args[0].projectId).toBe(plan.websiteId);
			expect(args[0].filters).toContainEqual({ field: "namespace", op: "eq", value: "production" });
			return await fixture()(...args);
		};
		const signals = await detectRetentionSignals(params, asOf, undefined, { readPlan: async () => ({ ...plan, namespace: "production" }), query });
		expect(calls).toBe(2);
		expect(signals).toHaveLength(1);
		expect(signals[0]).toMatchObject({ current: 40, baseline: 80, metric: "identified_retention", direction: "down" });
		const prepared = prepareInvestigation(signals[0], 7);
		expect(prepared.signal.period).toEqual({ previous: { from: "2026-08-18", to: "2026-08-24" }, current: { from: "2026-08-25", to: "2026-08-31" } });
		expect(prepared.evidence.join("\n")).toContain("160/200");
		expect(prepared.evidence.join("\n")).toContain("not first-ever activation");
	});
	it("keeps positive return changes and explicitly reports low identity coverage", async () => {
		const [signal] = await detectRetentionSignals(params, asOf, undefined, { readPlan: async () => plan, query: fixture({ before: 80, after: 160, identity: 0.1 }) });
		expect(signal.direction).toBe("up");
		expect(signal.evidence?.join("\n")).toContain("200/2000");
		expect(signal.evidence?.join("\n")).toContain("Anonymous events are outside the profile denominator");
	});
	it.each([
		{ eligible: 49, before: 40, after: 10 }, { incomplete: 1 },
		{ after: 150 }, { eligible: 50, before: 30, after: 20 },
	])("suppresses weak or incomplete comparisons: %j", async (options) => {
		expect(await detectRetentionSignals(params, asOf, undefined, { readPlan: async () => plan, query: fixture(options) })).toEqual([]);
	});
	it("skips absent and foreign bindings without querying", async () => {
		const query: typeof executeQuery = async () => { throw new Error("Unexpected query"); };
		for (const value of [null, { ...plan, websiteId: "other" }]) {
			expect(await detectRetentionSignals(params, asOf, undefined, { readPlan: async () => value, query })).toEqual([]);
		}
	});
	it.each(["cohort_from", "observed_before", "horizon_days", "eligible_profiles", "identity_basis"])("rejects inconsistent %s", async (field) => {
		const query: typeof executeQuery = async (...args) => {
			const rows = await fixture()(...args);
			rows[0][field] = null;
			return rows;
		};
		await expect(measureActivationRetention(plan, "UTC", asOf, query)).rejects.toThrow();
	});
	it("rejects silently truncated cohort rows", async () => {
		const query: typeof executeQuery = async (...args) => (await fixture()(...args)).slice(0, 1);
		await expect(measureActivationRetention(plan, "UTC", asOf, query)).rejects.toThrow("incomplete");
	});
	it("keeps identity on a renamed label, separates changed event definitions", () => {
		expect(measurementPlanKey({ ...plan, name: "New label" })).toBe(measurementPlanKey(plan));
		for (const changes of [{ returnEvent: "other" }, { domain: "other.example.com" }, { namespace: "test" }, { horizonDays: 30 as const }]) {
			expect(measurementPlanKey({ ...plan, ...changes })).not.toBe(measurementPlanKey(plan));
		}
	});
	it("bounds a stalled settings read and never starts late analytics", async () => {
		await expect(detectRetentionSignals(params, asOf, AbortSignal.timeout(5), {
			readPlan: () => new Promise(() => {}), query: async () => { throw new Error("Unexpected query"); },
		})).rejects.toThrow();
	});
});
