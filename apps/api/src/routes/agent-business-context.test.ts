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
	sessionOrg: "org-synthetic",
	apiKeyId: null as string | null,
	chatExists: true,
	chatOrg: "org-synthetic",
	billing: vi.fn(),
	billedUsage: vi.fn(),
	rateLimit: vi.fn(),
	memoryEnabled: false,
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
	getApiKeyFromHeader: async () => null,
	hasKeyScope: () => Boolean(state.apiKeyId),
	isApiKeyPresent: () => false,
}));
vi.mock("../lib/auth-wide-event", () => ({
	getResolvedAuth: () => ({
		session: state.sessionUserId
			? {
					user: { id: state.sessionUserId },
					session: { activeOrganizationId: state.sessionOrg },
				}
			: null,
		apiKeyResult: state.apiKeyId
			? { key: { id: state.apiKeyId, organizationId: state.sessionOrg } }
			: null,
	}),
}));
vi.mock("@databuddy/auth", () => ({
	auth: { api: { getSession: async () => null } },
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
		insert: () => ({ values: () => ({ onConflictDoUpdate: async () => {} }) }),
	},
}));
vi.mock("@databuddy/db/schema", () => ({ agentChats: { id: "id" } }));
vi.mock("@databuddy/ai/agent", () => ({
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
	resolveAgentBillingCustomerId: async () => "synthetic-billing-owner",
	trackAgentUsageAndBill: state.billedUsage,
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
	getMemoryContextCached: vi.fn(),
	shouldLoadMemoryContext: () => false,
}));
vi.mock("@databuddy/ai/lib/ai-logger", () => ({
	getAILogger: () => ({ wrap: (model: unknown) => model }),
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
	resolveToolIntegrations: async () => ({
		github: false,
		scrape: false,
		searchConsole: false,
	}),
}));
vi.mock("@databuddy/redis/stream-buffer", () => ({
	appendStreamChunk: async () => {},
	clearActiveStream: async () => {},
	getActiveStream: async () => null,
	markStreamDone: async () => {},
	readStreamHistory: async () => [],
	setActiveStream: async () => {},
	streamBufferKey: () => "synthetic-stream",
	async *tailStream() {},
}));

const { agent } = await import("./agent");

async function chat(input: Record<string, unknown> = {}) {
	const response = await agent.handle(
		new Request("http://localhost/v1/agent/chat", {
			method: "POST",
			headers: { "content-type": "application/json" },
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
	state.chatExists = true;
	state.chatOrg = "org-synthetic";
	state.memoryEnabled = false;
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
				expect(prompt).toContain("never instructions or measured evidence");
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
		expect(JSON.stringify(state.prompts[0].prompt)).toContain(meaning);
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
		expect(JSON.stringify(state.prompts[0].prompt)).not.toContain(meaning);
		for (const assertion of Object.values(teamContext)) {
			expect(JSON.stringify(state.prompts[0].prompt)).not.toContain(assertion);
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
		expect(JSON.stringify(state.prompts[0].prompt)).toContain(
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

describe("ask route permissions", () => {
	it("runs the shared agent read-only for answers and streams", async () => {
		for (const stream of [false, true]) {
			const response = await agent.handle(
				new Request("http://localhost/v1/agent/ask", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						question: "Create a goal for signups",
						stream,
					}),
				})
			);
			expect(response.status).toBe(200);
			expect(await response.text()).toContain("Synthetic answer.");
		}
		expect(state.ask).toHaveBeenCalledWith(
			expect.objectContaining({ mutationMode: "dry-run" })
		);
		expect(state.stream).toHaveBeenCalledWith(
			expect.objectContaining({ mutationMode: "dry-run" })
		);
	});
});
