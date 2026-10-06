import type { ApiKeyRow } from "@databuddy/api-keys/resolve";
import type { agentChats } from "@databuddy/db/schema";
import { BillingUnavailableError } from "@databuddy/shared/billing";
import { AgentError } from "@databuddy/ai/agent";
import { APICallError } from "ai";
import type { MockLanguageModelV3 } from "ai/test";
import {
	type OrganizationBusinessProfile,
	PROFILE_ORIGIN_PROVENANCE,
} from "@databuddy/shared/organization-business-context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	profile: null as OrganizationBusinessProfile | null,
	read: vi.fn(),
	prompts: [] as Parameters<MockLanguageModelV3["doStream"]>[0][],
	contexts: [] as Record<string, unknown>[],
	accessible: vi.fn(),
	errors: vi.fn(),
	sessionUserId: "user-synthetic" as string | null,
	sessionOrg: "org-synthetic" as string | null,
	apiKeyId: null as string | null,
	apiKey: null as ApiKeyRow | null,
	chatExists: true,
	chatOrg: "org-synthetic",
	billing: vi.fn(),
	billingCustomer: vi.fn(),
	memberRole: vi.fn(),
	billedUsage: vi.fn(),
	rateLimit: vi.fn(),
	memoryEnabled: false,
	loadMemory: false,
	memoryLookup: vi.fn(),
	integrations: vi.fn(),
	streamSetup: vi.fn(),
	persistedChats: [] as (typeof agentChats.$inferInsert)[],
	storedMemory: vi.fn(),
	ask: vi.fn(),
	stream: vi.fn(),
	claims: new Set<string>(),
	claim: vi.fn(),
	goalWrites: vi.fn(),
	modelFailure: false,
}));
const site = {
	id: "site-synthetic",
	domain: "reports.example.com",
	name: "Synthetic reports",
	createdAt: null,
	isPublic: false,
};
const meaning =
	"synthetic_bundle_ready means a bundle was prepared before download";
