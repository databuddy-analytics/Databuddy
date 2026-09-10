import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import type { executeQuery } from "@databuddy/ai/query";
import { parseInvestigationSignal } from "@databuddy/shared/insights";
import type { BusinessMeasurementPlan } from "@databuddy/shared/organization-business-context";
import dayjs from "dayjs";
import { prepareInvestigation } from "./investigation";
import { parseFrozenInvestigationPlan } from "./run-candidate-plan";
import { organizationProfileContext } from "./business-context";
import {
	detectRetentionSignals,
	measureActivationRetention,
	measurementPlanKey,
} from "./measurement-plan";

const plan: BusinessMeasurementPlan = {
	websiteId: "synthetic-site",
	domain: "example.com",
	name: "Shared reports",
	activationEvent: "report_shared",
	returnEvent: "report_opened",
	horizonDays: 7,
};
const asOf = dayjs("2026-09-09T12:00:00Z");
const params = { websiteId: plan.websiteId, timezone: "UTC", lookbackDays: 7 };

function fixture(
	options: {
		eligible?: number;
		before?: number;
		after?: number;
		incomplete?: number;
		identity?: number;
	} = {}
) {
	const eligible = options.eligible ?? 200;
	const before = options.before ?? 160;
	const after = options.after ?? 80;
	const incomplete = options.incomplete ?? 0;
	const events = Math.ceil((eligible + incomplete) / (options.identity ?? 1));
	const query: typeof executeQuery = async (request) => {
		const retained = request.from === "2026-08-18" ? before : after;
		const row = {
			cohort_from: request.from,
			cohort_to: request.to,
			observation_end: "2026-09-08",
			cohort_start: dayjs.tz(request.from, "UTC").toISOString(),
			cohort_end: dayjs.tz(request.to, "UTC").add(1, "day").toISOString(),
			observed_before: "2026-09-09T00:00:00.000Z",
			timezone: "UTC",
			horizon_days: 7,
			identity_basis: "direct_profile_id",
			activation_basis: "first_in_cohort_window",
			activated_profiles: eligible + incomplete,
			eligible_profiles: eligible,
			retained_profiles: retained,
			not_retained_profiles: eligible - retained,
			incomplete_profiles: incomplete,
			activation_events: events,
			identified_activation_events: eligible + incomplete,
			unidentified_activation_events: events - eligible - incomplete,
		};
		return [
			{ ...row, row_type: "overall", cohort_date: null },
			{ ...row, row_type: "cohort", cohort_date: request.from },
		];
	};
	return query;
}

