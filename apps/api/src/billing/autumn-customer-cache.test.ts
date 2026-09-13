import type { JSONValue } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cache, getSession, getMemberRole, getBillingCustomerId } = vi.hoisted(
	() => {
		const values = new Map<string, string>();
		return {
			cache: {
				values,
				get: vi.fn(async (key: string) => values.get(key) ?? null),
				setex: vi.fn(async (key: string, _ttl: number, value: string) => {
					values.set(key, value);
				}),
				del: vi.fn(async (key: string) => values.delete(key)),
			},
			getSession: vi.fn(),
			getMemberRole: vi.fn(),
			getBillingCustomerId: vi.fn(),
		};
	}
);

vi.mock("@databuddy/auth", () => ({
	auth: { api: { getSession } },
}));
vi.mock("@databuddy/redis", () => ({ getRedisCache: () => cache }));
vi.mock("@databuddy/rpc", () => ({
	getBillingCustomerId,
	getMemberRole,
}));

import { handleAutumnRequest } from "./autumn";

const providerRequests: JSONValue[] = [];

function customer(expanded: boolean) {
	return {
		id: "synthetic-owner",
		name: "Synthetic owner",
		email: null,
		created_at: 1,
		fingerprint: null,
		stripe_id: null,
		env: "sandbox",
		metadata: {},
		send_email_receipts: false,
		billing_controls: {},
		subscriptions: [
			{
				id: "synthetic-subscription",
				plan_id: "intelligence",
				auto_enable: false,
				add_on: false,
				status: "active",
				past_due: false,
				canceled_at: null,
				expires_at: null,
				trial_ends_at: null,
				started_at: 1,
				current_period_start: 1,
				current_period_end: 2,
				quantity: 1,
				...(expanded
					? {
							plan: {
								id: "intelligence",
								name: "Business",
								description: "Synthetic complimentary subscription",
								group: "main",
								version: 1,
								add_on: false,
								auto_enable: false,
								price: { amount: 0, interval: "month" },
								items: [],
								created_at: 1,
								env: "sandbox",
								archived: false,
								base_variant_id: null,
								config: {},
							},
						}
					: {}),
			},
		],
		purchases: [],
		balances: {},
		flags: {},
	};
}

function request(body: JSONValue = {}) {
	return new Request("https://synthetic.invalid/getOrCreateCustomer", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	cache.values.clear();
	providerRequests.length = 0;
	vi.stubEnv("AUTUMN_SECRET_KEY", "am_sk_test_synthetic");
	getSession.mockResolvedValue({
		user: { id: "synthetic-user", name: "Synthetic user", email: null },
		session: { activeOrganizationId: "synthetic-org" },
	});
	getMemberRole.mockResolvedValue("owner");
	getBillingCustomerId.mockResolvedValue("synthetic-owner");
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
			const outgoing = new Request(input, init);
			expect(outgoing.url).toBe(
				"https://api.useautumn.com/v1/customers.get_or_create"
			);
			const body: { customer_id: string; expand?: string[] } =
				await outgoing.json();
			providerRequests.push(body);
			return Response.json(
				customer(body.expand?.includes("subscriptions.plan") ?? false)
			);
		})
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe("native Autumn customer response caching", () => {
	it("bypasses a warm plain cache for the attached custom plan price", async () => {
		const plain = await handleAutumnRequest(request());
		expect(plain.status).toBe(200);
		expect((await plain.json()).subscriptions[0].plan).toBeUndefined();
		await handleAutumnRequest(request());
		expect(providerRequests).toHaveLength(1);

		// Native useCustomer sends expand at the top level of its POST JSON body.
		const expand = ["invoices", "payment_method", "subscriptions.plan"];
		const response = await handleAutumnRequest(request({ expand }));
		expect(response.status).toBe(200);
		const result = await response.json();
		expect(result.id).toBe("synthetic-owner");
		expect(result.subscriptions[0].plan.price.amount).toBe(0);
		expect(result.subscriptions[0].plan.price.amount).not.toBe(299);
		expect(providerRequests).toEqual([
			{
				customer_id: "synthetic-owner",
				name: "Synthetic user",
				email: null,
				expand: ["balances.feature"],
			},
			{
				customer_id: "synthetic-owner",
				name: "Synthetic user",
				email: null,
				expand: [...expand, "balances.feature"],
			},
		]);
		expect(cache.setex).toHaveBeenCalledTimes(1);
		expect(cache.del).not.toHaveBeenCalled();

		const cached = await handleAutumnRequest(request());
		expect((await cached.json()).subscriptions[0].plan).toBeUndefined();
		expect(providerRequests).toHaveLength(2);
	});

	it("does not put an expanded response into the plain cache", async () => {
		await handleAutumnRequest(request({ expand: ["subscriptions.plan"] }));
		expect(cache.get).not.toHaveBeenCalled();
		expect(cache.setex).not.toHaveBeenCalled();
		const plain = await handleAutumnRequest(request());
		expect((await plain.json()).subscriptions[0].plan).toBeUndefined();
		expect(providerRequests).toHaveLength(2);
		expect(cache.setex).toHaveBeenCalledTimes(1);
	});

	it.each(["anonymous", "member"])(
		"retains native authorization for an expanded %s request",
		async (principal) => {
			await handleAutumnRequest(request());
			if (principal === "anonymous") {
				getSession.mockResolvedValue(null);
			} else {
				getMemberRole.mockResolvedValue("member");
			}
			const response = await handleAutumnRequest(
				request({ expand: ["subscriptions.plan"] })
			);
			expect(response.status).toBe(401);
			expect(providerRequests).toHaveLength(1);
		}
	);

	it("uses the authenticated billing owner rather than a supplied identity", async () => {
		const response = await handleAutumnRequest(
			request({
				customerId: "different-customer",
				expand: ["subscriptions.plan"],
			})
		);
		expect(response.status).toBe(200);
		expect(providerRequests).toEqual([
			{
				customer_id: "synthetic-owner",
				name: "Synthetic user",
				email: null,
				expand: ["subscriptions.plan", "balances.feature"],
			},
		]);
		expect(getBillingCustomerId).toHaveBeenCalledWith(
			"synthetic-user",
			"synthetic-org"
		);
	});
});
