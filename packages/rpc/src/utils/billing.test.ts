import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const ORGANIZATION_ID = "org-billing";
const OWNER_ID = "owner-1";

let ownerId: string | null = OWNER_ID;
let memberRole: string | null = null;

const mockGetOrCreate = mock(async () => ({ subscriptions: [] }));
const mockLoggerError = mock(() => undefined);
const mockGetOrganizationOwnerId = mock(async () => ownerId);
const mockGetMemberRole = mock(async () => memberRole);

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

mock.module("./organization", () => ({
	getMemberRole: mockGetMemberRole,
	getOrganizationOwnerId: mockGetOrganizationOwnerId,
}));

const { getBillingCustomerId, resolveBillingOwner } = await import("./billing");

afterAll(() => {
	mock.restore();
});

beforeEach(() => {
	ownerId = OWNER_ID;
	memberRole = null;
	mockGetOrCreate.mockClear();
	mockLoggerError.mockClear();
	mockGetOrganizationOwnerId.mockClear();
	mockGetMemberRole.mockClear();
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

	it.each([
		[
			"prefers the active base plan over an active add-on",
			[
				{ status: "active", addOn: true, planId: "Credits" },
				{ status: "active", addOn: false, planId: "Pro" },
			],
			"pro",
		],
		[
			"falls back to an active add-on when no base plan is active",
			[{ status: "active", addOn: true, planId: "Credits" }],
			"credits",
		],
		[
			"treats inactive subscriptions as free",
			[{ status: "canceled", addOn: false, planId: "Pro" }],
			"free",
		],
		["treats no subscriptions as free", [], "free"],
	])("%s", async (_name, subscriptions, expectedPlan) => {
		mockGetOrCreate.mockImplementation(async () => ({ subscriptions }));

		const owner = await resolveBillingOwner("user-3", null);

		expect(owner.planId).toBe(expectedPlan);
	});

	it("bills the organization owner and lets the owner upgrade", async () => {
		const owner = await resolveBillingOwner(OWNER_ID, ORGANIZATION_ID);

		expect(owner).toMatchObject({
			canUserUpgrade: true,
			customerId: OWNER_ID,
			isOrganization: true,
		});
	});

	it.each([
		["admin", true],
		["member", false],
		[null, false],
	])(
		"lets a non-owner with role %p upgrade=%p",
		async (role, canUserUpgrade) => {
			memberRole = role;

			const owner = await resolveBillingOwner("user-4", ORGANIZATION_ID);

			expect(owner).toMatchObject({
				canUserUpgrade,
				customerId: OWNER_ID,
				isOrganization: true,
			});
		}
	);

	it("falls back to personal billing when the organization owner cannot be resolved", async () => {
		ownerId = null;

		const owner = await resolveBillingOwner("user-5", ORGANIZATION_ID);

		expect(owner).toMatchObject({
			canUserUpgrade: true,
			customerId: "user-5",
			isOrganization: false,
		});
	});
});

describe("getBillingCustomerId", () => {
	it("bills the user directly without an organization", async () => {
		await expect(getBillingCustomerId("user-6", null)).resolves.toBe("user-6");
	});

	it("bills the organization owner when one exists", async () => {
		await expect(getBillingCustomerId("user-6", ORGANIZATION_ID)).resolves.toBe(
			OWNER_ID
		);
	});

	it("falls back to the user when the organization has no owner", async () => {
		ownerId = null;

		await expect(getBillingCustomerId("user-6", ORGANIZATION_ID)).resolves.toBe(
			"user-6"
		);
	});
});
