import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { DATABUNNY_CHAT } from "@databuddy/shared/billing";

const originalSecret = process.env.AUTUMN_SECRET_KEY;
const customerId = "synthetic-billing-owner";
const requests: { path: string; body: Record<string, unknown> }[] = [];
const events = mock(() => {});
const errors = mock(() => {});
const wide = mock((_: Record<string, unknown>) => {});
let flags: Record<string, unknown> = {};
let responseCustomerId = customerId;
let customerStatus = 200;
let checkStatus = 200;
let allowed = true;
let balanceFeature = "agent_credits";

// Exercise the installed SDK, including strict status handling and snake-case
// parsing. No request reaches Autumn, analytics, a database or another service.
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
			balances: {}, flags,
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

const { getAgentBillingAccess, ensureAgentCreditsAvailable, trackAgentUsageAndBill } = await import("./execution");
const usage = { inputTokens: 1000, outputTokens: 100 };
const included = { id: "synthetic-flag", feature_id: DATABUNNY_CHAT.featureId, plan_id: "synthetic-plan", expires_at: null };

beforeEach(() => {
	process.env.AUTUMN_SECRET_KEY = "synthetic-native-transport-only";
	requests.length = 0;
	events.mockClear();
	errors.mockClear();
	wide.mockClear();
	flags = {};
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

describe("included chat at the native Autumn boundary", () => {
	it.each(["dashboard", "slack", "mcp"] as const)("includes %s chat and pins permission while preserving cost telemetry", async (source) => {
		flags = { [DATABUNNY_CHAT.featureId]: included };
		const billingAccess = await getAgentBillingAccess(customerId);
		expect(billingAccess).toEqual({ allowed: true, customerId, includedChat: true });
		// Completion uses the decision made before the model, even after expiry/removal.
		flags = {};
		const summary = await trackAgentUsageAndBill({ billingCustomerId: customerId, billingAccess, modelId: "openai/gpt-5.6-luna", source, usage });
		expect(summary.cost_total_usd).toBeGreaterThan(0);
		expect(events).toHaveBeenCalledTimes(1);
		expect(wide).toHaveBeenCalledWith(summary);
		expect(requests.map((request) => request.path)).toEqual(["/v1/customers.get"]);
	});

	it.each([
		{ name: "absent flag", value: {} },
		{ name: "expired flag", value: { [DATABUNNY_CHAT.featureId]: { ...included, expires_at: 1 } } },
		{ name: "wrong feature identity", value: { [DATABUNNY_CHAT.featureId]: { ...included, feature_id: "another-feature" } } },
	])("keeps legacy credit checks and one debit with $name", async ({ value }) => {
		flags = value;
		const billingAccess = await getAgentBillingAccess(customerId);
		expect(billingAccess).toEqual({ allowed: true, customerId, includedChat: false });
		await trackAgentUsageAndBill({ billingCustomerId: customerId, billingAccess, modelId: "openai/gpt-5.6-luna", source: "dashboard", usage });
		expect(requests.map((request) => request.path)).toEqual(["/v1/customers.get", "/v1/balances.check", "/v1/balances.track"]);
		expect(requests[1]?.body).toMatchObject({ customer_id: customerId, feature_id: "agent_credits", required_balance: 0.01 });
		expect(requests[2]?.body).toMatchObject({ customer_id: customerId, feature_id: "agent_credits" });
		expect(errors).not.toHaveBeenCalled();
	});

	it("never exempts legacy investigation usage because chat is included", async () => {
		flags = { [DATABUNNY_CHAT.featureId]: included };
		const billingAccess = await getAgentBillingAccess(customerId);
		await trackAgentUsageAndBill({ billingCustomerId: customerId, billingAccess, modelId: "openai/gpt-5.6-luna", source: "insights", usage, idempotencyKey: "synthetic-legacy-investigation" });
		expect(requests.map((request) => request.path)).toEqual(["/v1/customers.get", "/v1/balances.track"]);
		expect(requests[1]?.body.feature_id).toBe("agent_credits");
		expect(errors).not.toHaveBeenCalled();
		expect(events).toHaveBeenCalledTimes(1);
	});

	it("denies exhausted legacy credits and rejects a missing billing owner", async () => {
		allowed = false;
		expect(await ensureAgentCreditsAvailable(customerId)).toBe(false);
		await expect(getAgentBillingAccess(null)).rejects.toThrow("billing customer is unavailable");
		expect(requests).toHaveLength(2);
	});

	it.each([202, 500])("fails closed on native customer status %s even with a valid included flag", async (status) => {
		flags = { [DATABUNNY_CHAT.featureId]: included };
		customerStatus = status;
		await expect(getAgentBillingAccess(customerId)).rejects.toThrow();
		expect(requests).toHaveLength(1);
	});

	it.each([202, 500])("fails closed on native credit check status %s despite an allowed body", async (status) => {
		checkStatus = status;
		await expect(getAgentBillingAccess(customerId)).rejects.toThrow();
		expect(requests).toHaveLength(2);
	});

	it("rejects a customer identity mismatch before interpreting its flag", async () => {
		flags = { [DATABUNNY_CHAT.featureId]: included };
		responseCustomerId = "another-customer";
		await expect(getAgentBillingAccess(customerId)).rejects.toThrow("customer could not be verified");
		expect(requests).toHaveLength(1);
	});

	it("does not use an unrelated balance as legacy credit permission", async () => {
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
		await expect(trackAgentUsageAndBill({ billingCustomerId: customerId, billingAccess: { allowed: true, customerId: "another-customer", includedChat: true }, modelId: "openai/gpt-5.6-luna", source: "slack", usage })).rejects.toThrow("another customer");
		expect(events).toHaveBeenCalledTimes(1);
		expect(requests).toHaveLength(0);
	});
});