const priority = "Priority: first successful downloads over signups";
const teamContext = {
	priority: "Prioritize synthetic_returned_value over signup volume",
	successDefinition:
		"synthetic_returned_value requires a successful download and a return visit",
	exclusions: "Exclude synthetic employees and preview-only activity",
};
const profile: OrganizationBusinessProfile = {
	content: `${meaning}. ${priority}.`,
	origin: "team",
	revision: 11,
	updatedAt: "2026-09-08T08:00:00Z",
	updatedBy: "user-synthetic",
	sourceWebsiteId: site.id,
	sources: [{ url: "https://reports.example.com", title: "Background" }],
};
vi.mock("@databuddy/services/organization-business-context", () => ({
	readOrganizationBusinessContext: state.read,
}));
vi.mock("@databuddy/ai/lib/accessible-websites", () => ({
	getAccessibleWebsites: state.accessible,
}));
vi.mock("@databuddy/api-keys/resolve", () => ({
	API_KEY_AUTH_CHALLENGE: "Bearer",
	hasKeyScope: (key: ApiKeyRow, scope: string) =>
		key.scopes ? key.scopes.includes(scope) : Boolean(state.apiKeyId),
	isApiKeyPresent: () => false,
	getApiKeyFromHeader: async (headers: Headers) =>
		headers.get("x-api-key") ||
		headers.get("authorization")?.toLowerCase().startsWith("bearer ")
			? state.apiKey
			: null,
}));
vi.mock("../lib/auth-wide-event", () => ({
	resolveRequestAuth: async () => ({
		apiKey:
			state.apiKey ??
			(state.apiKeyId
				? { id: state.apiKeyId, organizationId: state.sessionOrg }
				: null),
		session: state.sessionUserId
			? {
					user: { id: state.sessionUserId },
					session: { activeOrganizationId: state.sessionOrg },
				}
			: null,
	}),
}));
vi.mock("@databuddy/auth", () => ({
	auth: {
		api: {
			getSession: async ({ headers }: { headers: Headers }) =>
				headers.get("cookie") && state.sessionUserId
					? {
							user: { id: state.sessionUserId },
							session: { activeOrganizationId: state.sessionOrg },
						}
					: null,
		},
	},
}));
vi.mock("@databuddy/db", () => ({
	eq: () => undefined,
	db: {
		query: {
			agentChats: {
				findFirst: async () =>
					state.chatExists
						? {
								userId: "user-synthetic",
								organizationId: state.chatOrg,
							}
						: null,
			},
		},
		insert: () => ({
			values: (value: typeof agentChats.$inferInsert) => {
				state.persistedChats.push(value);
				return { onConflictDoUpdate: async () => {} };
			},
		}),
	},
}));
vi.mock("@databuddy/db/schema", () => ({ agentChats: { id: "id" } }));
vi.mock("@databuddy/ai/agent", async (importOriginal) => ({
	...(await importOriginal<typeof import("@databuddy/ai/agent")>()),
	askDatabuddyAgent: state.ask,
	streamDatabuddyAgent: state.stream,
}));
vi.mock("@databuddy/ai/agents/analytics", async () => {
	const { createToolkit } = await import("@databuddy/ai/tools/toolkit");
	const { MockLanguageModelV3, convertArrayToReadableStream } = await import(
		"ai/test"
	);
	const model = new MockLanguageModelV3({
		modelId: "synthetic/actual-model",
		doStream: async (input) => {
			state.prompts.push(input);
			if (state.modelFailure) {
				throw new Error("Synthetic model stream failure");
			}
			return {
				stream: convertArrayToReadableStream([
					{ type: "text-start", id: "text" },
					{ type: "text-delta", id: "text", delta: "Synthetic response." },
					{ type: "text-end", id: "text" },
					{
						type: "finish",
						finishReason: { unified: "stop", raw: "stop" },
						usage: {
							inputTokens: {
								total: 10,
								noCache: 10,
								cacheRead: 0,
								cacheWrite: 0,
							},
							outputTokens: { total: 2, text: 2, reasoning: 0 },
						},
					},
				]),
			};
		},
	});
	return {
		createConfig: (context: Record<string, unknown>) => {
			state.contexts.push(context);
			return {
				model,
				tools: {
					create_goal: {
						...createToolkit({ capabilities: ["mutations"] }).create_goal,
						execute: state.goalWrites,
					},
				},
				system: { role: "system", content: "Synthetic analytics agent" },
				experimental_context: context,
			};
		},
	};
});
vi.mock("@databuddy/ai/agents/execution", () => ({
	getAgentBillingAccess: state.billing,
	resolveAgentBillingCustomerId: state.billingCustomer,
	trackAgentUsageAndBill: state.billedUsage,
}));
vi.mock("@databuddy/rpc/organization", async (importOriginal) => ({
	...(await importOriginal<typeof import("@databuddy/rpc/organization")>()),
	getMemberRole: state.memberRole,
}));
vi.mock("@databuddy/ai/config/models", () => ({
	AI_MODEL_MAX_RETRIES: 0,
	ANTHROPIC_CACHE_1H: {},
	modelNames: { balanced: "synthetic" },
	models: {},
}));
vi.mock("@databuddy/ai/lib/supermemory", async (importOriginal) => ({
	...(await importOriginal<typeof import("@databuddy/ai/lib/supermemory")>()),
	formatMemoryForPrompt: () => "",
	isMemoryEnabled: () => state.memoryEnabled,
	storeConversation: state.storedMemory,
}));
vi.mock("@databuddy/ai/agents/cache", () => ({
	getAgentContextSnapshot: async () => ({ context: "", source: "miss" }),
	getMemoryContextCached: state.memoryLookup,
	shouldLoadMemoryContext: () => state.loadMemory,
}));
vi.mock("@databuddy/ai/lib/ai-logger", () => ({
	getAILogger: () => ({ wrap: (model: MockLanguageModelV3) => model }),
}));
vi.mock("@databuddy/ai/lib/databuddy", () => ({ trackAgentEvent: () => {} }));
vi.mock("@databuddy/ai/lib/tracing", () => ({
	captureError: state.errors,
	mergeWideEvent: () => {},
}));
vi.mock("evlog/elysia", () => ({
	useLogger: () => ({ info: () => {}, warn: () => {}, set: () => {} }),
}));
vi.mock("@databuddy/redis/rate-limit", () => ({
	ratelimit: state.rateLimit,
}));
vi.mock("@databuddy/redis", async (importOriginal) => ({
	...(await importOriginal<typeof import("@databuddy/redis")>()),
	getRedisCache: () => ({ set: state.claim }),
}));
vi.mock("@databuddy/ai/tools/toolkit", async (importOriginal) => ({
	...(await importOriginal<typeof import("@databuddy/ai/tools/toolkit")>()),
	resolveToolIntegrations: state.integrations,
}));
vi.mock("@databuddy/redis/stream-buffer", () => ({
	appendStreamChunk: async () => {},
	clearActiveStream: async () => {},
	getActiveStream: async () => null,
	markStreamDone: async () => {},
	readStreamHistory: async () => [],
	setActiveStream: state.streamSetup,
	streamBufferKey: () => "synthetic-stream",
	async *tailStream() {},
}));

const { agent } = await import("./agent");

async function chat(
	input: Record<string, unknown> = {},
	headers: Record<string, string> = {}
) {
	const response = await agent.handle(
		new Request("http://localhost/v1/agent/chat", {
			method: "POST",
			headers: { "content-type": "application/json", ...headers },
			body: JSON.stringify({
				id: "chat-synthetic",
				organizationId: "org-synthetic",
				websiteId: site.id,
				messages: [
					{
						id: "user-message",
						role: "user",
						parts: [{ type: "text", text: "What should we prioritize?" }],
					},
				],
				...input,
			}),
		})
	);
	const text = await response.text();
	return { status: response.status, text };
}

