import { afterAll, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { createProcedureClient } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import type { Context } from "../orpc";
import { BillingUnavailableError } from "@databuddy/shared/billing";

mock.module("@databuddy/auth", () => ({
	auth: { api: { getSession: async () => null } },
}));
mock.module("@databuddy/api-keys/resolve", () => ({
	getApiKeyFromHeader: async () => null,
}));
const database = { ...(await import("@databuddy/db")), db: {} };
mock.module("@databuddy/db", () => database);
mock.module("@databuddy/services/audit", () => ({
	appendAuditEvent: async () => undefined,
	appendAuditEventInTransaction: async () => undefined,
}));
mock.module("../utils/organization", () => ({
	getOrganizationOwnerId: async () => "owner-example",
}));
mock.module("../utils/billing", () => ({
	getBillingOwner: async () => ({
		customerId: "owner-example",
		canUserUpgrade: true,
	}),
}));
mock.module("../procedures/with-workspace", () => ({
	withWorkspace: async () => ({ organizationId: "org-example", role: "admin" }),
	withPublicWorkspace: async () => ({
		organizationId: "org-example",
		role: "admin",
	}),
}));
mock.module("../lib/logger", () => ({
	logger: {
		error: () => undefined,
		info: () => undefined,
		warn: () => undefined,
	},
}));
mock.module("@databuddy/db/clickhouse", () => ({
	EXCLUDE_IMPORTED_ROWS: "NOT startsWith(anonymous_id, 'imp_')",
	chQuery: () => {
		throw new Error("Unexpected analytics query");
	},
}));

let status = 202;
const requests: string[] = [];
const originalSecret = process.env.AUTUMN_SECRET_KEY;
const fetcher = Object.assign(
	async (
		input: Parameters<typeof fetch>[0],
		init?: Parameters<typeof fetch>[1]
	) => {
		const request = input instanceof Request ? input : new Request(input, init);
		const url = new URL(request.url);
		requests.push(url.pathname);
		expect(url.origin).toBe("https://api.useautumn.com");
		expect(["/v1/customers.get_or_create", "/v1/balances.check"]).toContain(
			url.pathname
		);
		expect(await request.json()).toMatchObject({
			customer_id: "owner-example",
		});
		if (url.pathname === "/v1/balances.check" && status === 200) {
			return Response.json({
				allowed: true,
				customer_id: "owner-example",
				flag: null,
				balance: {
					feature_id: "events",
					usage: 25,
					granted: 100,
					remaining: 75,
					unlimited: false,
					overage_allowed: false,
					max_purchase: null,
					next_reset_at: null,
				},
			});
		}
		return Response.json({}, { status });
	},
	{ preconnect: globalThis.fetch.preconnect }
);
const transport = spyOn(globalThis, "fetch").mockImplementation(fetcher);

const { billingRouter } = await import("./billing");
const { organizationsRouter } = await import("./organizations");
const context = {
	user: { id: "admin", email: "admin@example.com", name: "Admin" },
	session: { activeOrganizationId: "org-example" },
	organizationId: "org-example",
	headers: new Headers(),
	db: {},
} as Context;
const input = {
	featureId: "investigation_runs" as const,
	enabled: true,
	overageLimit: 50,
};
const setLimit = createProcedureClient(billingRouter.setSpendLimit, {
	path: ["billing", "setSpendLimit"],
	context,
});
const handler = new RPCHandler({ billing: billingRouter });

beforeEach(() => {
	process.env.AUTUMN_SECRET_KEY = "synthetic-native-transport-only";
	requests.length = 0;
});

afterAll(() => {
	transport.mockRestore();
	if (originalSecret === undefined) {
		Reflect.deleteProperty(process.env, "AUTUMN_SECRET_KEY");
	} else {
		process.env.AUTUMN_SECRET_KEY = originalSecret;
	}
});

test.each([
	202, 500,
])("billing outages (%s) cross the real session middleware as HTTP 503", async (responseStatus) => {
	status = responseStatus;
	await expect(setLimit(input)).rejects.toMatchObject({
		code: "SERVICE_UNAVAILABLE",
		status: 503,
	});
	const result = await handler.handle(
		new Request("http://localhost/rpc/billing/setSpendLimit", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ json: input }),
		}),
		{ prefix: "/rpc", context }
	);
	expect(result.matched).toBe(true);
	expect(result.response?.status).toBe(503);
	expect(requests).toEqual([
		"/v1/customers.get_or_create",
		"/v1/customers.get_or_create",
	]);
});

test("usage shows owner outages and recovers without inventing permissions", async () => {
	const owner: NonNullable<Awaited<ReturnType<Context["getBilling"]>>> = {
		customerId: "owner-example",
		canUserUpgrade: false,
		isOrganization: true,
		planId: "free",
	};
	const lookup = mock(async () => owner);
	lookup.mockRejectedValueOnce(
		new BillingUnavailableError("SYNTHETIC_OWNER_DOWN")
	);
	const usageContext = { ...context, getBilling: lookup };
	const usage = createProcedureClient(organizationsRouter.getUsage, {
		context: usageContext,
	});
	const usageHandler = new RPCHandler({ organizations: organizationsRouter });
	const result = await usageHandler.handle(
		new Request("http://localhost/rpc/organizations/getUsage", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ json: {} }),
		}),
		{ prefix: "/rpc", context: usageContext }
	);
	expect(result.response?.status).toBe(200);
	expect(await result.response?.json()).toEqual({
		json: { unavailable: true },
	});
	expect(requests).toEqual([]);

	status = 500;
	await expect(usage()).resolves.toEqual({
		unavailable: true,
		isOrganizationUsage: true,
		canUserUpgrade: false,
	});
	status = 200;
	const recovered = await usage();
	expect(recovered).toMatchObject({
		used: 25,
		limit: 100,
		remaining: 75,
		canUserUpgrade: false,
		isOrganizationUsage: true,
	});
	expect(recovered).not.toHaveProperty("unavailable");
});

test("usage preserves unexpected owner errors", async () => {
	const error = new Error("SYNTHETIC_UNEXPECTED_OWNER_FAILURE");
	const usage = createProcedureClient(organizationsRouter.getUsage, {
		context: {
			...context,
			getBilling: async () => {
				throw error;
			},
		},
	});
	await expect(usage()).rejects.toBe(error);
});
