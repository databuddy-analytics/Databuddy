import {
	afterAll,
	beforeAll,
	beforeEach,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import { createProcedureClient, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import type { OrganizationBusinessContext } from "@databuddy/shared/organization-business-context";
import type { Context } from "../orpc";

process.env.REDIS_URL ??= "redis://localhost:6379";
let role = "owner";
let runnerWaits = false;
let runnerFails = false;
let runnerSettlement: Promise<void> | undefined;
let runnerSignal: AbortSignal | undefined;
let runnerEntered = Promise.withResolvers<void>();
let admissionGate: Promise<void> | undefined;
let admissionEntered = Promise.withResolvers<void>();
let cleanupFinished = Promise.withResolvers<void>();
let conflict = false;
let state: OrganizationBusinessContext;
const originalEnv = {
	AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
	CONTEXT_DEV_API_KEY: process.env.CONTEXT_DEV_API_KEY,
	AUTUMN_SECRET_KEY: process.env.AUTUMN_SECRET_KEY,
	NODE_ENV: process.env.NODE_ENV,
};
let allowed = true;
const savedProfile: NonNullable<OrganizationBusinessContext["profile"]> = {
	content: "Saved context",
	sources: [],
	origin: "team",
	revision: 1,
	updatedAt: "2026-09-16T00:00:00.000Z",
	updatedBy: "owner-one",
	sourceWebsiteId: null,
};
let customerId = "owner-one";
let checkCustomerId = "owner-one";
let checkStatus = 200;
const billingRequests: { path: string; body: Record<string, unknown> }[] = [];
const nativeFetch = globalThis.fetch;
const transport = spyOn(globalThis, "fetch").mockImplementation(
	async (input, init) => {
		const request = input instanceof Request ? input : new Request(input, init);
		const url = new URL(request.url);
		expect(url.origin).toBe("https://api.useautumn.com");
		const body = request.method === "GET" ? {} : await request.json();
		billingRequests.push({ path: url.pathname, body });
		const balance = {
			feature_id: "agent_credits",
			granted: 0,
			remaining: 0,
			usage: 0,
			unlimited: false,
			overage_allowed: allowed,
			max_purchase: null,
			next_reset_at: null,
		};
		expect(url.pathname).toBe("/v1/balances.check");
		expect(body).not.toHaveProperty("send_event");
		expect(body).not.toHaveProperty("lock");
		return Response.json(
			{ allowed, customer_id: checkCustomerId, balance, flag: null },
			{ status: checkStatus }
		);
	}
);
const reads = mock(async () => state);
const saves = mock(async () => state);
const cancels = mock(
	async (input: { generationId: string; activeOnly?: boolean }) => {
		if (
			state.generation?.id === input.generationId &&
			(!input.activeOnly || state.generation.status === "running")
		) {
			state = { ...state, generation: null };
		}
		cleanupFinished.resolve();
		return state;
	}
);
const restores = mock(async () => state);
const audits = mock(async (..._args: unknown[]) => undefined);
const generates = mock(async function* (input: {
	signal?: AbortSignal;
}): AsyncGenerator<OrganizationBusinessContext, void, void> {
	runnerSignal = input.signal;
	runnerEntered.resolve();
	if (runnerWaits) {
		await new Promise<void>((resolve) => {
			if (input.signal?.aborted) {
				resolve();
			} else {
				input.signal?.addEventListener("abort", () => resolve(), {
					once: true,
				});
			}
		});
		await runnerSettlement;
		return;
	}
	state = {
		...state,
		generation: {
			...generation,
			progress: { stage: "writing", content: "## Partial draft" },
		},
	};
	yield state;
	state = {
		...state,
		generation: runnerFails
			? { ...generation, status: "failed", error: "Source unavailable" }
			: {
					...generation,
					status: "ready",
					draft: { content: "Complete draft", sources: [] },
				},
	};
	yield state;
});
let router: typeof import("./business-context").businessContextRouter;
const generation = {
	id: "11111111-1111-4111-8111-111111111111",
	websiteId: "site-one",
	domain: "example.com",
	requestedBy: "owner-one",
	requestedAt: "2026-09-08T00:00:00.000Z",
	baseRevision: 0,
	status: "running" as const,
	progress: { stage: "reading" as const },
	draft: null,
	error: null,
};
const begins = mock(async (_input: Record<string, unknown>) => {
	admissionEntered.resolve();
	await admissionGate;
	state.generation = { ...generation };
	return state;
});

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
			if (conflict) {
				throw new service.BusinessContextError(
					"CONFLICT",
					"Saved context changed"
				);
			}
			return saves();
		},
		beginBusinessContextGeneration: begins,
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
	mock.module("@databuddy/services/audit", () => ({
		...auditService,
		appendAuditEvent: audits,
	}));
	const organizationUtils = await import("../utils/organization");
	mock.module("../utils/organization", () => ({
		...organizationUtils,
		getOrganizationOwnerId: async () => customerId || null,
	}));
	({ businessContextRouter: router } = await import("./business-context"));
}, 30_000);