beforeEach(() => {
	state.claims.clear();
	state.claim.mockReset().mockImplementation((key: string) => {
		const alreadyClaimed = state.claims.has(key);
		state.claims.add(key);
		return alreadyClaimed ? null : "OK";
	});
	state.goalWrites.mockReset().mockResolvedValue({ id: "goal-synthetic" });
	state.modelFailure = false;
	state.billing.mockReset().mockResolvedValue({
		allowed: true,
		customerId: "synthetic-billing-owner",
	});
	state.billedUsage.mockReset().mockResolvedValue(undefined);
	state.billingCustomer
		.mockReset()
		.mockResolvedValue("synthetic-billing-owner");
	state.memberRole.mockReset().mockResolvedValue("member");
	state.rateLimit.mockReset().mockResolvedValue({ success: true });
	state.profile = profile;
	state.prompts.length = 0;
	state.contexts.length = 0;
	state.read.mockReset();
	state.errors.mockReset();
	state.accessible.mockReset();
	state.read.mockImplementation(async () => ({
		profile: state.profile,
		generation: null,
	}));
	state.accessible.mockImplementation(
		async (auth: { organizationId: string }) =>
			auth.organizationId === "org-synthetic" ? [site] : []
	);
	state.sessionUserId = "user-synthetic";
	state.sessionOrg = "org-synthetic";
	state.apiKeyId = null;
	state.apiKey = null;
	state.chatExists = true;
	state.chatOrg = "org-synthetic";
	state.memoryEnabled = false;
	state.loadMemory = false;
	state.memoryLookup.mockReset().mockResolvedValue({
		staticProfile: [],
		dynamicProfile: [],
		relevantMemories: [],
	});
	state.integrations.mockReset().mockResolvedValue({
		github: false,
		scrape: false,
		searchConsole: false,
	});
	state.streamSetup.mockReset().mockResolvedValue(undefined);
	state.persistedChats.length = 0;
	state.storedMemory.mockReset();
	state.ask.mockReset().mockResolvedValue({
		answer: "Synthetic answer.",
		conversationId: "ask-synthetic",
	});
	state.stream.mockReset().mockImplementation(async function* () {
		yield "Synthetic answer.";
	});
});

describe("dashboard approval claims through the native HTTP/model stream", () => {
	const goal = {
		websiteId: site.id,
		type: "PAGE_VIEW",
		target: "/signup",
		name: "Signup",
		confirmed: true,
	};
	const messages = [
		{
			id: "user-1",
			role: "user",
			parts: [{ type: "text", text: "Yes, create it" }],
		},
		{
			id: "assistant-1",
			role: "assistant",
			parts: [
				{
					type: "tool-create_goal",
					toolCallId: "call-goal",
					state: "approval-responded",
					input: goal,
					approval: { id: "approval-synthetic", approved: true },
				},
			],
		},
	];

	it.each([
		["session callers", "user-other", "org-synthetic", null],
		["API-key callers", null, "org-synthetic", "key-other"],
		["organizations", "user-synthetic", "org-other", null],
	] as const)("keeps approvals independent across %s when the chat is not persisted", async (_scope, otherUserId, otherOrg, otherKeyId) => {
		const firstUserId = otherKeyId ? null : "user-synthetic";
		const firstKeyId = otherKeyId ? "key-synthetic" : null;
		state.chatExists = false;
		state.sessionUserId = firstUserId;
		state.apiKeyId = firstKeyId;
		state.accessible.mockResolvedValue([site]);
		const first = await chat({ messages });

		state.sessionUserId = otherUserId;
		state.sessionOrg = otherOrg;
		state.apiKeyId = otherKeyId;
		const other = await chat({ messages, organizationId: otherOrg });

		state.sessionUserId = firstUserId;
		state.sessionOrg = "org-synthetic";
		state.apiKeyId = firstKeyId;
		const retry = await chat({ messages });
		for (const response of [first, other, retry]) {
			expect(response.status, response.text).toBe(200);
		}
		for (const response of [first, other]) {
			expect(response.text).toContain('"type":"tool-output-available"');
		}
		expect(retry.text).not.toContain('"type":"tool-output-available"');
		expect(state.goalWrites).toHaveBeenCalledTimes(2);
		expect(JSON.stringify(state.prompts.at(-1)?.prompt)).toContain(
			"This approval was already used"
		);
	});

	it("runs one write when two tabs claim the same approval concurrently", async () => {
		const bothClaimed = Promise.withResolvers<void>();
		state.claim.mockImplementation(async (key: string) => {
			const alreadyClaimed = state.claims.has(key);
			state.claims.add(key);
			if (state.claim.mock.calls.length === 2) {
				bothClaimed.resolve();
			}
			await bothClaimed.promise;
			return alreadyClaimed ? null : "OK";
		});
		const responses = await Promise.all([
			chat({ messages }),
			chat({ messages }),
		]);
		for (const response of responses) {
			expect(response.status, response.text).toBe(200);
		}
		const claimArgs = [
			"agent:approval:user-synthetic:org-synthetic:chat-synthetic:approval-synthetic",
			"1",
			"EX",
			86_400,
			"NX",
		];
		expect(state.claim.mock.calls).toEqual([claimArgs, claimArgs]);
		expect(state.goalWrites).toHaveBeenCalledExactlyOnceWith(
			goal,
			expect.anything()
		);
		expect(
			state.prompts.filter(({ prompt }) =>
				JSON.stringify(prompt).includes("This approval was already used")
			)
		).toHaveLength(1);
		expect(
			responses.filter(({ text }) =>
				text.includes('"type":"tool-output-available"')
			)
		).toHaveLength(1);
	});

	it("retains a claim when the model fails after the approved write", async () => {
		state.modelFailure = true;
		const failed = await chat({ messages });
		expect(failed.text).toContain('"type":"error"');
		expect(state.goalWrites).toHaveBeenCalledTimes(1);
		state.modelFailure = false;
		const retry = await chat({ messages });
		expect(retry.status, retry.text).toBe(200);
		expect(JSON.stringify(state.prompts.at(-1)?.prompt)).toContain(
			"This approval was already used"
		);
		expect(state.goalWrites).toHaveBeenCalledTimes(1);
	});

	it("keeps the accepted fail-open behavior when Redis rejects the claim", async () => {
		const error = new Error("Synthetic Redis command timeout");
		state.claim.mockRejectedValueOnce(error);
		const result = await chat({ messages });
		expect(result.status, result.text).toBe(200);
		expect(state.goalWrites).toHaveBeenCalledTimes(1);
		expect(state.errors).toHaveBeenCalledWith(error, {
			agent_approval_claim_failed: true,
		});
	});
});

