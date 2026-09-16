import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { createLogger } from "evlog";

const originalAutumnSecretKey = process.env.AUTUMN_SECRET_KEY;

const mockAutumnCheck = mock(async (input: { customerId: string }) => ({
	allowed: true,
	customerId: input.customerId,
	balance: {
		featureId: "agent_credits",
		granted: 100,
		remaining: 42,
		unlimited: false,
		usage: 58,
	},
}));
const mockAutumnTrack = mock(async () => undefined);
const mockGetBillingCustomerId = mock(
	async (userId: string, organizationId?: string | null) =>
		organizationId ? `billing:${organizationId}:${userId}` : `billing:${userId}`
);
const mockGetOrganizationOwnerId = mock(async (organizationId: string) =>
	organizationId === "org_missing" ? null : `owner:${organizationId}`
);
const mockMergeWideEvent = mock((_: Record<string, unknown>) => {});

mock.module("@databuddy/rpc/autumn", () => ({
	getAutumn: () => ({
		customers: { get: async (input: { customerId: string }) => ({ id: input.customerId, flags: {} }) },
		check: mockAutumnCheck,
		track: mockAutumnTrack,
	}),
}));

mock.module("@databuddy/rpc/billing", () => ({
	getBillingCustomerId: mockGetBillingCustomerId,
	getBillingOwner: mock(
		async (userId: string, organizationId?: string | null) => ({
			canUserUpgrade: true,
			customerId: await mockGetBillingCustomerId(userId, organizationId),
			isOrganization: Boolean(organizationId),
			planId: "free",
		})
	),
}));

mock.module("@databuddy/rpc/organization", () => ({
	getMemberRole: mock(async () => "owner"),
	getOrganizationOwnerId: mockGetOrganizationOwnerId,
}));

mock.module("../../lib/databuddy", () => ({
	trackAgentEvent: mock(() => {}),
}));

mock.module("../../lib/tracing", () => ({
	captureError: mock(() => {}),
	mergeWideEvent: mockMergeWideEvent,
}));

const {
	getAgentBillingAccess,
	isAgentBillingConfigured,
	resolveAgentBillingCustomerId,
	trackAgentUsage,
	trackAgentUsageAndBill,
} = await import("./execution");

type AgentPrincipal = Parameters<typeof resolveAgentBillingCustomerId>[0];
type ApiKeyPrincipal = NonNullable<AgentPrincipal["apiKey"]>;

beforeEach(() => {
	process.env.AUTUMN_SECRET_KEY = "test-autumn-secret";
	mockAutumnCheck.mockClear();
	mockAutumnTrack.mockClear();
	mockGetBillingCustomerId.mockClear();
	mockGetOrganizationOwnerId.mockClear();
	mockMergeWideEvent.mockClear();
});

afterAll(() => {
	if (originalAutumnSecretKey === undefined) {
		delete process.env.AUTUMN_SECRET_KEY;
	} else {
		process.env.AUTUMN_SECRET_KEY = originalAutumnSecretKey;
	}
});

describe("resolveAgentBillingCustomerId", () => {
	it("bills the organization owner for org-scoped automation keys without a user", async () => {
		const customerId = await resolveAgentBillingCustomerId({
			apiKey: {
				organizationId: "org_slack",
				userId: null,
			} as ApiKeyPrincipal,
			organizationId: null,
			userId: null,
		});

		expect(customerId).toBe("owner:org_slack");
		expect(mockGetOrganizationOwnerId).toHaveBeenCalledWith("org_slack");
		expect(mockGetBillingCustomerId).not.toHaveBeenCalled();
		expect(mockMergeWideEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				agent_billing_resolution: "api_key_org_owner",
				billing_customer_id: "owner:org_slack",
				organization_id: "org_slack",
			})
		);
	});

	it("bills the organization owner for org-scoped API keys even when the key has a user", async () => {
		const customerId = await resolveAgentBillingCustomerId({
			apiKey: {
				organizationId: "org_slack",
				userId: "installer_123",
			} as ApiKeyPrincipal,
			organizationId: null,
			userId: "installer_123",
		});

		expect(customerId).toBe("owner:org_slack");
		expect(mockGetOrganizationOwnerId).toHaveBeenCalledWith("org_slack");
		expect(mockGetBillingCustomerId).not.toHaveBeenCalled();
	});

	it("uses the standard billing owner resolver for session users", async () => {
		const customerId = await resolveAgentBillingCustomerId({
			apiKey: null,
			organizationId: "org_slack",
			userId: "user_123",
		});

		expect(customerId).toBe("billing:org_slack:user_123");
		expect(mockGetBillingCustomerId).toHaveBeenCalledWith(
			"user_123",
			"org_slack"
		);
		expect(mockGetOrganizationOwnerId).not.toHaveBeenCalled();
	});

	it("returns null when neither a user nor organization can be resolved", async () => {
		const customerId = await resolveAgentBillingCustomerId({
			apiKey: null,
			organizationId: null,
			userId: null,
		});

		expect(customerId).toBeNull();
	});

	it("does not resolve a billing owner when Autumn is not configured", async () => {
		delete process.env.AUTUMN_SECRET_KEY;

		const customerId = await resolveAgentBillingCustomerId({
			apiKey: null,
			organizationId: "self-hosted-org",
			userId: "self-hosted-user",
		});

		expect(isAgentBillingConfigured()).toBe(false);
		expect(customerId).toBeNull();
		expect(mockGetBillingCustomerId).not.toHaveBeenCalled();
		expect(mockGetOrganizationOwnerId).not.toHaveBeenCalled();
		expect(mockMergeWideEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				agent_billing_resolution: "billing_disabled",
				organization_id: "self-hosted-org",
			})
		);
	});
});