beforeEach(() => {
	process.env.AI_GATEWAY_API_KEY = "synthetic-model-key";
	process.env.CONTEXT_DEV_API_KEY = "synthetic-scraper-key";
	process.env.AUTUMN_SECRET_KEY = "synthetic-native-transport-only";
	process.env.NODE_ENV = "test";
	allowed = true;
	customerId = "owner-one";
	checkCustomerId = "owner-one";
	checkStatus = 200;
	billingRequests.length = 0;
	state = { profile: savedProfile, generation: null };
	role = "owner";
	runnerWaits = false;
	runnerFails = false;
	runnerSettlement = undefined;
	runnerSignal = undefined;
	runnerEntered = Promise.withResolvers<void>();
	admissionGate = undefined;
	admissionEntered = Promise.withResolvers<void>();
	cleanupFinished = Promise.withResolvers<void>();
	conflict = false;
	reads.mockClear();
	saves.mockClear();
	cancels.mockClear();
	restores.mockClear();
	audits.mockClear();
	generates.mockClear();
	begins.mockClear();
});

afterAll(() => {
	transport.mockRestore();
	for (const [key, value] of Object.entries(originalEnv)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
});

function context(): Context {
	return {
		generateBusinessContext: generates,
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
	const read = createProcedureClient(router.get, {
		path: ["businessContext", "get"],
		context: context(),
	});
	const result = await read({ organizationId: "org-one" });
	expect(result.websites[0]?.name).toBe("example.com");
	expect(result.canEdit).toBe(true);
	expect(generates).not.toHaveBeenCalled();
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
			await createProcedureClient(router.get, {
				path: ["businessContext", "get"],
				context: context(),
			})({
				organizationId: "org-one",
			})
		).canEdit
	).toBe(false);
	await expect(
		createProcedureClient(router.save, {
			path: ["businessContext", "save"],
			context: context(),
		})({
			organizationId: "org-one",
			revision: 0,
			content: "Attempted edit",
		})
	).rejects.toMatchObject({ code: "FORBIDDEN" });
	await expect(
		createProcedureClient(router.generate, {
			path: ["businessContext", "generate"],
			context: context(),
		})({
			organizationId: "org-one",
			websiteId: "site-one",
		})
	).rejects.toMatchObject({ code: "FORBIDDEN" });
	expect(saves).not.toHaveBeenCalled();
	expect(generates).not.toHaveBeenCalled();
});

test("unauthenticated requests cannot read business context", async () => {
	const anonymous = { ...context(), user: null, session: null };
	await expect(
		createProcedureClient(router.get, {
			path: ["businessContext", "get"],
			context: anonymous,
		})({
			organizationId: "org-one",
		})
	).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	expect(reads).not.toHaveBeenCalled();
});

test("save conflicts preserve their recoverable 409 response", async () => {
	conflict = true;
	await expect(
		createProcedureClient(router.save, {
			path: ["businessContext", "save"],
			context: context(),
		})({
			organizationId: "org-one",
			revision: 1,
			content: "My draft",
		})
	).rejects.toMatchObject({
		code: "CONFLICT",
		message: "Saved context changed",
	});
	expect(generates).not.toHaveBeenCalled();
});

