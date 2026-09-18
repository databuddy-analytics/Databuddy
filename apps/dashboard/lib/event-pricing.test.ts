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
				if (tier.to !== "inf") {
					expect(tier.to).toBeGreaterThan(native.included);
				}
			}
		}
	});

	test.each([
		["hobby", 30_000, 0],
		["hobby", 2_030_000, 70],
		["hobby", 2_030_001, 70.000_03],
		["pro", 1_000_000, 0],
		["pro", 2_000_000, 35],
		["pro", 2_000_001, 35.000_03],
		["intelligence", 2_000_000, 0],
		["intelligence", 2_000_001, 0.000_03],
		["intelligence", 10_000_000, 240],
		["intelligence", 10_000_001, 240.000_02],
		["intelligence_scale", 6_000_000, 0],
		["intelligence_scale", 6_000_001, 0.000_03],
		["intelligence_scale", 10_000_000, 120],
		["intelligence_scale", 10_000_001, 120.000_02],
		["intelligence_scale", 50_000_000, 920],
		["intelligence_scale", 50_000_001, 920.000_015],
	] as const)("estimates %s at %i monthly events as $%f overage", (id, events, expected) => {
		const plan = normalized.find((item) => item.id === id);
		if (!plan?.eventTiers) {
			throw new Error(`Missing normalized pricing for ${id}`);
		}
		expect(
			estimateTieredOverageCostFromTiers(
				Math.max(events - plan.includedEventsMonthly, 0),
				plan.eventTiers
			)
		).toBeCloseTo(expected, 8);
	});

	test("keeps the enterprise label threshold in total monthly events", () => {
		const scale = normalized.find((plan) => plan.id === "intelligence_scale");
		if (!scale) {
			throw new Error("Missing Scale plan");
		}
		expect(displayNameForPlan(250_000_000, normalized, scale)).toBe(scale.name);
		expect(displayNameForPlan(250_000_001, normalized, scale)).toBe(
			"Enterprise"
		);
	});
});
