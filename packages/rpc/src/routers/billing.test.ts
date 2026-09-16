import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createProcedureClient, os } from "@orpc/server";
import type { Context } from "../orpc";

const procedure = os.$context<Context>();
const context = { user: { id: "admin", email: "admin@example.com", name: "Admin" }, organizationId: "org-example" } as Context;
let canUserUpgrade = true;
let writes: Record<string, unknown>[] = [];
let reads = 0;
let readStatus = 200;
let updateStatus = 200;
let readCustomerId = "owner-example";
const originalSecret = process.env.AUTUMN_SECRET_KEY;
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
// Exercise the installed SDK and the production strict-client factory. No
// request reaches Autumn or another service, even if fail-open is reintroduced.
const transport = spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
		const request = input instanceof Request ? input : new Request(input, init);
		expect(new URL(request.url).origin).toBe("https://api.useautumn.com");
		const body = await request.json();
		expect(body.customer_id).toBe("owner-example");
		if (new URL(request.url).pathname === "/v1/customers.get_or_create") {
			reads++;
			return Response.json({ ...customer(), id: readCustomerId }, { status: readStatus });
		}
		expect(new URL(request.url).pathname).toBe("/v1/customers.update");
		writes.push(body);
		if (updateStatus === 200) limits = body.billing_controls.spend_limits;
		return Response.json(customer(), { status: updateStatus });
});
mock.module("../orpc", () => ({ protectedProcedure: procedure, trackedSessionProcedure: procedure }));
mock.module("../procedures/with-workspace", () => ({ withWorkspace: procedure.middleware(({ next }) => next()) }));
mock.module("../utils/billing", () => ({ getBillingOwner: async () => ({ customerId: "owner-example", canUserUpgrade }) }));
mock.module("../lib/logger", () => ({ logger: { error: () => undefined, info: () => undefined, warn: () => undefined } }));
mock.module("@databuddy/db/clickhouse", () => ({ chQuery: () => { throw new Error("Unexpected analytics query"); } }));

const { billingRouter } = await import("./billing");
const setLimit = createProcedureClient(billingRouter.setSpendLimit, { context });

beforeEach(() => {
	process.env.AUTUMN_SECRET_KEY = "synthetic-native-transport-only";
	canUserUpgrade = true;
	writes = [];
	reads = 0;
	readStatus = 200;
	updateStatus = 200;
	readCustomerId = "owner-example";
	limits = [
		{ feature_id: "agent_credits", enabled: true, overage_limit: 20 },
		{ feature_id: "events", enabled: true, overage_limit: 100 },
	];
});

afterAll(() => {
	transport.mockRestore();
	if (originalSecret === undefined) delete process.env.AUTUMN_SECRET_KEY;
	else process.env.AUTUMN_SECRET_KEY = originalSecret;
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

	test("old clients continue to target AI credits", async () => {
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

	test.each([202, 500])("an unconfirmed customer read (%s) cannot replace saved limits", async (status) => {
		readStatus = status;
		const originalLimits = structuredClone(limits);
		await expect(setLimit({ featureId: "investigation_runs", enabled: true, overageLimit: 50 })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
		expect(reads).toBe(1);
		expect(writes).toEqual([]);
		expect(limits).toEqual(originalLimits);
	});

	test("a mismatched customer identity cannot supply settings for an update", async () => {
		readCustomerId = "another-customer";
		await expect(setLimit({ featureId: "investigation_runs", enabled: true, overageLimit: 50 })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
		expect(reads).toBe(1);
		expect(writes).toEqual([]);
	});

	test.each([202, 500])("an unconfirmed update (%s) is not returned as a saved cap", async (status) => {
		updateStatus = status;
		const originalLimits = structuredClone(limits);
		await expect(setLimit({ featureId: "investigation_runs", enabled: true, overageLimit: 50 })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
		expect(reads).toBe(1);
		expect(writes).toHaveLength(1);
		expect(limits).toEqual(originalLimits);
	});
});