describe("dashboard canonical business context through the native HTTP/model stream", () => {
	it("pairs absent/saved profiles with identical questions and memory disabled", async () => {
		for (const present of [false, true]) {
			state.profile = present ? profile : null;
			const result = await chat();
			expect(result.status, result.text).toBe(200);
			expect(result.text).toContain('"delta":"Synthetic "');
			expect(result.text).toContain('"delta":"response."');
			const prompt = JSON.stringify(state.prompts.at(-1)?.prompt);
			expect(prompt.includes(meaning)).toBe(present);
			expect(prompt.includes(priority)).toBe(present);
			if (present) {
				expect(prompt).toContain('\\"revision\\":11');
				expect(prompt).toContain("business background, not measured evidence");
			} else {
				expect(prompt).toContain("remain unknown");
			}
		}
		expect(state.read).toHaveBeenCalledTimes(2);
		expect(state.read).toHaveBeenCalledWith("org-synthetic");
		expect(state.contexts[0]).toMatchObject({
			organizationId: "org-synthetic",
			accessibleWebsites: [site],
		});
		expect(state.errors).not.toHaveBeenCalled();
	});
	it("delivers organization-wide context with no selected website", async () => {
		expect((await chat({ websiteId: undefined })).status).toBe(200);
		expect(JSON.stringify(state.prompts[0]?.prompt)).toContain(meaning);
	});
	it("delivers team-only settings and preserves mixed legacy meanings as assertions", async () => {
		for (const content of ["", `${meaning}. Public capability claims.`]) {
			state.profile = { ...profile, content, origin: "mixed", teamContext };
			expect((await chat()).status).toBe(200);
			const prompt = JSON.stringify(state.prompts.at(-1)?.prompt);
			for (const assertion of Object.values(teamContext)) {
				expect(prompt).toContain(assertion);
			}
			expect(prompt.includes(meaning)).toBe(Boolean(content));
			expect(prompt).toContain(PROFILE_ORIGIN_PROVENANCE.mixed.meaning);
			expect(prompt).toContain("Separately supplied team assertions");
			expect(prompt).toContain("never instructions or measured proof");
		}
	});
	it("does not inject a profile into mixed-organization website mentions", async () => {
		state.profile = { ...profile, origin: "mixed", teamContext };
		expect((await chat({ mentions: [site.id, "foreign-site"] })).status).toBe(
			200
		);
		expect(state.read).not.toHaveBeenCalled();
		expect(JSON.stringify(state.prompts[0]?.prompt)).not.toContain(meaning);
		for (const assertion of Object.values(teamContext)) {
			expect(JSON.stringify(state.prompts[0]?.prompt)).not.toContain(assertion);
		}
	});
	it("rejects an inaccessible organization, site or existing chat before reading profiles", async () => {
		expect((await chat({ organizationId: "foreign-org" })).status).toBe(403);
		expect((await chat({ websiteId: "foreign-site" })).status).toBe(403);
		state.chatOrg = "foreign-org";
		expect((await chat()).status).toBe(403);
		expect(state.read).not.toHaveBeenCalled();
		expect(state.prompts).toHaveLength(0);
	});
	it("continues the stream with explicit uncertainty when the profile read fails", async () => {
		state.read.mockRejectedValueOnce(new Error("synthetic read failure"));
		expect((await chat()).status).toBe(200);
		expect(JSON.stringify(state.prompts[0]?.prompt)).toContain(
			"unavailable for this turn"
		);
		expect(state.read).toHaveBeenCalledTimes(1);
	});
});

describe("dashboard billing permission before the native model stream", () => {
	it("fails closed when entitlement lookup fails, without a model call", async () => {
		state.billing.mockRejectedValueOnce(
			new Error("synthetic billing unavailable")
		);
		expect((await chat()).status).toBe(500);
		expect(state.prompts).toHaveLength(0);
		expect(state.billedUsage).not.toHaveBeenCalled();
	});
	it("keeps credit denial authoritative", async () => {
		state.billing.mockResolvedValueOnce({
			allowed: false,
			customerId: "synthetic-billing-owner",
		});
		expect(
			(
				await chat({
					billingAccess: {
						allowed: true,
						customerId: "synthetic-billing-owner",
					},
				})
			).status
		).toBe(402);
		expect(state.prompts).toHaveLength(0);
	});
	it("pins the server entitlement for usage and ignores a caller-supplied billing flag", async () => {
		expect(
			(await chat({ billingAccess: { allowed: true, customerId: "foreign" } }))
				.status
		).toBe(200);
		expect(state.billedUsage).toHaveBeenCalledWith(
			expect.objectContaining({
				billingCustomerId: "synthetic-billing-owner",
				billingAccess: { allowed: true, customerId: "synthetic-billing-owner" },
				source: "dashboard",
			})
		);
		expect(state.billing).toHaveBeenCalledTimes(1);
	});
	it("preserves rate limits before any included-chat lookup", async () => {
		state.rateLimit.mockResolvedValueOnce({ success: false });
		expect((await chat()).status).toBe(429);
		expect(state.billing).not.toHaveBeenCalled();
		expect(state.prompts).toHaveLength(0);
	});
});