describe("getAgentBillingAccess", () => {
	it("logs the checked Autumn customer and balance", async () => {
		const { allowed } = await getAgentBillingAccess("owner:org_slack");

		expect(allowed).toBe(true);
		expect(mockAutumnCheck).toHaveBeenCalledWith({
			customerId: "owner:org_slack",
			featureId: "agent_credits",
			requiredBalance: 0.01,
		});
		expect(mockMergeWideEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				agent_credits_allowed: true,
				agent_credits_feature_id: "agent_credits",
				agent_credits_granted: 100,
				agent_credits_remaining: 42,
				agent_credits_unlimited: false,
				agent_credits_usage: 58,
				billing_customer_id: "owner:org_slack",
			})
		);
	});

	it("skips Autumn when billing is not configured", async () => {
		delete process.env.AUTUMN_SECRET_KEY;

		const { allowed } = await getAgentBillingAccess("self-hosted-user");

		expect(allowed).toBe(true);
		expect(mockAutumnCheck).not.toHaveBeenCalled();
		expect(mockMergeWideEvent).toHaveBeenCalledWith({
			agent_credits_allowed: true,
			agent_credits_check_skipped: true,
		});
	});
});

describe("trackAgentUsage", () => {
	it("records usage on an explicit call logger without ambient request context", () => {
		const requestLogger = createLogger({ test: true });
		const summary = trackAgentUsage({
			requestLogger,
			modelId: "openai/gpt-5.6-luna",
			source: "dashboard",
			usage: { inputTokens: 1000, outputTokens: 100 },
		});
		expect(requestLogger.getContext()).toMatchObject(summary);
		expect(mockMergeWideEvent).not.toHaveBeenCalled();
	});
	it("retains model costs without consuming credits when billing is configured", () => {
		const summary = trackAgentUsage({
			billingCustomerId: "owner:synthetic-org",
			modelId: "openai/gpt-5.6-luna",
			source: "insights",
			usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
		});

		expect(summary.cost_fallback).toBe(false);
		expect(summary.cost_total_usd).toBe(1.4);
		expect(mockMergeWideEvent).toHaveBeenCalledWith(summary);
		expect(mockAutumnCheck).not.toHaveBeenCalled();
		expect(mockAutumnTrack).not.toHaveBeenCalled();
	});
});

describe("trackAgentUsageAndBill", () => {
	it("records a swallowed charge error on the supplied call logger", async () => {
		const requestLogger = createLogger({ test: true });
		mockAutumnTrack.mockRejectedValueOnce(new Error("Synthetic charge failed"));
		await trackAgentUsageAndBill({
			requestLogger,
			billingCustomerId: "owner:example-org",
			billingAccess: { allowed: true, customerId: "owner:example-org" },
			modelId: "openai/gpt-5.6-luna",
			source: "dashboard",
			usage: { inputTokens: 1000, outputTokens: 100 },
		});
		expect(requestLogger.getContext()).toMatchObject({
			agent_usage_billing_error: true,
			agent_source: "dashboard",
		});
		expect(mockAutumnCheck).not.toHaveBeenCalled();
	});
	it("deduplicates retryable usage charges", async () => {
		await trackAgentUsageAndBill({
			billingCustomerId: "owner:org_slack",
			idempotencyKey: "insights:run-1:site-1",
			modelId: "anthropic/claude-sonnet-4.6",
			source: "insights",
			usage: { inputTokens: 1000, outputTokens: 100 },
		});

		expect(mockAutumnTrack).toHaveBeenCalledWith(
			expect.objectContaining({ featureId: "agent_credits" }),
			{ headers: { "Idempotency-Key": "insights:run-1:site-1" } }
		);
	});

	it("records usage without billing when Autumn is not configured", async () => {
		delete process.env.AUTUMN_SECRET_KEY;

		const summary = await trackAgentUsageAndBill({
			billingCustomerId: "self-hosted-user",
			modelId: "anthropic/claude-sonnet-4.6",
			source: "insights",
			usage: { inputTokens: 1000, outputTokens: 100 },
		});

		expect(summary.agent_credits_used).toBeGreaterThan(0);
		expect(mockAutumnTrack).not.toHaveBeenCalled();
	});
});

it("self-hosted AI keeps provider setup and skips all hosted billing", async () => {
	const original = process.env;
	process.env = {
		...original,
		SELFHOST: "true",
		AI_GATEWAY_API_KEY: "synthetic-ai-key",
	};
	try {
		expect(isAgentBillingConfigured()).toBe(false);
		expect(
			await resolveAgentBillingCustomerId({
				organizationId: "synthetic-org",
				userId: "synthetic-user",
			})
		).toBeNull();
		expect(await getAgentBillingAccess(null)).toEqual({
			allowed: true,
			customerId: null,
		});
		await trackAgentUsageAndBill({
			billingCustomerId: "stale-customer",
			modelId: "openai/gpt-5.6-luna",
			source: "dashboard",
			usage: { inputTokens: 1000, outputTokens: 100 },
		});
		expect(mockAutumnCheck).not.toHaveBeenCalled();
		expect(mockAutumnTrack).not.toHaveBeenCalled();
		expect(mockGetBillingCustomerId).not.toHaveBeenCalled();
		delete process.env.AI_GATEWAY_API_KEY;
		await expect(getAgentBillingAccess(null)).rejects.toThrow("configure AI");
	} finally {
		process.env = original;
	}
});
