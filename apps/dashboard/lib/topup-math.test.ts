import { describe, expect, test } from "bun:test";
import {
	TOPUP_TIERS,
	blendedRatePerCredit,
	calculateTopupCost,
	getTierBoundary,
} from "./topup-math";

describe("credit top-up tiers", () => {
	test("volume floor stays at eight cents per credit", () => {
		expect(TOPUP_TIERS.at(-1)).toEqual({ to: "inf", amount: 0.08 });
		expect(getTierBoundary(5001).currentRate).toBe(0.08);
		expect(blendedRatePerCredit(10_000)).toBeGreaterThanOrEqual(0.08);
		expect(calculateTopupCost(5001) / 5001).toBeGreaterThanOrEqual(0.08);
	});
});