test("generation streams progress and a reviewable draft without saving it", async () => {
	const stream = await createProcedureClient(router.generate, {
		context: context(),
	})({ organizationId: "org-one", websiteId: "site-one" });
	const snapshots = await Array.fromAsync(stream);
	expect(snapshots.map((snapshot) => snapshot.generation?.status)).toEqual([
		"running",
		"running",
		"ready",
	]);
	expect(snapshots[1]?.generation?.progress?.content).toBe("## Partial draft");
	expect(snapshots[2]?.generation?.draft?.content).toBe("Complete draft");
	expect(state.profile).toEqual(savedProfile);
	expect(state.generation?.status).toBe("ready");
	expect(generates).toHaveBeenCalledTimes(1);
	expect(saves).not.toHaveBeenCalled();
});

test("closing before the first event releases admission without starting the provider", async () => {
	const stream = await createProcedureClient(router.generate, {
		context: context(),
	})({ organizationId: "org-one", websiteId: "site-one" });
	await stream.return();
	expect(generates).not.toHaveBeenCalled();
	expect(state.generation).toBeNull();
	expect(cancels).toHaveBeenCalledWith({
		organizationId: "org-one",
		generationId: generation.id,
		activeOnly: true,
	});
});

test("closing a pending stream aborts provider work and releases only its active generation", async () => {
	runnerWaits = true;
	const stream = await createProcedureClient(router.generate, {
		context: context(),
	})({ organizationId: "org-one", websiteId: "site-one" });
	await stream.next();
	const pending = stream.next();
	await runnerEntered.promise;
	await stream.return();
	await pending;
	expect(runnerSignal?.aborted).toBe(true);
	expect(state.generation).toBeNull();
	expect(state.profile).toEqual(savedProfile);
});

test("disconnect releases the active run before consumed usage finishes settling", async () => {
	runnerWaits = true;
	const settlement = Promise.withResolvers<void>();
	runnerSettlement = settlement.promise;
	const stream = await createProcedureClient(router.generate, {
		context: context(),
	})({ organizationId: "org-one", websiteId: "site-one" });
	await stream.next();
	const pending = stream.next();
	await runnerEntered.promise;
	const closing = stream.return();
	try {
		await cleanupFinished.promise;
		expect(state.generation).toBeNull();
		expect(runnerSignal?.aborted).toBe(true);
	} finally {
		settlement.resolve();
		await closing;
		await pending;
	}
});

test("disconnect during admission clears a run committed after the HTTP client leaves", async () => {
	state = { profile: null, generation: null };
	const release = Promise.withResolvers<void>();
	admissionGate = release.promise;
	const disconnected = Promise.withResolvers<void>();
	const handler = new RPCHandler({ businessContext: router });
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			request.signal.addEventListener("abort", () => disconnected.resolve(), {
				once: true,
			});
			const result = await handler.handle(request, {
				prefix: "/rpc",
				context: context(),
			});
			return result.response ?? new Response(null, { status: 404 });
		},
	});
	const controller = new AbortController();
	try {
		const request = nativeFetch(
			new URL("/rpc/businessContext/generate", server.url),
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					json: { organizationId: "org-one", websiteId: "site-one" },
				}),
				signal: controller.signal,
			}
		).catch((error: Error) => error);
		await admissionEntered.promise;
		controller.abort();
		expect(await request).toBeInstanceOf(Error);
		await disconnected.promise;
		release.resolve();
		await cleanupFinished.promise;
		expect(state.generation).toBeNull();
		expect(generates).not.toHaveBeenCalled();
		expect(cancels).toHaveBeenCalledTimes(1);
	} finally {
		release.resolve();
		controller.abort();
		await server.stop(true);
	}
});

test("terminal provider failure remains available after stream cleanup", async () => {
	runnerFails = true;
	const stream = await createProcedureClient(router.generate, {
		context: context(),
	})({ organizationId: "org-one", websiteId: "site-one" });
	for await (const _snapshot of stream) {
		/* Consume the terminal failure. */
	}
	expect(state.generation).toMatchObject({
		status: "failed",
		error: "Source unavailable",
	});
	expect(state.profile).toEqual(savedProfile);
});

test("an active generation rejects duplicates before billing or provider work", async () => {
	state.generation = { ...generation };
	await expect(
		createProcedureClient(router.generate, { context: context() })({
			organizationId: "org-one",
			websiteId: "site-one",
		})
	).rejects.toMatchObject({ code: "CONFLICT" });
	expect(billingRequests).toEqual([]);
	expect(begins).not.toHaveBeenCalled();
	expect(generates).not.toHaveBeenCalled();
});

