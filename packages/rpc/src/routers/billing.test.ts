import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createProcedureClient, os } from "@orpc/server";
import { Autumn, HTTPClient } from "autumn-js";
import type { Context } from "../orpc";

const procedure = os.$context<Context>();
const context = { user: { id: "admin", email: "admin@example.com", name: "Admin" }, organizationId: "org-example" } as Context;
let canUserUpgrade = true;
let writes: Record<string, unknown>[] = [];
let reads = 0;
let limits = [
	{ feature_id: "agent_credits", enabled: true, overage_limit: 20 },
	{ feature_id: "events", enabled: true, overage_limit: 100 },
];
const customer = () => ({
	id: "owner-example", name: null, email: null, fingerprint: null,
	stripe_id: null, env: "sandbox", created_at: 0,
	metadata: {}, send_email_receipts: false,
	subscriptions: [], purchases: [], balances: {}, flags: {},
	billing_controls: { spend_limits: limits },
});
const autumn = new Autumn({
	secretKey: "am_sk_test_fixture", failOpen: false, retryConfig: { strategy: "none" },
	httpClient: new HTTPClient({ fetcher: async (input) => {
		const request = input instanceof Request ? input : new Request(input);
		const body = await request.json();
		expect(body.customer_id).toBe("owner-example");
		if (new URL(request.url).pathname === "/v1/customers.get_or_create") {
			reads++;
			return Response.json(customer());
		}
		expect(new URL(request.url).pathname).toBe("/v1/customers.update");
		writes.push(body);
		limits = body.billing_controls.spend_limits;
		return Response.json(customer());
	} }),
});
mock.module("../orpc", () => ({ protectedProcedure: procedure, trackedSessionProcedure: procedure }));
mock.module("../procedures/with-workspace", () => ({ withWorkspace: procedure.middleware(({ next }) => next()) }));
mock.module("../utils/billing", () => ({ getBillingOwner: async () => ({ customerId: "owner-example", canUserUpgrade }) }));
mock.module("../lib/autumn-client", () => ({ getAutumn: () => autumn }));
mock.module("../lib/logger", () => ({ logger: { error: () => undefined, info: () => undefined, warn: () => undefined } }));
mock.module("@databuddy/db/clickhouse", () => ({ chQuery: () => { throw new Error("Unexpected analytics query"); } }));

const { billingRouter } = await import("./billing");
const setLimit = createProcedureClient(billingRouter.setSpendLimit, { context });

beforeEach(() => {
	canUserUpgrade = true;
	writes = [];
	reads = 0;
	limits = [
		{ feature_id: "agent_credits", enabled: true, overage_limit: 20 },
		{ feature_id: "events", enabled: true, overage_limit: 100 },
	];
});

describe("native investigation spending limits", () => {
	test("sets the owner's investigation cap without replacing other feature caps", async () => {
		await setLimit({ featureId: "investigation_runs", enabled: true, overageLimit: 50 });
		expect(writes).toEqual([{
			customer_id: "owner-example", billing_controls: { spend_limits: [
				{ feature_id: "agent_credits", enabled: true, overage_limit: 20 },
				{ feature_id: "events", enabled: true, overage_limit: 100 },
				{ feature_id: "investigation_runs", enabled: true, overage_limit: 50 },
			] },
		}]);
	});

	test("turning off the investigation limit preserves other caps", async () => {
		limits.push({ feature_id: "investigation_runs", enabled: true, overage_limit: 50 });
		await setLimit({ featureId: "investigation_runs", enabled: false, overageLimit: 50 });
		expect(limits).toEqual([
			{ feature_id: "agent_credits", enabled: true, overage_limit: 20 },
			{ feature_id: "events", enabled: true, overage_limit: 100 },
			{ feature_id: "investigation_runs", enabled: false, overage_limit: 50 },
		]);
	});

	test("old clients continue to target legacy credits", async () => {
		await setLimit({ enabled: true, overageLimit: 40 });
		expect(limits.find(entry => entry.feature_id === "agent_credits")?.overage_limit).toBe(40);
		expect(limits.some(entry => entry.feature_id === "investigation_runs")).toBe(false);
	});

	test("a member cannot alter billing", async () => {
		canUserUpgrade = false;
		await expect(setLimit({ featureId: "investigation_runs", enabled: true, overageLimit: 50 })).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(reads).toBe(0);
		expect(writes).toEqual([]);
	});

	test("invalid caps are rejected before contacting Autumn", async () => {
		for (const overageLimit of [0, -1, 1.5, 10001]) {
			await expect(setLimit({ featureId: "investigation_runs", enabled: true, overageLimit })).rejects.toMatchObject({ code: "BAD_REQUEST" });
		}
		expect(reads).toBe(0);
		expect(writes).toEqual([]);
	});
});