describe("dashboard executed model attribution", () => {
	it("attributes usage to the model actually executed", async () => {
		expect((await chat()).status).toBe(200);
		expect(state.billedUsage).toHaveBeenCalledWith(
			expect.objectContaining({ modelId: "synthetic/actual-model" })
		);
	});
});

describe("dashboard memory writes", () => {
	it("stores memory only when the latest user message asks to remember", async () => {
		state.memoryEnabled = true;
		expect((await chat()).status).toBe(200);
		expect(state.storedMemory).not.toHaveBeenCalled();
		const remember = await chat({
			messages: [
				{
					id: "user-message",
					role: "user",
					parts: [{ type: "text", text: "Remember that we report weekly" }],
				},
			],
		});
		expect(remember.status).toBe(200);
		expect(state.storedMemory).toHaveBeenCalledTimes(1);
	});
});

function askResponse(
	input: Record<string, unknown> = {},
	headers: Record<string, string> = {}
) {
	return agent.handle(
		new Request("http://localhost/v1/agent/ask", {
			method: "POST",
			headers: { "content-type": "application/json", ...headers },
			body: JSON.stringify({ question: "Create a goal for signups", ...input }),
		})
	);
}

async function ask(input: Record<string, unknown> = {}) {
	const response = await askResponse(input);
	return { status: response.status, text: await response.text() };
}

describe("ask route", () => {
	it("returns HTTP 503 when billing fails before streamed text", async () => {
		state.stream.mockImplementationOnce(async function* () {
			yield "";
			throw new BillingUnavailableError("Synthetic provider detail");
		});
		const response = await agent.handle(
			new Request("http://localhost/v1/agent/ask", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ question: "Show recent events", stream: true }),
			})
		);
		expect(response.status).toBe(503);
		expect(response.headers.get("content-type")).toBe("application/json");
		expect(await response.json()).toMatchObject({
			success: false,
			code: "BILLING_UNAVAILABLE",
		});
	});


	it("runs the shared agent read-only for answers and streams", async () => {
		for (const stream of [false, true]) {
			const response = await ask({ stream });
			expect(response.status).toBe(200);
			expect(response.text).toContain("Synthetic answer.");
		}
		expect(state.ask).toHaveBeenCalledWith(
			expect.objectContaining({ mutationMode: "dry-run" })
		);
		expect(state.stream).toHaveBeenCalledWith(
			expect.objectContaining({ mutationMode: "dry-run" })
		);
	});
	it("answers as the API in markdown for the session's organization", async () => {
		expect((await ask()).status).toBe(200);
		expect(state.ask).toHaveBeenCalledWith(
			expect.objectContaining({
				output: "markdown",
				source: "api",
				principal: expect.objectContaining({
					organizationId: "org-synthetic",
					accessibleWebsites: [site],
				}),
			})
		);
	});
	it("returns real status codes before streaming when preflight fails", async () => {
		state.sessionOrg = null;
		for (const stream of [false, true]) {
			const response = await ask({ stream });
			expect(response.status).toBe(400);
			expect(JSON.parse(response.text)).toMatchObject({
				code: "WORKSPACE_REQUIRED",
			});
		}
		state.sessionOrg = "org-synthetic";
		state.rateLimit.mockResolvedValueOnce({ success: false });
		expect((await ask({ stream: true })).status).toBe(429);
		expect(state.ask).not.toHaveBeenCalled();
		expect(state.stream).not.toHaveBeenCalled();
	});
	it.each([
		false,
		true,
	])("rejects a session outside the requested organization before any paid work (stream=%s)", async (stream) => {
		state.memberRole.mockResolvedValue(null);
		const response = await ask({ organizationId: "foreign-org", stream });
		expect(response.status, response.text).toBe(403);
		expect(JSON.parse(response.text)).toMatchObject({ code: "ACCESS_DENIED" });
		expect(state.memberRole).toHaveBeenCalledExactlyOnceWith(
			"user-synthetic",
			"foreign-org"
		);
		expect(state.rateLimit).not.toHaveBeenCalled();
		expect(state.accessible).not.toHaveBeenCalled();
		expect(state.billingCustomer).not.toHaveBeenCalled();
		expect(state.billing).not.toHaveBeenCalled();
		expect(state.ask).not.toHaveBeenCalled();
		expect(state.stream).not.toHaveBeenCalled();
	});
	it("checks membership in the active organization when none is requested", async () => {
		state.memberRole.mockResolvedValue(null);
		const response = await ask();
		expect(response.status, response.text).toBe(403);
		expect(state.memberRole).toHaveBeenCalledExactlyOnceWith(
			"user-synthetic",
			"org-synthetic"
		);
		expect(state.billingCustomer).not.toHaveBeenCalled();
		expect(state.billing).not.toHaveBeenCalled();
		expect(state.ask).not.toHaveBeenCalled();
	});
	it("keeps a valid requested-organization member eligible with zero websites", async () => {
		state.accessible.mockResolvedValue([]);
		const response = await ask({ organizationId: "org-other" });
		expect(response.status, response.text).toBe(200);
		expect(state.memberRole).toHaveBeenCalledExactlyOnceWith(
			"user-synthetic",
			"org-other"
		);
		expect(state.billingCustomer).toHaveBeenCalledExactlyOnceWith({
			apiKey: null,
			organizationId: "org-other",
			userId: "user-synthetic",
		});
		expect(state.ask).toHaveBeenCalledWith(
			expect.objectContaining({
				mutationMode: "dry-run",
				output: "markdown",
				source: "api",
				principal: expect.objectContaining({
					organizationId: "org-other",
					accessibleWebsites: [],
				}),
			})
		);
	});
	it("rejects an API key used for another organization", async () => {
		state.sessionUserId = null;
		state.memberRole.mockRejectedValue(
			new Error("API keys use bound organization access")
		);
		state.apiKey = {
			id: "key-synthetic",
			name: "Synthetic",
			prefix: "test",
			start: "test",
			keyHash: "inert",
			userId: null,
			organizationId: "org-synthetic",
			type: "user",
			scopes: ["read:data"],
			enabled: true,
			revokedAt: null,
			rateLimitEnabled: false,
			rateLimitTimeWindow: null,
			rateLimitMax: null,
			expiresAt: null,
			lastUsedAt: null,
			metadata: {},
			createdAt: new Date("2026-10-05"),
			updatedAt: new Date("2026-10-05"),
		};
		expect((await ask({ organizationId: "foreign-org" })).status).toBe(403);
		expect(state.billingCustomer).not.toHaveBeenCalled();
		expect(state.billing).not.toHaveBeenCalled();
		expect((await ask()).status).toBe(200);
		expect(state.memberRole).not.toHaveBeenCalled();
		expect(state.billingCustomer).toHaveBeenCalledExactlyOnceWith({
			apiKey: state.apiKey,
			organizationId: "org-synthetic",
			userId: null,
		});
		expect(state.ask).toHaveBeenCalledTimes(1);
	});
	it("maps billing, credit, provider and unknown failures to their statuses", async () => {
		state.billing.mockRejectedValueOnce(
			new BillingUnavailableError("synthetic outage")
		);
		expect(await ask()).toMatchObject({ status: 503 });
		state.billing.mockResolvedValueOnce({
			allowed: false,
			customerId: "synthetic-billing-owner",
		});
		expect(await ask()).toMatchObject({ status: 402 });
		state.ask.mockRejectedValueOnce(
			new APICallError({
				message: "synthetic provider outage",
				url: "https://provider.invalid",
				requestBodyValues: {},
			})
		);
		expect(await ask()).toMatchObject({ status: 503 });
		state.ask.mockRejectedValueOnce(new Error("SYNTHETIC_INTERNAL_DETAIL"));
		const internal = await ask();
		expect(internal.status).toBe(500);
		expect(JSON.parse(internal.text)).toMatchObject({ code: "INTERNAL_ERROR" });
		expect(internal.text).not.toContain("SYNTHETIC_INTERNAL_DETAIL");
	});
});

