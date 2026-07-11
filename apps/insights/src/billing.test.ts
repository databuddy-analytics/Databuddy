import { describe, expect, it } from "bun:test";
import {
	type InsightsBillingDeps,
	resolveInsightsBilling,
} from "./billing";

function makeDeps(
	overrides: Partial<InsightsBillingDeps> & {
		customerId?: string | null;
		allowed?: boolean;
	} = {}
): {
	deps: InsightsBillingDeps;
	calls: {
		resolveArgs: Parameters<InsightsBillingDeps["resolveBillingCustomerId"]>[0][];
		ensureArgs: (string | null)[];
	};
} {
	const calls = {
		resolveArgs: [] as Parameters<
			InsightsBillingDeps["resolveBillingCustomerId"]
		>[0][],
		ensureArgs: [] as (string | null)[],
	};
	const deps: InsightsBillingDeps = {
		resolveBillingCustomerId:
			overrides.resolveBillingCustomerId ??
			((principal) => {
				calls.resolveArgs.push(principal);
				return Promise.resolve(overrides.customerId ?? null);
			}),
		ensureCreditsAvailable:
			overrides.ensureCreditsAvailable ??
			((id) => {
				calls.ensureArgs.push(id);
				return Promise.resolve(overrides.allowed ?? true);
			}),
	};
	return { deps, calls };
}

describe("resolveInsightsBilling", () => {
	it("allows and checks against null when there is no billing customer", async () => {
		const { deps, calls } = makeDeps({ customerId: null, allowed: true });

		const decision = await resolveInsightsBilling(
			{ organizationId: "org_1", userId: "user_1" },
			deps
		);

		expect(decision).toEqual({ allowed: true, billingCustomerId: null });
		expect(calls.ensureArgs).toEqual([null]);
	});

	it("denies when the resolved customer is out of credits", async () => {
		const { deps, calls } = makeDeps({ customerId: "cust_9", allowed: false });

		const decision = await resolveInsightsBilling(
			{ organizationId: "org_1", userId: "user_1" },
			deps
		);

		expect(decision).toEqual({ allowed: false, billingCustomerId: "cust_9" });
		expect(calls.ensureArgs).toEqual(["cust_9"]);
	});

	it("checks credits against the resolved customer id", async () => {
		const { deps, calls } = makeDeps({ customerId: "cust_42", allowed: true });

		const decision = await resolveInsightsBilling(
			{ organizationId: "org_1", userId: "user_1" },
			deps
		);

		expect(decision.billingCustomerId).toBe("cust_42");
		expect(calls.ensureArgs).toEqual(["cust_42"]);
	});

	it("passes the principal through to customer resolution", async () => {
		const { deps, calls } = makeDeps({ customerId: "cust_1" });

		await resolveInsightsBilling(
			{ organizationId: "org_7", userId: null },
			deps
		);

		expect(calls.resolveArgs).toEqual([
			{ organizationId: "org_7", userId: null },
		]);
	});

	it("propagates customer resolution failures for retry", async () => {
		const { deps, calls } = makeDeps({
			resolveBillingCustomerId: () =>
				Promise.reject(new Error("AUTUMN_SECRET_KEY is not set")),
		});

		await expect(
			resolveInsightsBilling(
				{ organizationId: "org_1", userId: "user_1" },
				deps
			)
		).rejects.toThrow("AUTUMN_SECRET_KEY is not set");
		expect(calls.ensureArgs).toEqual([]);
	});

	it("propagates credit-check failures for retry", async () => {
		const { deps } = makeDeps({
			customerId: "cust_42",
			ensureCreditsAvailable: () =>
				Promise.reject(new Error("Command timed out")),
		});

		await expect(
			resolveInsightsBilling(
				{ organizationId: "org_1", userId: "user_1" },
				deps
			)
		).rejects.toThrow("Command timed out");
	});
});
