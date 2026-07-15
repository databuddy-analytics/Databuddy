import { describe, expect, it } from "bun:test";

const { normalizeFunnelSteps, requireFunnelSteps, toAnalyticsSteps } =
	await import("./funnel-steps");

const persistedSteps = [
	null,
	{ name: "Landing", target: "/", type: "PAGE_VIEW", stale: true },
	{ name: "Missing target", type: "EVENT" },
	"checkout",
	{ name: "Checkout", target: "checkout_started", type: "CUSTOM" },
];

describe("persisted funnel step normalization", () => {
	it("rejects the entire sequence when any persisted step is malformed", () => {
		expect(normalizeFunnelSteps(persistedSteps)).toEqual([]);

		expect(() => requireFunnelSteps(persistedSteps)).toThrow(
			"no malformed steps"
		);
	});

	it("preserves a complete valid sequence and maps custom events", () => {
		const steps = [
			{ name: "Landing", target: "/", type: "PAGE_VIEW" },
			{ name: "Checkout", target: "checkout_started", type: "CUSTOM" },
		];
		expect(normalizeFunnelSteps(steps)).toEqual(steps);

		expect(toAnalyticsSteps(requireFunnelSteps(steps))).toEqual([
			{
				name: "Landing",
				step_number: 1,
				target: "/",
				type: "PAGE_VIEW",
			},
			{
				name: "Checkout",
				step_number: 2,
				target: "checkout_started",
				type: "EVENT",
			},
		]);
	});

	it("rejects persisted funnels with fewer than two valid steps", () => {
		let error: unknown;
		try {
			requireFunnelSteps([
				{ name: "Landing", target: "/", type: "PAGE_VIEW" },
				{ name: "Broken", type: "EVENT" },
			]);
		} catch (caught) {
			error = caught;
		}

		expect(error).toMatchObject({
			code: "BAD_REQUEST",
			message:
				"Funnel must contain at least 2 valid steps and no malformed steps",
		});
	});
});