test("a host without a generator fails before admission", async () => {
	await expect(
		createProcedureClient(router.generate, {
			context: { ...context(), generateBusinessContext: undefined },
		})({ organizationId: "org-one", websiteId: "site-one" })
	).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
	expect(begins).not.toHaveBeenCalled();
});

test("save and restore record the actor, target organization and outcome without brief text", async () => {
	const owner = { ...context(), organizationId: "different-active-org" };
	await createProcedureClient(router.save, {
		path: ["businessContext", "save"],
		context: owner,
	})({
		organizationId: "org-one",
		revision: 0,
		content: "Private team definitions",
	});
	expect(audits.mock.calls.at(-1)).toMatchObject([
		{},
		"org-one",
		{
			action: { action: "business_context.updated" },
			actor: { type: "user", id: "owner-one" },
			outcome: "success",
			operation: "businessContext.save",
		},
	]);
	expect(JSON.stringify(audits.mock.calls)).not.toContain(
		"Private team definitions"
	);
	await createProcedureClient(router.restore, {
		path: ["businessContext", "restore"],
		context: owner,
	})({ organizationId: "org-one", revision: 2, restoreRevision: 1 });
	expect(audits.mock.calls.at(-1)?.[2]).toMatchObject({
		action: { action: "business_context.restored" },
		outcome: "success",
	});
});

test("denied writes and revision conflicts are audited with the authorized organization", async () => {
	role = "member";
	const member = { ...context(), organizationId: "different-active-org" };
	await expect(
		createProcedureClient(router.cancel, {
			path: ["businessContext", "cancel"],
			context: member,
		})({ organizationId: "org-one", generationId: generation.id })
	).rejects.toMatchObject({ code: "FORBIDDEN" });
	await expect(
		createProcedureClient(router.restore, {
			path: ["businessContext", "restore"],
			context: member,
		})({ organizationId: "org-one", revision: 2, restoreRevision: 1 })
	).rejects.toMatchObject({ code: "FORBIDDEN" });
	expect(cancels).not.toHaveBeenCalled();
	expect(restores).not.toHaveBeenCalled();
	expect(audits.mock.calls.at(-1)).toMatchObject([
		{},
		"org-one",
		{ outcome: "denied", reason: "FORBIDDEN" },
	]);
	role = "owner";
	conflict = true;
	await expect(
		createProcedureClient(router.save, {
			path: ["businessContext", "save"],
			context: context(),
		})({
			organizationId: "org-one",
			revision: 1,
			content: "Private conflicting draft",
		})
	).rejects.toMatchObject({ code: "CONFLICT" });
	expect(audits.mock.calls.at(-1)?.[2]).toMatchObject({
		outcome: "failure",
		reason: "CONFLICT",
	});
});

function access() {
	return createProcedureClient(router.generationAccess, {
		path: ["businessContext", "generationAccess"],
		context: context(),
	})({ organizationId: "org-one" });
}

test("the first draft is included without checking billing", async () => {
	state = { profile: null, generation: null };
	expect(await access()).toMatchObject({
		status: "allowed",
		action: "generate",
	});
	expect(billingRequests).toEqual([]);
	expect(generates).not.toHaveBeenCalled();
});

test("preflight checks agent credits without charging", async () => {
	expect(await access()).toMatchObject({
		status: "allowed",
		action: "generate",
	});
	expect(billingRequests).toEqual([
		{
			path: "/v1/balances.check",
			body: {
				customer_id: "owner-one",
				feature_id: "agent_credits",
				required_balance: 0.01,
			},
		},
	]);
	expect(generates).not.toHaveBeenCalled();
});

test("denied agent credits are actionable and block generation before state changes", async () => {
	allowed = false;
	expect(await access()).toMatchObject({
		status: "credits-required",
		action: "billing",
	});
	await expect(
		createProcedureClient(router.generate, { context: context() })({
			organizationId: "org-one",
			websiteId: "site-one",
		})
	).rejects.toMatchObject({ code: "PAYMENT_REQUIRED" });
	expect(state.generation).toBeNull();
	expect(generates).not.toHaveBeenCalled();
});

test("generation rechecks an earlier successful preflight", async () => {
	expect((await access()).status).toBe("allowed");
	allowed = false;
	await expect(
		createProcedureClient(router.generate, { context: context() })({
			organizationId: "org-one",
			websiteId: "site-one",
		})
	).rejects.toMatchObject({ code: "PAYMENT_REQUIRED" });
	expect(generates).not.toHaveBeenCalled();
});