const selectedKey: ApiKeyRow = {
	id: "key-synthetic-selected",
	name: "Synthetic selected key",
	prefix: "test",
	start: "test",
	keyHash: "inert",
	userId: "key-owner-synthetic",
	organizationId: "org-key-synthetic",
	type: "user",
	scopes: ["read:data"],
	enabled: true,
	revokedAt: null,
	rateLimitEnabled: false,
	rateLimitTimeWindow: null,
	rateLimitMax: null,
	expiresAt: null,
	lastUsedAt: null,
	metadata: {},
	createdAt: new Date("2026-10-05"),
	updatedAt: new Date("2026-10-05"),
};
const mixedHeaders = {
	cookie: "synthetic-session=inert",
	"x-api-key": "dbdy_inert_selected_key",
};

describe("selected agent identity through native HTTP", () => {
	it.each([
		{ stream: false, keyOwner: "key-owner-synthetic" },
		{ stream: true, keyOwner: "key-owner-synthetic" },
		{ stream: false, keyOwner: null },
		{ stream: true, keyOwner: null },
	])("keeps the selected key independent of an unrelated cookie (stream=$stream, owner=$keyOwner)", async ({
		stream,
		keyOwner,
	}) => {
		state.apiKey = { ...selectedKey, userId: keyOwner };
		state.memberRole.mockResolvedValue(null);
		state.accessible.mockResolvedValue([site]);
		const response = await askResponse({ stream }, mixedHeaders);
		expect(response.status).toBe(200);
		expect(await response.text()).toContain("Synthetic answer.");
		const options = (stream ? state.stream : state.ask).mock.calls[0][0];
		expect(options.actor).toMatchObject({
			type: "api_key",
			apiKey: state.apiKey,
			userId: null,
		});
		expect(options.principal).toMatchObject({
			organizationId: selectedKey.organizationId,
			userId: keyOwner,
		});
		expect(options.actor.requestHeaders.get("cookie")).toBeNull();
		expect(options.actor.requestHeaders.get("x-api-key")).toBe(
			mixedHeaders["x-api-key"]
		);
		expect(options.abortSignal).toBeInstanceOf(AbortSignal);
		expect(state.memberRole).not.toHaveBeenCalled();
		expect(state.rateLimit).toHaveBeenCalledExactlyOnceWith(
			`agent:ask:apikey:${selectedKey.id}:${selectedKey.organizationId}`,
			30,
			60
		);
		expect(state.billingCustomer).toHaveBeenCalledExactlyOnceWith({
			apiKey: state.apiKey,
			organizationId: selectedKey.organizationId,
			userId: keyOwner,
		});
	});

	it("uses the key namespace for chat memory, tools and streams without cookie-user persistence", async () => {
		state.apiKey = selectedKey;
		state.chatExists = false;
		state.accessible.mockResolvedValue([site]);
		state.memberRole.mockResolvedValue(null);
		state.loadMemory = true;
		state.memoryEnabled = true;
		const response = await chat(
			{
				organizationId: selectedKey.organizationId,
				messages: [
					{
						id: "remember",
						role: "user",
						parts: [{ type: "text", text: "Remember that we report weekly" }],
					},
				],
			},
			mixedHeaders
		);
		expect(response.status, response.text).toBe(200);
		const namespace = `apikey:${selectedKey.id}`;
		const context = state.contexts.at(-1)!;
		expect(context.userId).toBe(namespace);
		expect(context.organizationId).toBe(selectedKey.organizationId);
		const headers = context.requestHeaders as Headers;
		expect(headers.get("cookie")).toBeNull();
		expect(headers.get("x-api-key")).toBe(mixedHeaders["x-api-key"]);
		const { createRPCContext } = await import(
			"../../../../packages/rpc/src/orpc"
		);
		const rpcContext = await createRPCContext({ headers });
		expect(rpcContext.user).toBeUndefined();
		expect(rpcContext.apiKey).toEqual(selectedKey);
		expect(rpcContext.organizationId).toBe(selectedKey.organizationId);
		const mixedContext = await createRPCContext({
			headers: new Headers(mixedHeaders),
		});
		expect(mixedContext.user?.id).toBe("user-synthetic");
		expect(mixedContext.organizationId).toBe(selectedKey.organizationId);
		expect(state.memoryLookup).toHaveBeenCalledWith(
			"Remember that we report weekly",
			namespace
		);
		expect(state.integrations).toHaveBeenCalledWith(
			selectedKey.organizationId,
			namespace
		);
		expect(state.streamSetup).toHaveBeenCalledWith(
			namespace,
			"chat-synthetic",
			expect.any(String)
		);
		expect(state.storedMemory).toHaveBeenCalledWith(
			expect.any(Array),
			namespace,
			null,
			expect.any(Object)
		);
		expect(state.persistedChats).toEqual([]);
		expect(state.memberRole).not.toHaveBeenCalled();
	});

	it("deduplicates the same key approval across unrelated cookie sessions", async () => {
		state.apiKey = selectedKey;
		state.chatExists = false;
		state.accessible.mockResolvedValue([site]);
		const goal = {
			websiteId: site.id,
			type: "PAGE_VIEW",
			target: "/signup",
			name: "Signup",
			confirmed: true,
		};
		const messages = [
			{
				id: "confirm",
				role: "user",
				parts: [{ type: "text", text: "Yes, create it" }],
			},
			{
				id: "approval",
				role: "assistant",
				parts: [
					{
						type: "tool-create_goal",
						toolCallId: "selected-goal",
						state: "approval-responded",
						input: goal,
						approval: { id: "selected-approval", approved: true },
					},
				],
			},
		];
		const first = await chat(
			{ organizationId: selectedKey.organizationId, messages },
			mixedHeaders
		);
		state.sessionUserId = "another-cookie-user";
		state.sessionOrg = "another-cookie-org";
		const retry = await chat(
			{ organizationId: selectedKey.organizationId, messages },
			{ ...mixedHeaders, cookie: "another-synthetic-session=inert" }
		);
		for (const response of [first, retry]) {
			expect(response.status, response.text).toBe(200);
		}
		expect(state.goalWrites).toHaveBeenCalledTimes(1);
		expect(state.claim.mock.calls.map(([key]) => key)).toEqual([
			`agent:approval:apikey:${selectedKey.id}:${selectedKey.organizationId}:chat-synthetic:selected-approval`,
			`agent:approval:apikey:${selectedKey.id}:${selectedKey.organizationId}:chat-synthetic:selected-approval`,
		]);
	});

	it("retains session headers and membership when no scoped key is selected", async () => {
		const response = await askResponse({}, { cookie: mixedHeaders.cookie });
		expect(response.status).toBe(200);
		expect(await response.text()).toContain("Synthetic answer.");
		const actor = state.ask.mock.calls[0][0].actor;
		expect(actor).toMatchObject({ type: "session", userId: "user-synthetic" });
		expect(actor.requestHeaders.get("cookie")).toBe(mixedHeaders.cookie);
		expect(state.memberRole).toHaveBeenCalledExactlyOnceWith(
			"user-synthetic",
			"org-synthetic"
		);
	});

	it.each([
		{ endpoint: "ask", credential: { "x-api-key": "dbdy_inert_unscoped" } },
		{
			endpoint: "ask",
			credential: { authorization: "bEaReR dbdy_inert_unscoped" },
		},
		{ endpoint: "chat", credential: { "x-api-key": "dbdy_inert_unscoped" } },
		{
			endpoint: "chat",
			credential: { authorization: "bEaReR dbdy_inert_unscoped" },
		},
	])("keeps session fallback RPC in the session organization ($endpoint, $credential)", async ({
		endpoint,
		credential,
	}) => {
		state.apiKey = { ...selectedKey, scopes: ["read:flags"] };
		const rawHeaders = { cookie: mixedHeaders.cookie, ...credential };
		let headers: Headers;
		if (endpoint === "ask") {
			const response = await askResponse({}, rawHeaders);
			expect(response.status).toBe(200);
			await response.text();
			headers = state.ask.mock.calls[0][0].principal.requestHeaders;
		} else {
			const response = await chat({}, rawHeaders);
			expect(response.status, response.text).toBe(200);
			headers = state.contexts.at(-1)!.requestHeaders as Headers;
		}
		const { createRPCContext } = await import(
			"../../../../packages/rpc/src/orpc"
		);
		const rawContext = await createRPCContext({
			headers: new Headers(rawHeaders),
		});
		expect(rawContext.organizationId).toBe(selectedKey.organizationId);
		const context = await createRPCContext({ headers });
		expect(context.user?.id).toBe("user-synthetic");
		expect(context.organizationId).toBe("org-synthetic");
		expect(context.apiKey).toBeUndefined();
		expect(headers.get("cookie")).toBe(mixedHeaders.cookie);
		expect(headers.get("x-api-key")).toBeNull();
		expect(headers.get("authorization")).toBeNull();
		expect(state.memberRole).toHaveBeenCalledExactlyOnceWith(
			"user-synthetic",
			"org-synthetic"
		);
		expect(state.billingCustomer).toHaveBeenCalledExactlyOnceWith({
			apiKey: null,
			organizationId: "org-synthetic",
			userId: "user-synthetic",
		});
	});

	it("preserves non-Bearer authorization on the session path", async () => {
		const response = await askResponse(
			{},
			{ cookie: mixedHeaders.cookie, authorization: "Basic inert" }
		);
		expect(response.status).toBe(200);
		await response.text();
		expect(
			state.ask.mock.calls[0][0].principal.requestHeaders.get("authorization")
		).toBe("Basic inert");
	});

	it.each([
		"ask",
		"chat",
	])("denies an unscoped key without a session before paid work (%s)", async (endpoint) => {
		state.apiKey = { ...selectedKey, scopes: ["read:flags"] };
		state.sessionUserId = null;
		const headers = { "x-api-key": "dbdy_inert_unscoped" };
		const response =
			endpoint === "ask"
				? await askResponse({}, headers)
				: await chat({}, headers);
		expect(response.status).toBe(401);
		expect(state.memberRole).not.toHaveBeenCalled();
		expect(state.billingCustomer).not.toHaveBeenCalled();
		expect(state.billing).not.toHaveBeenCalled();
		expect(state.ask).not.toHaveBeenCalled();
		expect(state.prompts).toEqual([]);
	});
});

