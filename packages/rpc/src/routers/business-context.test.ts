import { afterAll, beforeAll, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { createProcedureClient, ORPCError } from "@orpc/server";
import type { OrganizationBusinessContext } from "@databuddy/shared/organization-business-context";
import type { Context } from "../orpc";

process.env.REDIS_URL ??= "redis://127.0.0.1:16554";
let role = "owner";
let queueFails = false;
let conflict = false;
let state: OrganizationBusinessContext;
const originalEnv = {
	AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
	FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
	AUTUMN_SECRET_KEY: process.env.AUTUMN_SECRET_KEY,
	NODE_ENV: process.env.NODE_ENV,
};
let fixed = true;
let allowed = true;
let customerId = "owner-one";
let responseCustomerId = "owner-one";
let checkCustomerId = "owner-one";
let billingStatus = 200;
let checkStatus = 200;
const billingRequests: { path: string; body: Record<string, unknown> }[] = [];
const transport = spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
	const request = input instanceof Request ? input : new Request(input, init);
	const url = new URL(request.url);
	expect(url.origin).toBe("https://api.useautumn.com");
	const body = request.method === "GET" ? {} : await request.json();
	billingRequests.push({ path: url.pathname, body });
	const balance = {
		feature_id: fixed ? "investigation_runs" : "agent_credits",
		granted: 0,
		remaining: 0,
		usage: 0,
		unlimited: false,
		overage_allowed: allowed,
		max_purchase: null,
		next_reset_at: null,
	};
	if (url.pathname === "/v1/customers.get") {
		return Response.json({
			id: responseCustomerId, name: null, email: null, fingerprint: null,
			stripe_id: null, env: "sandbox", created_at: 0, metadata: {},
			send_email_receipts: false, subscriptions: [], purchases: [], flags: {},
			billing_controls: {}, balances: fixed ? { investigation_runs: balance } : {},
		}, { status: billingStatus });
	}
	expect(url.pathname).toBe("/v1/balances.check");
	expect(body).not.toHaveProperty("send_event");
	expect(body).not.toHaveProperty("lock");
	return Response.json({ allowed, customer_id: checkCustomerId, balance, flag: null }, { status: checkStatus });
});
const reads = mock(async () => state);
const saves = mock(async () => state);
const cancels = mock(async () => state);
const restores = mock(async () => state);
const audits = mock(async (..._args: unknown[]) => undefined);
const queued = mock(async () => {
	if (queueFails) throw new Error("Synthetic queue unavailable");
	return { id: "synthetic-job" };
});
let router: typeof import("./business-context").businessContextRouter;
const generation = {
	id: "11111111-1111-4111-8111-111111111111",
	websiteId: "site-one",
	domain: "example.com",
	requestedBy: "owner-one",
	requestedAt: "2026-09-08T00:00:00.000Z",
	baseRevision: 0,
	status: "queued" as const,
	draft: null,
	error: null,
};

