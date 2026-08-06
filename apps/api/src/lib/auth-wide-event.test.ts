import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
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

import { applyAuthWideEvent, getResolvedAuth } from "./auth-wide-event";

beforeEach(() => {
	mocks.getSession.mockReset();
	mocks.isApiKeyPresent.mockReset();
	mocks.mergeWideEvent.mockReset();
	mocks.resolveApiKey.mockReset();

	mocks.isApiKeyPresent.mockReturnValue(false);
	mocks.resolveApiKey.mockResolvedValue(null);
});

describe("applyAuthWideEvent", () => {
	it("returns resolved session auth and emits its request fields", async () => {
		mocks.getSession.mockResolvedValue({
			session: { activeOrganizationId: "org-1" },
			user: { email: "user@example.com", id: "user-1", role: "member" },
		});
		const resolvedAuth = await applyAuthWideEvent(new Headers());

		expect(getResolvedAuth({ resolvedAuth })).toMatchObject({
			session: { user: { id: "user-1" } },
		});
		expect(mocks.mergeWideEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				auth_method: "session",
				organization_id: "org-1",
				user_email: "user@example.com",
				user_id: "user-1",
				user_role: "member",
			})
		);
	});

	it("fails safely when session auth is unavailable without a valid API key", async () => {
		mocks.getSession.mockRejectedValue(new Error("session unavailable"));

		await expect(applyAuthWideEvent(new Headers())).rejects.toThrow(
			"session unavailable"
		);
		expect(mocks.mergeWideEvent).not.toHaveBeenCalled();
	});

	it("keeps auth resolution available when telemetry emission fails", async () => {
		mocks.getSession.mockResolvedValue({
			session: { activeOrganizationId: null },
			user: { id: "user-1" },
		});
		mocks.mergeWideEvent.mockImplementation(() => {
			throw new Error("evlog unavailable");
		});

		await expect(applyAuthWideEvent(new Headers())).resolves.toMatchObject({
			session: { user: { id: "user-1" } },
		});
	});

});
