import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getBillingOwner: vi.fn(),
	getOrganizationOwnerId: vi.fn(),
	getSession: vi.fn(),
	isApiKeyPresent: vi.fn(),
	mergeWideEvent: vi.fn(),
	resolveApiKey: vi.fn(),
}));

vi.mock("@databuddy/api-keys/resolve", () => ({
	isApiKeyPresent: mocks.isApiKeyPresent,
	resolveApiKey: mocks.resolveApiKey,
}));

vi.mock("@databuddy/ai/lib/tracing", () => ({
	mergeWideEvent: mocks.mergeWideEvent,
}));

vi.mock("@databuddy/auth", () => ({
	auth: {
		api: {
			getSession: mocks.getSession,
		},
	},
}));

vi.mock("@databuddy/rpc/billing", () => ({
	getBillingOwner: mocks.getBillingOwner,
}));

vi.mock("@databuddy/rpc/organization", () => ({
	getOrganizationOwnerId: mocks.getOrganizationOwnerId,
}));

import { applyAuthWideEvent } from "./auth-wide-event";

beforeEach(() => {
	mocks.getSession.mockReset();
	mocks.getBillingOwner.mockReset();
	mocks.getOrganizationOwnerId.mockReset();
	mocks.isApiKeyPresent.mockReset();
	mocks.mergeWideEvent.mockReset();
	mocks.resolveApiKey.mockReset();

	mocks.isApiKeyPresent.mockReturnValue(false);
	mocks.resolveApiKey.mockResolvedValue(null);
	mocks.getBillingOwner.mockResolvedValue({ planId: "free" });
	mocks.getOrganizationOwnerId.mockResolvedValue(null);
});

describe("applyAuthWideEvent", () => {
	it("adds the organization plan and paid tier for session-authenticated requests", async () => {
		mocks.getSession.mockResolvedValue({
			session: { activeOrganizationId: "org-1" },
			user: { email: "user@example.com", id: "user-1", role: "member" },
		});
		mocks.getBillingOwner.mockResolvedValue({ planId: "pro" });

		await applyAuthWideEvent(new Headers());

		expect(mocks.getBillingOwner).toHaveBeenCalledWith("user-1", "org-1");
		expect(mocks.mergeWideEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				billing_plan: "pro",
				billing_plan_resolution: "resolved",
				billing_plan_tier: "paid",
				organization_id: "org-1",
			})
		);
	});

	it("uses the organization owner to resolve the plan for organization API keys", async () => {
		mocks.isApiKeyPresent.mockReturnValue(true);
		mocks.getSession.mockResolvedValue(null);
		mocks.resolveApiKey.mockResolvedValue({
			key: {
				id: "key-1",
				organizationId: "org-1",
				prefix: "dbdy",
				scopes: ["read:data"],
				type: "standard",
				userId: null,
			},
		});
		mocks.getOrganizationOwnerId.mockResolvedValue("owner-1");

		await applyAuthWideEvent(new Headers({ "x-api-key": "key" }));

		expect(mocks.getOrganizationOwnerId).toHaveBeenCalledWith("org-1");
		expect(mocks.getBillingOwner).toHaveBeenCalledWith("owner-1", "org-1");
		expect(mocks.mergeWideEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				billing_plan: "free",
				billing_plan_resolution: "resolved",
				billing_plan_tier: "free",
			})
		);
	});

	it("keeps the request available when billing-plan enrichment fails", async () => {
		mocks.getSession.mockResolvedValue({
			session: { activeOrganizationId: null },
			user: { id: "user-1" },
		});
		mocks.getBillingOwner.mockRejectedValue(new Error("Autumn unavailable"));

		await expect(applyAuthWideEvent(new Headers())).resolves.toBeUndefined();
		expect(mocks.mergeWideEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				billing_plan_resolution: "unavailable",
			})
		);
		expect(mocks.mergeWideEvent).toHaveBeenCalledWith(
			expect.not.objectContaining({ billing_plan: expect.any(String) })
		);
	});

	it("marks requests without a billing customer as unresolved", async () => {
		mocks.getSession.mockResolvedValue(null);

		await applyAuthWideEvent(new Headers());

		expect(mocks.getBillingOwner).not.toHaveBeenCalled();
		expect(mocks.mergeWideEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				billing_plan_resolution: "missing_customer",
			})
		);
	});
});