describe("ask stream HTTP startup and transport failures", () => {
	it.each([
		{
			name: "provider",
			error: new APICallError({
				message: "SYNTHETIC_PROVIDER_DETAIL",
				url: "https://provider.invalid",
				requestBodyValues: {},
			}),
			status: 503,
			code: "PROVIDER_UNAVAILABLE",
		},
		{
			name: "billing",
			error: new BillingUnavailableError("SYNTHETIC_BILLING_DETAIL"),
			status: 503,
			code: "BILLING_UNAVAILABLE",
		},
		{
			name: "typed request",
			error: new AgentError("invalid_messages"),
			status: 400,
			code: "INVALID_MESSAGES",
		},
		{
			name: "internal",
			error: new Error("SYNTHETIC_INTERNAL_DETAIL"),
			status: 500,
			code: "INTERNAL_ERROR",
		},
	])("maps a $name failure before the first text to its HTTP status", async ({
		error,
		status,
		code,
	}) => {
		state.stream.mockImplementationOnce(async function* () {
			throw error;
		});
		const response = await askResponse({ stream: true });
		expect(response.status).toBe(status);
		expect(response.headers.get("content-type")).toBe("application/json");
		const text = await response.text();
		expect(JSON.parse(text)).toMatchObject({ success: false, code });
		expect(text).not.toContain("SYNTHETIC_");
	});

	it("does not commit success for an empty chunk followed by provider failure", async () => {
		state.stream.mockImplementationOnce(async function* () {
			yield "";
			throw new APICallError({
				message: "SYNTHETIC_PROVIDER_DETAIL",
				url: "https://provider.invalid",
				requestBodyValues: {},
			});
		});
		const response = await askResponse({ stream: true });
		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({
			code: "PROVIDER_UNAVAILABLE",
		});
	});

	it("preserves ordered plain text without duplicating the primed chunk", async () => {
		state.stream.mockImplementationOnce(async function* () {
			yield "";
			yield "First ";
			yield "second.";
		});
		const response = await askResponse({ stream: true });
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe(
			"text/plain; charset=utf-8"
		);
		expect(await response.text()).toBe("First second.");
	});

	it("rejects a body read after partial output instead of closing the failed answer", async () => {
		const later = Promise.withResolvers<void>();
		const failure = new Error("SYNTHETIC_LATER_FAILURE");
		state.stream.mockImplementationOnce(async function* () {
			yield "Synthetic partial answer.";
			await later.promise;
			throw failure;
		});
		const response = await askResponse({ stream: true });
		expect(response.status).toBe(200);
		const reader = response.body!.getReader();
		expect(new TextDecoder().decode((await reader.read()).value)).toBe(
			"Synthetic partial answer."
		);
		later.resolve();
		await expect(reader.read()).rejects.toBe(failure);
		reader.releaseLock();
	});
});
