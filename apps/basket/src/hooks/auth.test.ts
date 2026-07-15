import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
	captureError: vi.fn(),
	findOwner: vi.fn(),
}));

vi.mock("@databuddy/db", () => ({
	db: {
		query: {
			member: { findFirst: state.findOwner },
			websites: { findFirst: vi.fn() },
		},
	},
}));

vi.mock("@databuddy/redis/cache-invalidation", () => ({
	cacheNamespaces: {
		apiKeyOwnerId: "api-key-owner-id",
		websiteWithOwner: "website-with-owner",
	},
}));

vi.mock("@databuddy/redis/cacheable", () => ({
	cacheable: (fn: unknown) => fn,
}));

vi.mock("@lib/structured-errors", () => ({
	basketErrors: {
		billingCheckUnavailable: () => new Error("billing check unavailable"),
		websiteLookupUnavailable: () => new Error("website lookup unavailable"),
	},
}));

vi.mock("@lib/tracing", () => ({
	captureError: state.captureError,
	record: (_name: string, callback: () => unknown) => callback(),
}));

vi.mock("@utils/origin-ip-validation", () => ({
	isValidOriginFromSettings: vi.fn(() => false),
}));

const { resolveApiKeyOwnerId } = await import("./auth");

describe("website owner lookup", () => {
	beforeEach(() => {
		state.captureError.mockClear();
		state.findOwner.mockReset();
	});

	test("returns the organization owner when lookup succeeds", async () => {
		state.findOwner.mockResolvedValueOnce({ userId: "owner-1" });

		await expect(resolveApiKeyOwnerId("org-1")).resolves.toBe("owner-1");
	});

	test("does not look up an owner for a personal website", async () => {
		await expect(resolveApiKeyOwnerId(null)).resolves.toBeNull();
		expect(state.findOwner).not.toHaveBeenCalled();
	});

	test("fails closed when the owner lookup is unavailable", async () => {
		const error = new Error("database unavailable");
		state.findOwner.mockRejectedValueOnce(error);

		await expect(resolveApiKeyOwnerId("org-1")).rejects.toThrow(
			"billing check unavailable"
		);
		expect(state.captureError).toHaveBeenCalledWith(error, {
			message: "Workspace owner lookup failed",
			organizationId: "org-1",
		});
	});

	test("fails closed when an organization has no owner", async () => {
		state.findOwner.mockResolvedValueOnce(null);

		await expect(resolveApiKeyOwnerId("org-1")).rejects.toThrow(
			"billing check unavailable"
		);
		expect(state.captureError).toHaveBeenCalledWith(expect.any(Error), {
			message: "Workspace owner lookup returned no owner",
			organizationId: "org-1",
		});
	});
});
