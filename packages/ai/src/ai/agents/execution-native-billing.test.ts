import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

const originalSecret = process.env.AUTUMN_SECRET_KEY;
const customerId = "synthetic-billing-owner";
const requests: { path: string; body: Record<string, unknown> }[] = [];
const events = mock(() => {});
const errors = mock(() => {});
const wide = mock((_: Record<string, unknown>) => {});
let responseCustomerId = customerId;
let customerStatus = 200;
let checkStatus = 200;
let allowed = true;
let balanceFeature = "agent_credits";

const transport = spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
	const request = input instanceof Request ? input : new Request(input, init);
	const url = new URL(request.url);
	if (url.hostname !== "api.useautumn.com") throw new Error("Unexpected external request");
	const body = request.method === "GET" ? {} : await request.json() as Record<string, unknown>;
	requests.push({ path: url.pathname, body });
	if (url.pathname.endsWith("customers.get")) {
		return Response.json({
			id: responseCustomerId, name: null, email: null, created_at: 0,
			fingerprint: null, stripe_id: null, env: "sandbox", metadata: {},
			send_email_receipts: false, billing_controls: {}, subscriptions: [], purchases: [],
			balances: {}, flags: {},
		}, { status: customerStatus });
	}
	if (url.pathname.endsWith("balances.check")) {
		return Response.json({ allowed, customer_id: responseCustomerId, flag: null, balance: {
			feature_id: balanceFeature, granted: 100, remaining: allowed ? 50 : 0,
			usage: allowed ? 50 : 100, unlimited: false, overage_allowed: false,
			max_purchase: null, next_reset_at: null,
		} }, { status: checkStatus });
	}
	if (url.pathname.endsWith("balances.track")) {
		return Response.json({ customer_id: customerId, value: body.value, balance: null });
	}
	throw new Error(`Unexpected native SDK endpoint ${url.pathname}`);
});

mock.module("@databuddy/rpc/billing", () => ({ getBillingCustomerId: async () => customerId }));
mock.module("@databuddy/rpc/organization", () => ({ getOrganizationOwnerId: async () => customerId }));
mock.module("../../lib/databuddy", () => ({ trackAgentEvent: events }));
mock.module("../../lib/tracing", () => ({ captureError: errors, mergeWideEvent: wide }));

const { getAgentBillingAccess, trackAgentUsageAndBill } = await import("./execution");
const usage = { inputTokens: 1000, outputTokens: 100 };

beforeEach(() => {
	process.env.AUTUMN_SECRET_KEY = "synthetic-native-transport-only";
	requests.length = 0;
	events.mockClear();
	errors.mockClear();
	wide.mockClear();
	responseCustomerId = customerId;
	customerStatus = 200;
	checkStatus = 200;
	allowed = true;
	balanceFeature = "agent_credits";
});

afterAll(() => {
	transport.mockRestore();
	if (originalSecret === undefined) delete process.env.AUTUMN_SECRET_KEY;
	else process.env.AUTUMN_SECRET_KEY = originalSecret;
});

describe("agent credits at the native Autumn boundary", () => {
	it("checks credits once and debits once", async () => {
		const billingAccess = await getAgentBillingAccess(customerId);
		expect(billingAccess).toEqual({ allowed: true, customerId });
		await trackAgentUsageAndBill({ billingCustomerId: customerId, billingAccess, modelId: "openai/gpt-5.6-luna", source: "dashboard", usage });
		expect(requests.map((request) => request.path)).toEqual(["/v1/customers.get", "/v1/balances.check", "/v1/balances.track"]);
		expect(requests[1]?.body).toMatchObject({ customer_id: customerId, feature_id: "agent_credits", required_balance: 0.01 });
		expect(requests[2]?.body).toMatchObject({ customer_id: customerId, feature_id: "agent_credits" });
		expect(errors).not.toHaveBeenCalled();
	});

	it("denies exhausted credits and rejects a missing billing owner", async () => {
		allowed = false;
		expect((await getAgentBillingAccess(customerId)).allowed).toBe(false);
		await expect(getAgentBillingAccess(null)).rejects.toThrow("billing customer is unavailable");
		expect(requests).toHaveLength(2);
	});

	it.each([202, 500])("fails closed on native customer status %s", async (status) => {
		customerStatus = status;
		await expect(getAgentBillingAccess(customerId)).rejects.toThrow();
		expect(requests).toHaveLength(1);
	});

	it.each([202, 500])("fails closed on native credit check status %s despite an allowed body", async (status) => {
		checkStatus = status;
		await expect(getAgentBillingAccess(customerId)).rejects.toThrow();
		expect(requests).toHaveLength(2);
	});

	it("rejects a customer identity mismatch", async () => {
		responseCustomerId = "another-customer";
		await expect(getAgentBillingAccess(customerId)).rejects.toThrow("customer could not be verified");
		expect(requests).toHaveLength(1);
	});

	it("does not use an unrelated balance as credit permission", async () => {
		balanceFeature = "investigation_runs";
		await expect(getAgentBillingAccess(customerId)).rejects.toThrow("credit balance could not be verified");
	});

	it("retains internal telemetry when a completion without pinned access cannot resolve entitlement", async () => {
		customerStatus = 500;
		await expect(trackAgentUsageAndBill({ billingCustomerId: customerId, modelId: "openai/gpt-5.6-luna", source: "mcp", usage })).rejects.toThrow();
		expect(events).toHaveBeenCalledTimes(1);
		expect(requests.map((request) => request.path)).toEqual(["/v1/customers.get"]);
	});

	it("rejects pinned permission belonging to another customer", async () => {
		await expect(trackAgentUsageAndBill({ billingCustomerId: customerId, billingAccess: { allowed: true, customerId: "another-customer" }, modelId: "openai/gpt-5.6-luna", source: "slack", usage })).rejects.toThrow("another customer");
		expect(events).toHaveBeenCalledTimes(1);
		expect(requests).toHaveLength(0);
	});
});