describe("saved activation and return measurement", () => {
	it.each([
		{
			name: "localized",
			eligible: 40,
			events: 50,
			before: [32, 32, 32, 32, 32, 32, 32],
			after: [32, 32, 32, 32, 8, 8, 8],
		},
		{
			name: "sparse",
			eligible: 10,
			events: 20,
			before: [8, 8, 8, 8, 8, 8, 8],
			after: [8, 8, 8, 8, 2, 2, 2],
		},
		{
			name: "uniform",
			eligible: 40,
			events: 50,
			before: [32, 32, 32, 32, 32, 32, 32],
			after: [16, 16, 16, 16, 16, 16, 16],
		},
	])("retains sorted daily counts from the existing two queries: $name", async ({
		eligible,
		events,
		before,
		after,
	}) => {
		let calls = 0;
		const query: typeof executeQuery = async (...args) => {
			calls++;
			const [base] = await fixture()(...args);
			const request = args[0];
			const retained = request.from === "2026-08-18" ? before : after;
			const daily = retained.map((count, index) => ({
				...base,
				row_type: "cohort",
				cohort_date: dayjs(request.from).add(index, "day").format("YYYY-MM-DD"),
				activated_profiles: eligible,
				eligible_profiles: eligible,
				retained_profiles: count,
				not_retained_profiles: eligible - count,
				activation_events: events,
				identified_activation_events: eligible,
				unidentified_activation_events: events - eligible,
			}));
			return [
				{
					...base,
					activated_profiles: eligible * 7,
					eligible_profiles: eligible * 7,
					retained_profiles: retained.reduce((sum, count) => sum + count, 0),
					not_retained_profiles: retained.reduce(
						(sum, count) => sum + eligible - count,
						0
					),
					activation_events: events * 7,
					identified_activation_events: eligible * 7,
					unidentified_activation_events: (events - eligible) * 7,
				},
				...daily.reverse(),
			];
		};
		const [detected] = await detectRetentionSignals(params, asOf, undefined, {
			readPlan: async () => plan,
			query,
		});
		expect(calls).toBe(2);
		const prepared = prepareInvestigation(detected, 7);
		const stored = parseInvestigationSignal(
			JSON.parse(JSON.stringify(prepared.signal))
		);
		expect(stored?.retentionMeasurement).toEqual(detected.retentionMeasurement);
		for (const [period, retained] of [
			["previous", before],
			["current", after],
		] as const) {
			expect(stored?.retentionMeasurement?.daily?.[period]).toEqual(
				retained.map((count, index) => ({
					date: dayjs(prepared.signal.period[period].from)
						.add(index, "day")
						.format("YYYY-MM-DD"),
					eligible,
					retained: count,
					incomplete: 0,
					events,
					identifiedEvents: eligible,
				}))
			);
			expect(stored?.retentionMeasurement?.[period]).toEqual({
				eligible: eligible * 7,
				retained: retained.reduce((sum, count) => sum + count, 0),
				incomplete: 0,
				events: events * 7,
				identifiedEvents: eligible * 7,
				cohortStart: `${prepared.signal.period[period].from}T00:00:00.000Z`,
				cohortEnd: dayjs(prepared.signal.period[period].to)
					.add(1, "day")
					.toISOString(),
			});
		}
	});

	it("preserves sparse reported dates and anonymous-only days without filling absent dates", async () => {
		const query: typeof executeQuery = async (...args) => {
			const rows = await fixture()(...args);
			rows[0].activation_events += 20;
			rows[0].unidentified_activation_events += 20;
			return [
				...rows,
				{
					...rows[1],
					cohort_date: args[0].to,
					activated_profiles: 0,
					eligible_profiles: 0,
					retained_profiles: 0,
					not_retained_profiles: 0,
					activation_events: 20,
					identified_activation_events: 0,
					unidentified_activation_events: 20,
				},
			];
		};
		const measured = await measureActivationRetention(plan, "UTC", asOf, query);
		expect(measured.previous).toEqual({
			eligible: 200,
			retained: 160,
			incomplete: 0,
			events: 220,
			identifiedEvents: 200,
			cohortStart: "2026-08-18T00:00:00.000Z",
			cohortEnd: "2026-08-25T00:00:00.000Z",
		});
		expect(measured.daily.current.map((row) => row.date)).toEqual([
			"2026-08-25",
			"2026-08-31",
		]);
		expect(measured.daily.current[1]).toEqual({
			date: "2026-08-31",
			eligible: 0,
			retained: 0,
			incomplete: 0,
			events: 20,
			identifiedEvents: 0,
		});
	});

	it.each([
		"duplicate-date",
		"outside-window",
		"inconsistent-sum",
	])("rejects invalid native daily evidence before retaining it: %s", async (mode) => {
		const query: typeof executeQuery = async (...args) => {
			const rows = await fixture()(...args);
			if (mode === "duplicate-date") {
				rows.push({ ...rows[1] });
			} else if (mode === "outside-window") {
				rows[1].cohort_date = "2026-08-17";
			} else {
				rows[1].retained_profiles -= 1;
				rows[1].not_retained_profiles += 1;
			}
			return rows;
		};
		await expect(
			measureActivationRetention(plan, "UTC", asOf, query)
		).rejects.toThrow();
	});

	it("retains local activation dates across a DST transition", async () => {
		const timezone = "Europe/Berlin";
		const clock = dayjs("2026-04-07T12:00:00Z");
		const query: typeof executeQuery = async (...args) => {
			const rows = await fixture()(...args);
			const request = args[0];
			return rows.map((row) => ({
				...row,
				timezone,
				observation_end: "2026-04-06",
				observed_before: "2026-04-06T22:00:00.000Z",
				cohort_start: dayjs.tz(request.from, timezone).toISOString(),
				cohort_end: dayjs
					.tz(dayjs(request.to).add(1, "day").format("YYYY-MM-DD"), timezone)
					.toISOString(),
			}));
		};
		const measured = await measureActivationRetention(
			plan,
			timezone,
			clock,
			query
		);
		expect(measured.daily.current[0].date).toBe("2026-03-23");
		expect(measured.current.cohortStart).toBe("2026-03-22T23:00:00.000Z");
		expect(measured.current.cohortEnd).toBe("2026-03-29T22:00:00.000Z");
		expect(
			Date.parse(measured.current.cohortEnd) -
				Date.parse(measured.current.cohortStart)
		).toBe(167 * 3_600_000);
	});

	it("measures two independent complete cohorts in parallel native queries and preserves exact evidence", async () => {
		let calls = 0;
		const query: typeof executeQuery = async (...args) => {
			calls++;
			expect(args[0].type).toBe("identified_profile_retention");
			expect(args[0].projectId).toBe(plan.websiteId);
			expect(args[0].filters).toContainEqual({
				field: "namespace",
				op: "eq",
				value: "production",
			});
			return await fixture()(...args);
		};
		const signals = await detectRetentionSignals(params, asOf, undefined, {
			readPlan: async () => ({ ...plan, namespace: "production" }),
			query,
		});
		expect(calls).toBe(2);
		expect(signals).toHaveLength(1);
		expect(signals[0]).toMatchObject({
			current: 40,
			baseline: 80,
			metric: "identified_retention",
			direction: "down",
		});
		const prepared = prepareInvestigation(signals[0], 7);
		expect(prepared.signal.period).toEqual({
			previous: { from: "2026-08-18", to: "2026-08-24" },
			current: { from: "2026-08-25", to: "2026-08-31" },
		});
		expect(prepared.signal.retentionMeasurement).toMatchObject({
			definition: {
				websiteId: plan.websiteId,
				activationEvent: plan.activationEvent,
				returnEvent: plan.returnEvent,
				namespace: "production",
			},
			previous: { retained: 160, eligible: 200, incomplete: 0 },
			current: { retained: 80, eligible: 200, incomplete: 0 },
		});
	});
	it("keeps positive return changes and explicitly reports low identity coverage", async () => {
		const [signal] = await detectRetentionSignals(params, asOf, undefined, {
			readPlan: async () => plan,
			query: fixture({ before: 80, after: 160, identity: 0.1 }),
		});
		expect(signal.direction).toBe("up");
		expect(signal.retentionMeasurement).toMatchObject({
			previous: { identifiedEvents: 200, events: 2000 },
			current: { identifiedEvents: 200, events: 2000 },
		});
	});
	it.each([
		{ eligible: 49, before: 40, after: 10 },
		{ incomplete: 1 },
		{ after: 150 },
		{ eligible: 50, before: 30, after: 20 },
	])("suppresses weak or incomplete comparisons: %j", async (options) => {
		expect(
			await detectRetentionSignals(params, asOf, undefined, {
				readPlan: async () => plan,
				query: fixture(options),
			})
		).toEqual([]);
	});
	it("skips absent and foreign bindings without querying", async () => {
		const query: typeof executeQuery = async () => {
			throw new Error("Unexpected query");
		};
		for (const value of [null, { ...plan, websiteId: "other" }]) {
			expect(
				await detectRetentionSignals(params, asOf, undefined, {
					readPlan: async () => value,
					query,
				})
			).toEqual([]);
		}
	});
	it.each([
		"cohort_from",
		"observed_before",
		"horizon_days",
		"eligible_profiles",
		"identity_basis",
	])("rejects inconsistent %s", async (field) => {
		const query: typeof executeQuery = async (...args) => {
			const rows = await fixture()(...args);
			rows[0][field] = null;
			return rows;
		};
		await expect(
			measureActivationRetention(plan, "UTC", asOf, query)
		).rejects.toThrow();
	});
	it("rejects silently truncated cohort rows", async () => {
		const query: typeof executeQuery = async (...args) =>
			(await fixture()(...args)).slice(0, 1);
		await expect(
			measureActivationRetention(plan, "UTC", asOf, query)
		).rejects.toThrow("incomplete");
	});
	it("keeps identity on a renamed label, separates changed event definitions", () => {
		expect(measurementPlanKey({ ...plan, name: "New label" })).toBe(
			measurementPlanKey(plan)
		);
		for (const changes of [
			{ returnEvent: "other" },
			{ domain: "other.example.com" },
			{ namespace: "test" },
			{ horizonDays: 30 as const },
		]) {
			expect(measurementPlanKey({ ...plan, ...changes })).not.toBe(
				measurementPlanKey(plan)
			);
		}
	});
	it("bounds a stalled settings read and never starts late analytics", async () => {
		await expect(
			detectRetentionSignals(params, asOf, AbortSignal.timeout(5), {
				readPlan: () => new Promise(() => {}),
				query: async () => {
					throw new Error("Unexpected query");
				},
			})
		).rejects.toThrow();
	});
});

