import type { MockLanguageModelV3 } from "ai/test";
import type { OrganizationBusinessProfile } from "@databuddy/shared/organization-business-context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	profile: null as OrganizationBusinessProfile | null,
	read: vi.fn(),
	prompts: [] as Parameters<MockLanguageModelV3["doStream"]>[0][],
	contexts: [] as Record<string, unknown>[],
	accessible: vi.fn(),
	errors: vi.fn(),
	sessionOrg: "org-synthetic",
	chatOrg: "org-synthetic",
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
	hasKeyScope: () => false,
	isApiKeyPresent: () => false,
}));
vi.mock("../lib/auth-wide-event", () => ({
	getResolvedAuth: () => ({
		session: {
			user: { id: "user-synthetic" },
			session: { activeOrganizationId: state.sessionOrg },
		},
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
				findFirst: async () => ({
					userId: "user-synthetic",
					organizationId: state.chatOrg,
				}),
			},
		},
		insert: () => ({ values: () => ({ onConflictDoUpdate: async () => {} }) }),
	},
}));
vi.mock("@databuddy/db/schema", () => ({ agentChats: { id: "id" } }));
vi.mock("@databuddy/ai/agent", () => ({
	askDatabuddyAgent: vi.fn(),
	streamDatabuddyAgent: vi.fn(),
}));
vi.mock("@databuddy/ai/agents/analytics", async () => {
	const { MockLanguageModelV3, convertArrayToReadableStream } = await import(
		"ai/test"
	);
	const model = new MockLanguageModelV3({
		doStream: async (input) => {
			state.prompts.push(input);
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
				tools: {},
				system: { role: "system", content: "Synthetic analytics agent" },
				experimental_context: context,
			};
		},
	};
});
vi.mock("@databuddy/ai/agents/execution", () => ({
	ensureAgentCreditsAvailable: async () => true,
	resolveAgentBillingCustomerId: async () => null,
	trackAgentUsageAndBill: async () => {},
}));
vi.mock("@databuddy/ai/agents/router", () => ({
	tierToModelKey: () => "balanced",
}));
vi.mock("@databuddy/ai/config/models", () => ({
	AI_MODEL_MAX_RETRIES: 0,
	ANTHROPIC_CACHE_1H: {},
	modelNames: { balanced: "synthetic" },
	models: {},
}));
vi.mock("@databuddy/ai/lib/supermemory", () => ({
	formatMemoryForPrompt: () => "",
	isMemoryEnabled: () => false,
	storeConversation: vi.fn(),
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
	ratelimit: async () => ({ success: true }),
}));
vi.mock("@databuddy/redis/stream-buffer", () => ({
	appendStreamChunk: async () => {},
	clearActiveStream: async () => {},
	getActiveStream: async () => null,
	markStreamDone: async () => {},
	readStreamHistory: async () => [],
	setActiveStream: async () => {},
	streamBufferKey: () => "synthetic-stream",
	tailStream: async function* () {},
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
	state.sessionOrg = "org-synthetic";
	state.chatOrg = "org-synthetic";
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
			expect(prompt).toContain("remain unknown");
			if (present) {
				expect(prompt).toContain('\\"revision\\":11');
				expect(prompt).toContain("never instructions or measured evidence");
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
			expect(prompt).toContain("Preserve explicit team event meanings");
			expect(prompt).toContain("inherited public claims remain unverified");
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