test("read-only and unauthorized callers cannot inspect billing", async () => {
	role = "member";
	expect(await access()).toMatchObject({
		status: "read-only",
		action: "contact-admin",
	});
	await expect(
		createProcedureClient(router.generationAccess, { context: context() })({
			organizationId: "org-other",
		})
	).rejects.toMatchObject({ code: "FORBIDDEN" });
	expect(billingRequests).toEqual([]);
});

test.each([
	202, 500,
])("an unconfirmed credit check (%s) cannot authorize generation or block manual editing", async (status) => {
	checkStatus = status;
	expect(await access()).toMatchObject({
		status: "unavailable",
		action: "retry",
	});
	await expect(
		createProcedureClient(router.generate, { context: context() })({
			organizationId: "org-one",
			websiteId: "site-one",
		})
	).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
	const requestsBeforeEditing = billingRequests.length;
	await createProcedureClient(router.get, { context: context() })({
		organizationId: "org-one",
	});
	await createProcedureClient(router.save, {
		path: ["businessContext", "save"],
		context: context(),
	})({ organizationId: "org-one", revision: 1, content: "Manual context" });
	expect(saves).toHaveBeenCalledTimes(1);
	expect(billingRequests).toHaveLength(requestsBeforeEditing);
	expect(generates).not.toHaveBeenCalled();
});

test("missing or mismatched billing identities fail closed", async () => {
	customerId = "";
	expect((await access()).status).toBe("unavailable");
	expect(billingRequests).toEqual([]);
	customerId = "owner-one";
	checkCustomerId = "another-owner";
	expect((await access()).status).toBe("unavailable");
	expect(billingRequests).toHaveLength(1);
});

test.each([
	"AI_GATEWAY_API_KEY",
	"CONTEXT_DEV_API_KEY",
])("missing %s disables generation without checking billing", async (key) => {
	delete process.env[key];
	expect(await access()).toMatchObject({
		status: "not-configured",
		action: "contact-admin",
	});
	expect(billingRequests).toEqual([]);
});

test("unconfigured billing preserves the local billing policy and fails closed in production", async () => {
	delete process.env.AUTUMN_SECRET_KEY;
	expect(await access()).toMatchObject({ status: "allowed" });
	process.env.NODE_ENV = "production";
	expect(await access()).toMatchObject({ status: "not-configured" });
	expect(billingRequests).toEqual([]);
});

test("generation forwards selected public pages to the scope-validating service", async () => {
	const sourceUrls = [
		"https://docs.example.com/start",
		"https://example.com/pricing",
	];
	const stream = await createProcedureClient(router.generate, {
		context: context(),
	})({
		organizationId: "org-one",
		websiteId: "site-one",
		sourceUrls,
	});
	expect(begins).toHaveBeenCalledWith({
		organizationId: "org-one",
		websiteId: "site-one",
		requestedBy: "owner-one",
		sourceUrls,
	});
	await stream.return();
});

test("unsafe or excessive source pages are rejected before billing or generation", async () => {
	const generate = createProcedureClient(router.generate, {
		context: context(),
	});
	for (const sourceUrls of [
		["http://127.0.0.1/private"],
		["https://example.com/?token=secret"],
		Array.from(
			{ length: 7 },
			(_, index) => `https://example.com/page-${index}`
		),
	]) {
		await expect(
			generate({ organizationId: "org-one", websiteId: "site-one", sourceUrls })
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	}
	expect(billingRequests).toEqual([]);
	expect(begins).not.toHaveBeenCalled();
	expect(generates).not.toHaveBeenCalled();
});

test("self-hosted production requires AI setup and admin access, without Autumn", async () => {
	const original = process.env;
	process.env = { ...original, SELFHOST: "true", NODE_ENV: "production" };
	try {
		expect(await access()).toMatchObject({ status: "allowed" });
		role = "viewer";
		expect(await access()).toMatchObject({ status: "read-only" });
		role = "owner";
		Reflect.deleteProperty(process.env, "AI_GATEWAY_API_KEY");
		expect(await access()).toMatchObject({ status: "not-configured" });
		expect(billingRequests).toEqual([]);
	} finally {
		process.env = original;
	}
});