it("freezes maximum-length event definitions without losing meaning or measured coverage", async () => {
	const definition = {
		...plan,
		activationEvent: "activate".padEnd(256, "x"),
		returnEvent: "return".padEnd(256, "y"),
		namespace: "production".padEnd(256, "z"),
	};
	const [detected] = await detectRetentionSignals(params, asOf, undefined, {
		readPlan: async () => definition,
		query: fixture(),
	});
	const prepared = prepareInvestigation(detected, 7);
	expect(prepared.signal.entity.type).toBe("cohort");
	expect(prepared.evidence.every((item) => item.length <= 500)).toBe(true);
	const context = organizationProfileContext(
		{
			content: "Synthetic reports",
			measurementPlans: [definition],
			origin: "team",
			sources: [],
			revision: 1,
			updatedAt: "2026-09-08T00:00:00Z",
			updatedBy: "synthetic",
			sourceWebsiteId: null,
		},
		"synthetic-org",
		asOf.toDate(),
		{ websiteId: plan.websiteId, domain: plan.domain }
	);
	const frozen = parseFrozenInvestigationPlan({
		asOf: asOf.toISOString(),
		reason: "scheduled",
		businessScope: {
			organizationId: "synthetic-org",
			websiteId: plan.websiteId,
			domain: plan.domain,
		},
		candidates: [{ ...prepared, businessContext: context }],
	});
	const retained = JSON.stringify(frozen);
	expect(retained).toContain(definition.activationEvent);
	expect(retained).toContain(definition.returnEvent);
	expect(retained).toContain(definition.namespace);
	const stored = parseInvestigationSignal(
		JSON.parse(JSON.stringify(frozen.candidates[0].signal))
	);
	expect(stored?.retentionMeasurement).toEqual(detected.retentionMeasurement);
	expect(stored?.retentionMeasurement?.previous).toMatchObject({
		retained: 160,
		eligible: 200,
		identifiedEvents: 200,
		events: 200,
	});
	expect(
		parseInvestigationSignal({ ...stored, retentionMeasurement: undefined })
	).not.toBeNull();
	for (const invalid of [
		{ eligible: 20 },
		{ retained: 201 },
		{ events: 199 },
		{ incomplete: 1 },
		{ cohortEnd: "2026-08-01T00:00:00Z" },
	]) {
		expect(
			parseInvestigationSignal({
				...stored,
				retentionMeasurement: {
					...stored?.retentionMeasurement,
					previous: { ...stored?.retentionMeasurement?.previous, ...invalid },
				},
			})
		).toBeNull();
	}
});
