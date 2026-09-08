import { beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { createProcedureClient, ORPCError } from "@orpc/server";
import type { OrganizationBusinessContext } from "@databuddy/shared/organization-business-context";
import type { Context } from "../orpc";

process.env.REDIS_URL ??= "redis://127.0.0.1:16554";
let role = "owner";
let queueFails = false;
let conflict = false;
let state: OrganizationBusinessContext;
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
	({ businessContextRouter: router } = await import("./business-context"));
});

beforeEach(() => {
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