beforeAll(async () => {
	const realDb = await import("@databuddy/db");
	const service = await import(
		"@databuddy/services/organization-business-context"
	);
	const chain = {
		from: () => chain,
		where: () => chain,
		orderBy: async () => [
			{ id: "site-one", name: null, domain: "example.com" },
		],
	};
	mock.module("@databuddy/db", () => ({
		...realDb,
		db: { select: () => chain },
	}));
	mock.module("@databuddy/services/organization-business-context", () => ({
		...service,
		readOrganizationBusinessContext: reads,
		cancelBusinessContextGeneration: cancels,
		restoreOrganizationBusinessProfile: restores,
		saveOrganizationBusinessProfile: async () => {
			if (conflict)
				throw new service.BusinessContextError(
					"CONFLICT",
					"Saved context changed"
				);
			return saves();
		},
		beginBusinessContextGeneration: async () => {
			state.generation = { ...generation };
			return state;
		},
		markBusinessContextGeneration: async () => {
			state.generation = {
				...generation,
				status: "failed",
				error: "Could not start",
			};
			return state;
		},
	}));
	const realRedis = await import("@databuddy/redis");
	mock.module("@databuddy/redis", () => ({
		...realRedis,
		getInsightsQueue: () => ({ add: queued }),
	}));
	mock.module("@databuddy/redis/rate-limit", () => ({
		ratelimit: async () => ({ success: true }),
	}));
	mock.module("../procedures/with-workspace", () => ({
		withWorkspace: async (
			_context: unknown,
			options: { organizationId: string; permissions: string[] }
		) => {
			if (
				options.organizationId !== "org-one" ||
				(role === "member" && options.permissions.includes("update"))
			) {
				throw new ORPCError("FORBIDDEN");
			}
			return { role, organizationId: "org-one" };
		},
	}));
	const auditService = await import("@databuddy/services/audit");
    mock.module("@databuddy/services/audit", () => ({ ...auditService, appendAuditEvent: audits }));
	const organizationUtils = await import("../utils/organization");
	mock.module("../utils/organization", () => ({
		...organizationUtils,
		getOrganizationOwnerId: async () => customerId || null,
	}));
	({ businessContextRouter: router } = await import("./business-context"));
});

beforeEach(() => {
	process.env.AI_GATEWAY_API_KEY = "synthetic-model-key";
	process.env.FIRECRAWL_API_KEY = "synthetic-scraper-key";
	process.env.AUTUMN_SECRET_KEY = "synthetic-native-transport-only";
	process.env.NODE_ENV = "test";
	fixed = true;
	allowed = true;
	customerId = "owner-one";
	responseCustomerId = "owner-one";
	checkCustomerId = "owner-one";
	billingStatus = 200;
	checkStatus = 200;
	billingRequests.length = 0;
	state = { profile: null, generation: null };
	role = "owner";
	queueFails = false;
	conflict = false;
	reads.mockClear();
	saves.mockClear();
	cancels.mockClear();
	restores.mockClear();
	audits.mockClear();
	queued.mockClear();
});

