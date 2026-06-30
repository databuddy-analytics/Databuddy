import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const mockGetOrCreate = mock(async () => ({ subscriptions: [] }));
const mockLoggerError = mock(() => undefined);

mock.module("../lib/autumn-client", () => ({
	getAutumn: () => ({
		customers: {
			getOrCreate: mockGetOrCreate,
		},
	}),
}));

mock.module("../lib/logger", () => ({
	logger: {
		error: mockLoggerError,
		info: mock(() => undefined),
		warn: mock(() => undefined),
	},
	record: <T>(_name: string, fn: () => Promise<T> | T) => fn(),
}));

const { resolveBillingOwner } = await import("./billing");

afterAll(() => {
	mock.restore();
});

beforeEach(() => {
	mockGetOrCreate.mockClear();
	mockLoggerError.mockClear();
	mockGetOrCreate.mockImplementation(async () => ({ subscriptions: [] }));
});

describe("resolveBillingOwner", () => {
	it("propagates Autumn lookup failures instead of returning a cacheable free-plan fallback", async () => {
		mockGetOrCreate.mockImplementationOnce(async () => {
			throw new Error("autumn unavailable");
		});

		await expect(resolveBillingOwner("user-1", null)).rejects.toThrow(
			"autumn unavailable"
		);
		expect(mockLoggerError).toHaveBeenCalledTimes(1);
	});

	it("resolves and normalizes the active billing plan when Autumn succeeds", async () => {
		mockGetOrCreate.mockImplementation(async () => ({
			subscriptions: [{ status: "active", addOn: false, planId: "Hobby" }],
		}));

		const owner = await resolveBillingOwner("user-2", null);

		expect(owner).toMatchObject({
			canUserUpgrade: true,
			customerId: "user-2",
			isOrganization: false,
			planId: "hobby",
		});
		expect(mockGetOrCreate).toHaveBeenCalledTimes(1);
	});
});
