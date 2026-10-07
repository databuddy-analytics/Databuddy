import { afterAll, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { createProcedureClient } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import type { Context } from "../orpc";

mock.module("@databuddy/auth", () => ({
	auth: { api: { getSession: async () => null } },
}));
mock.module("@databuddy/api-keys/resolve", () => ({
	getApiKeyFromHeader: async () => null,
}));
mock.module("@databuddy/db", () => ({ db: {} }));
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
		expect(url.pathname).toBe("/v1/customers.get_or_create");
		expect(await request.json()).toMatchObject({
			customer_id: "owner-example",
		});
		return Response.json({}, { status });
	},
	{ preconnect: globalThis.fetch.preconnect }
);
const transport = spyOn(globalThis, "fetch").mockImplementation(fetcher);

const { billingRouter } = await import("./billing");
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