afterAll(() => {
	transport.mockRestore();
	for (const [key, value] of Object.entries(originalEnv)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

function context(): Context {
	return {
		db: {},
	headers: new Headers(),
		organizationId: "org-one",
		user: {
			id: "owner-one",
			name: "Synthetic owner",
			email: "owner@example.com",
		},
		session: { activeOrganizationId: "org-one" },
	} as Context;
}

test("reading is permission-scoped and never generates or saves", async () => {
	const read = createProcedureClient(router.get, { path: ["businessContext", "get"], context: context() });
	const result = await read({ organizationId: "org-one" });
	expect(result.websites[0]?.name).toBe("example.com");
	expect(result.canEdit).toBe(true);
	expect(queued).not.toHaveBeenCalled();
	expect(saves).not.toHaveBeenCalled();
	await expect(read({ organizationId: "org-other" })).rejects.toMatchObject({
		code: "FORBIDDEN",
	});
	expect(reads).toHaveBeenCalledTimes(1);
});

test("members can read but cannot edit or generate", async () => {
	role = "member";
	expect(
		(
			await createProcedureClient(router.get, { path: ["businessContext", "get"], context: context() })({
				organizationId: "org-one",
			})
		).canEdit
	).toBe(false);
	await expect(
		createProcedureClient(router.save, { path: ["businessContext", "save"], context: context() })({
			organizationId: "org-one",
			revision: 0,
			content: "Attempted edit",
		})
	).rejects.toMatchObject({ code: "FORBIDDEN" });
	await expect(
		createProcedureClient(router.generate, { path: ["businessContext", "generate"], context: context() })({
			organizationId: "org-one",
			websiteId: "site-one",
		})
	).rejects.toMatchObject({ code: "FORBIDDEN" });
	expect(saves).not.toHaveBeenCalled();
	expect(queued).not.toHaveBeenCalled();
});

test("unauthenticated requests cannot read business context", async () => {
	const anonymous = { ...context(), user: null, session: null };
	await expect(
		createProcedureClient(router.get, { path: ["businessContext", "get"], context: anonymous })({
			organizationId: "org-one",
		})
	).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	expect(reads).not.toHaveBeenCalled();
});

test("save conflicts preserve their recoverable 409 response", async () => {
	conflict = true;
	await expect(
		createProcedureClient(router.save, { path: ["businessContext", "save"], context: context() })({
			organizationId: "org-one",
			revision: 1,
			content: "My draft",
		})
	).rejects.toMatchObject({
		code: "CONFLICT",
		message: "Saved context changed",
	});
	expect(queued).not.toHaveBeenCalled();
});

test("generation uses a stable job ID and a single attempt", async () => {
	await createProcedureClient(router.generate, { path: ["businessContext", "generate"], context: context() })({
		organizationId: "org-one",
		websiteId: "site-one",
	});
	expect(queued).toHaveBeenCalledWith(
		"insights-business-context",
		{ organizationId: "org-one", generationId: generation.id },
		{ jobId: `business-context-${generation.id}`, attempts: 1 }
	);
});

test("queue failures become an actionable generation failure", async () => {
	queueFails = true;
	await expect(
		createProcedureClient(router.generate, { path: ["businessContext", "generate"], context: context() })({
			organizationId: "org-one",
			websiteId: "site-one",
		})
	).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	expect(state.generation?.status).toBe("failed");
	expect(state.profile).toBeNull();
});


test("save and restore record the actor, target organization and outcome without brief text", async () => {
    const owner = { ...context(), organizationId: "different-active-org" };
    await createProcedureClient(router.save, { path: ["businessContext", "save"], context: owner })({ organizationId: "org-one", revision: 0, content: "Private team definitions" });
    expect(audits.mock.calls.at(-1)).toMatchObject([{}, "org-one", {
        action: { action: "business_context.updated" }, actor: { type: "user", id: "owner-one" }, outcome: "success", operation: "businessContext.save"
    }]);
    expect(JSON.stringify(audits.mock.calls)).not.toContain("Private team definitions");
    await createProcedureClient(router.restore, { path: ["businessContext", "restore"], context: owner })({ organizationId: "org-one", revision: 2, restoreRevision: 1 });
    expect(audits.mock.calls.at(-1)?.[2]).toMatchObject({ action: { action: "business_context.restored" }, outcome: "success" });
});

test("denied writes and revision conflicts are audited with the authorized organization", async () => {
    role = "member";
    const member = { ...context(), organizationId: "different-active-org" };
    await expect(createProcedureClient(router.cancel, { path: ["businessContext", "cancel"], context: member })({ organizationId: "org-one", generationId: generation.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createProcedureClient(router.restore, { path: ["businessContext", "restore"], context: member })({ organizationId: "org-one", revision: 2, restoreRevision: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(cancels).not.toHaveBeenCalled();
    expect(restores).not.toHaveBeenCalled();
    expect(audits.mock.calls.at(-1)).toMatchObject([{}, "org-one", { outcome: "denied", reason: "FORBIDDEN" }]);
    role = "owner";
    conflict = true;
    await expect(createProcedureClient(router.save, { path: ["businessContext", "save"], context: context() })({ organizationId: "org-one", revision: 1, content: "Private conflicting draft" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(audits.mock.calls.at(-1)?.[2]).toMatchObject({ outcome: "failure", reason: "CONFLICT" });
});

function access() {
	return createProcedureClient(router.generationAccess, {
		path: ["businessContext", "generationAccess"], context: context(),
	})({ organizationId: "org-one" });
}

test.each([true, false])("preflight checks the native %s entitlement without charging", async (isFixed) => {
	fixed = isFixed;
	expect(await access()).toMatchObject({ status: "allowed", billingMode: fixed ? "fixed" : "legacy", action: "generate" });
	expect(billingRequests.at(-1)).toEqual({ path: "/v1/balances.check", body: {
		customer_id: "owner-one", feature_id: fixed ? "investigation_runs" : "agent_credits",
		required_balance: fixed ? 1 : 0.01,
	} });
	expect(billingRequests).toHaveLength(2);
	expect(queued).not.toHaveBeenCalled();
});

test.each([true, false])("a denied %s allowance is actionable and blocks generation before state changes", async (isFixed) => {
	fixed = isFixed;
	allowed = false;
	expect(await access()).toMatchObject({ status: "credits-required", billingMode: fixed ? "fixed" : "legacy", action: "billing" });
	await expect(createProcedureClient(router.generate, { context: context() })({ organizationId: "org-one", websiteId: "site-one" })).rejects.toMatchObject({ code: "PAYMENT_REQUIRED" });
	expect(state.generation).toBeNull();
	expect(queued).not.toHaveBeenCalled();
	expect(reads).not.toHaveBeenCalled();
});

test("generation rechecks an earlier successful preflight", async () => {
	expect((await access()).status).toBe("allowed");
	allowed = false;
	await expect(createProcedureClient(router.generate, { context: context() })({ organizationId: "org-one", websiteId: "site-one" })).rejects.toMatchObject({ code: "PAYMENT_REQUIRED" });
	expect(queued).not.toHaveBeenCalled();
});

test("read-only and unauthorized callers cannot inspect billing", async () => {
	role = "member";
	expect(await access()).toMatchObject({ status: "read-only", billingMode: null, action: "contact-admin" });
	await expect(createProcedureClient(router.generationAccess, { context: context() })({ organizationId: "org-other" })).rejects.toMatchObject({ code: "FORBIDDEN" });
	expect(billingRequests).toEqual([]);
});

test.each([202, 500])("unconfirmed billing (%s) cannot authorize generation or block manual editing", async (status) => {
	billingStatus = status;
	expect(await access()).toMatchObject({ status: "unavailable", billingMode: null, action: "retry" });
	await expect(createProcedureClient(router.generate, { context: context() })({ organizationId: "org-one", websiteId: "site-one" })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
	const requestsBeforeEditing = billingRequests.length;
	await createProcedureClient(router.get, { context: context() })({ organizationId: "org-one" });
	await createProcedureClient(router.save, { path: ["businessContext", "save"], context: context() })({ organizationId: "org-one", revision: 0, content: "Manual context" });
	expect(saves).toHaveBeenCalledTimes(1);
	expect(billingRequests).toHaveLength(requestsBeforeEditing);
	expect(queued).not.toHaveBeenCalled();
});

test.each([202, 500])("an unconfirmed allowance check (%s) is unavailable", async (status) => {
	checkStatus = status;
	expect((await access()).status).toBe("unavailable");
});

test("missing or mismatched billing identities fail closed", async () => {
	customerId = "";
	expect((await access()).status).toBe("unavailable");
	expect(billingRequests).toEqual([]);
	customerId = "owner-one";
	responseCustomerId = "another-owner";
	expect((await access()).status).toBe("unavailable");
	expect(billingRequests).toHaveLength(1);
	responseCustomerId = "owner-one";
	checkCustomerId = "another-owner";
	expect((await access()).status).toBe("unavailable");
});

test.each(["AI_GATEWAY_API_KEY", "FIRECRAWL_API_KEY"])("missing %s disables generation without checking billing", async (key) => {
	delete process.env[key];
	expect(await access()).toMatchObject({ status: "not-configured", action: "contact-admin" });
	expect(billingRequests).toEqual([]);
});

test("unconfigured billing preserves the worker's local policy and fails closed in production", async () => {
	delete process.env.AUTUMN_SECRET_KEY;
	expect(await access()).toMatchObject({ status: "allowed", billingMode: null });
	process.env.NODE_ENV = "production";
	expect(await access()).toMatchObject({ status: "not-configured", billingMode: null });
	expect(billingRequests).toEqual([]);
});
