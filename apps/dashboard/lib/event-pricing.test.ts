import { describe, expect, test } from "bun:test";
import { displayNameForPlan } from "../../docs/app/(home)/pricing/_pricing/best-plan";
import { estimateTieredOverageCostFromTiers } from "../../docs/app/(home)/pricing/_pricing/estimator-utils";
import { normalizePlans } from "../../docs/app/(home)/pricing/_pricing/normalize";
import { RAW_PLANS } from "../../docs/app/(home)/pricing/data";
import { hobby, intelligence, intelligence_scale, pro } from "../autumn.config";

const plans = [hobby, pro, intelligence, intelligence_scale];
const normalized = normalizePlans(RAW_PLANS);

describe("event pricing catalog and estimates", () => {
	test("paid tiers start above each allowance and public absolute thresholds match the native catalog", () => {
		for (const plan of plans) {
			const native = plan.items?.find((item) => item.featureId === "events");
			const published = RAW_PLANS.find(
				(item) => item.id === plan.id
			)?.items.find(
				(item) => item.type === "priced_feature" && item.feature_id === "events"
			);
			if (
				published?.type !== "priced_feature" ||
				typeof native?.included !== "number"
			) {
				throw new Error(`Missing event pricing for ${plan.id}`);
			}
			expect(published.included_usage).toBe(native.included);
			expect(published.tiers).toEqual(native.price?.tiers);
			for (const tier of native.price?.tiers ?? []) {
				if (tier.to !== "inf") expect(tier.to).toBeGreaterThan(native.included);
			}
		}
	});

	test("Hobby and Pro retain their original thresholds and rates", () => {
		expect(
			hobby.items?.find((item) => item.featureId === "events")?.price?.tiers
		).toEqual([
			{ to: 2_030_000, amount: 0.000035 },
			{ to: 10_030_000, amount: 0.00003 },
			{ to: 50_030_000, amount: 0.00002 },
			{ to: 250_030_000, amount: 0.000015 },
			{ to: "inf", amount: 0.00001 },
		]);
		expect(
			pro.items?.find((item) => item.featureId === "events")?.price?.tiers
		).toEqual([
			{ to: 2_000_000, amount: 0.000035 },
			{ to: 10_000_000, amount: 0.00003 },
			{ to: 50_000_000, amount: 0.00002 },
			{ to: 250_000_000, amount: 0.000015 },
			{ to: "inf", amount: 0.00001 },
		]);
	});

	test.each([
		["hobby", 30_000, 0],
		["hobby", 2_030_000, 70],
		["hobby", 2_030_001, 70.00003],
		["pro", 1_000_000, 0],
		["pro", 2_000_000, 35],
		["pro", 2_000_001, 35.00003],
		["intelligence", 2_000_000, 0],
		["intelligence", 2_000_001, 0.00003],
		["intelligence", 10_000_000, 240],
		["intelligence", 10_000_001, 240.00002],
		["intelligence_scale", 10_000_000, 0],
		["intelligence_scale", 10_000_001, 0.00002],
		["intelligence_scale", 50_000_000, 800],
		["intelligence_scale", 50_000_001, 800.000015],
	] as const)("estimates %s at %i monthly events as $%f overage", (id, events, expected) => {
		const plan = normalized.find((item) => item.id === id);
		if (!plan?.eventTiers)
			throw new Error(`Missing normalized pricing for ${id}`);
		expect(
			estimateTieredOverageCostFromTiers(
				Math.max(events - plan.includedEventsMonthly, 0),
				plan.eventTiers
			)
		).toBeCloseTo(expected, 8);
	});

	test("keeps the enterprise label threshold in total monthly events", () => {
		const scale = normalized.find((plan) => plan.id === "intelligence_scale");
		if (!scale) throw new Error("Missing Scale plan");
		expect(displayNameForPlan(250_000_000, normalized, scale)).toBe(scale.name);
		expect(displayNameForPlan(250_000_001, normalized, scale)).toBe(
			"Enterprise"
		);
	});
});
