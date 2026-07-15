import { describe, expect, it } from "bun:test";
import { summarizeFunnelSteps } from "./product-context";

describe("summarizeFunnelSteps", () => {
	it("serializes the validated step sequence with users from matching step numbers", () => {
		expect(
			summarizeFunnelSteps(
				[
					{ name: "Signup", target: "/signup", type: "PAGE_VIEW" },
					{ name: "Paid", target: "purchase", type: "CUSTOM" },
				],
				[
					{ step_number: 2, users: "5" },
					{ step_number: 1, users: 12 },
				]
			)
		).toEqual([
			{
				name: "Signup",
				step_number: 1,
				target: "/signup",
				type: "PAGE_VIEW",
				users: 12,
			},
			{
				name: "Paid",
				step_number: 2,
				target: "purchase",
				type: "CUSTOM",
				users: 5,
			},
		]);
	});

	it("does not reindex a funnel around a malformed middle step", () => {
		expect(
			summarizeFunnelSteps(
				[
					{ name: "Signup", target: "/signup", type: "PAGE_VIEW" },
					{ name: "Broken", type: "EVENT" },
					{ name: "Paid", target: "purchase", type: "CUSTOM" },
				],
				[
					{ step_number: 1, users: 12 },
					{ step_number: 3, users: 5 },
				]
			)
		).toEqual([]);
	});
});
