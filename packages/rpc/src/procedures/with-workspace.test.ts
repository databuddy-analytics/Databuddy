import {
	beforeAll,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
	mock,
} from "bun:test";
import type { Context } from "../orpc";
import type {
	PublicWorkspace,
	PublicWorkspaceWithPlan,
} from "./with-workspace";

process.env.REDIS_URL ??= "redis://localhost:6379";

const ORGANIZATION_ID = "org-test";
const OTHER_ORGANIZATION_ID = "org-other";
const USER_ID = "user-test";
const WEBSITE_ID = "site-test";
const OTHER_WEBSITE_ID = "site-other";

type WebsiteRow = { id: string; organizationId: string; isPublic: boolean };

const websites = new Map<string, WebsiteRow>();
const memberRoles = new Map<string, string>();

const getMemberRoleFake: typeof import("../utils/organization").getMemberRole =
	async (userId, organizationId) =>
		memberRoles.get(`${userId}:${organizationId}`) ?? null;
const getOrganizationOwnerIdFake: typeof import("../utils/organization").getOrganizationOwnerId =
	async () => "org-owner";

const mockWebsiteFindFirst = mock(
	async ({ where }: { where: { id: string } }) => websites.get(where.id) ?? null
);
const mockGetMemberRole = mock(getMemberRoleFake);
const mockGetOrganizationOwnerId = mock(getOrganizationOwnerIdFake);

let createInternalPrincipal: typeof import("../orpc").createInternalPrincipal;
let requireLinkAccess: typeof import("../routers/link-access").requireLinkAccess;
let withWorkspace: typeof import("./with-workspace").withWorkspace;
let withPublicWorkspace: typeof import("./with-workspace").withPublicWorkspace;

beforeAll(async () => {
	const realDb = await import("@databuddy/db");
	const realRedis = await import("@databuddy/redis");

	mock.module("@databuddy/db", () => ({
		...realDb,
		db: { query: { websites: { findFirst: mockWebsiteFindFirst } } },
	}));
	mock.module("@databuddy/redis", () => ({
		...realRedis,
		cacheable: <T extends (...args: never[]) => unknown>(fn: T) => fn,
	}));
	mock.module("../utils/organization", () => ({
		getMemberRole: mockGetMemberRole,
		getOrganizationOwnerId: mockGetOrganizationOwnerId,
	}));

	({ createInternalPrincipal } = await import("../orpc"));
	({ requireLinkAccess } = await import("../routers/link-access"));
	({ withWorkspace, withPublicWorkspace } = await import("./with-workspace"));

	mock.restore();
});

beforeEach(() => {
	websites.clear();
	memberRoles.clear();
	mockWebsiteFindFirst.mockClear();
	mockGetMemberRole.mockClear();
	mockGetOrganizationOwnerId.mockClear();
});

function userContext(
	overrides: Partial<Pick<Context, "organizationId" | "getBilling">> = {}
): Context {
	return {
		apiKey: undefined,
		getBilling: overrides.getBilling ?? (async () => undefined),
		organizationId:
			"organizationId" in overrides
				? overrides.organizationId
				: ORGANIZATION_ID,
		session: undefined,
		user: { email: "member@example.com", id: USER_ID, name: "Member" },
	} as Context;
}

function apiKeyContext(
	init: {
		getBilling?: Context["getBilling"];
		metadata?: Record<string, unknown>;
		organizationId?: string;
		scopes?: string[];
	} = {}
): Context {
	const organizationId = init.organizationId ?? ORGANIZATION_ID;
	const principal = createInternalPrincipal({
		metadata: init.metadata,
		organizationId,
		scopes: init.scopes ?? ["write:links"],
	});

	return {
		...principal,
		getBilling: init.getBilling ?? (async () => undefined),
		organizationId,
		user: undefined,
	} as Context;
}

function anonymousContext(): Context {
	return {
		apiKey: undefined,
		getBilling: async () => undefined,
		organizationId: null,
		session: undefined,
		user: undefined,
	} as Context;
}

async function expectRpcError(
	promise: Promise<unknown>,
	code: string,
	message?: RegExp
): Promise<void> {
	let error: unknown;
	try {
		await promise;
	} catch (caught) {
		error = caught;
	}

	expect(error).toBeDefined();
	expect((error as { code?: string }).code).toBe(code);
	if (message) {
		expect((error as { message?: string }).message).toMatch(message);
	}
}

describe("withWorkspace organization member grants", () => {
	it("grants a member whose role allows the requested action", async () => {
		memberRoles.set(`${USER_ID}:${ORGANIZATION_ID}`, "admin");

		const workspace = await withWorkspace(userContext(), {
			organizationId: ORGANIZATION_ID,
			permissions: ["delete"],
			resource: "link",
		});

		expect(workspace.organizationId).toBe(ORGANIZATION_ID);
		expect(workspace.role).toBe("admin");
		expect(workspace.user?.id).toBe(USER_ID);
	});

	it.each([
		["viewer", "create"],
		["member", "delete"],
		["superuser", "read"],
	] as const)(
		"denies a %s role missing the %s permission",
		async (role, permission) => {
			memberRoles.set(`${USER_ID}:${ORGANIZATION_ID}`, role);

			await expectRpcError(
				withWorkspace(userContext(), {
					organizationId: ORGANIZATION_ID,
					permissions: [permission],
					resource: "link",
				}),
				"FORBIDDEN",
				/Missing required link permissions/
			);
		}
	);

	it("denies a user who is not a member of the organization", async () => {
		await expectRpcError(
			withWorkspace(userContext(), {
				organizationId: ORGANIZATION_ID,
				permissions: ["read"],
				resource: "link",
			}),
			"FORBIDDEN",
			/not a member of this organization/
		);
	});

	it("denies targeting another organization than the active one", async () => {
		memberRoles.set(`${USER_ID}:${ORGANIZATION_ID}`, "owner");

		await expectRpcError(
			withWorkspace(userContext({ organizationId: OTHER_ORGANIZATION_ID }), {
				organizationId: ORGANIZATION_ID,
				permissions: ["read"],
				resource: "link",
			}),
			"FORBIDDEN",
			/does not belong to the active organization/
		);
		expect(mockGetMemberRole).not.toHaveBeenCalledWith(
			USER_ID,
			ORGANIZATION_ID
		);
	});

	it("allows targeting another organization with allowCrossOrg", async () => {
		memberRoles.set(`${USER_ID}:${ORGANIZATION_ID}`, "member");

		const workspace = await withWorkspace(
			userContext({ organizationId: OTHER_ORGANIZATION_ID }),
			{
				allowCrossOrg: true,
				organizationId: ORGANIZATION_ID,
				permissions: ["read"],
				resource: "link",
			}
		);

		expect(workspace.organizationId).toBe(ORGANIZATION_ID);
		expect(workspace.role).toBe("member");
	});

	it("requires a resolvable organization", async () => {
		await expectRpcError(
			withWorkspace(userContext({ organizationId: null }), {
				permissions: ["read"],
				resource: "link",
			}),
			"BAD_REQUEST",
			/Workspace is required/
		);
	});
});

describe("withWorkspace api key grants", () => {
	it("denies a key that belongs to another organization", async () => {
		await expectRpcError(
			withWorkspace(apiKeyContext({ organizationId: OTHER_ORGANIZATION_ID }), {
				organizationId: ORGANIZATION_ID,
				permissions: ["read"],
				resource: "link",
			}),
			"FORBIDDEN",
			/API key does not have access to this workspace/
		);
	});

	it("denies a key missing the scope required by the action", async () => {
		await expectRpcError(
			withWorkspace(apiKeyContext({ scopes: ["read:links"] }), {
				organizationId: ORGANIZATION_ID,
				permissions: ["create"],
				resource: "link",
			}),
			"FORBIDDEN",
			/API key missing required scope: write:links/
		);
	});

	it("limits website-scoped keys to their granted website", async () => {
		websites.set(WEBSITE_ID, {
			id: WEBSITE_ID,
			isPublic: false,
			organizationId: ORGANIZATION_ID,
		});
		websites.set(OTHER_WEBSITE_ID, {
			id: OTHER_WEBSITE_ID,
			isPublic: false,
			organizationId: ORGANIZATION_ID,
		});
		const context = apiKeyContext({
			metadata: {
				resources: { [`website:${WEBSITE_ID}`]: ["read:data"] },
			},
			scopes: [],
		});

		const granted = await withWorkspace(context, {
			permissions: ["read"],
			websiteId: WEBSITE_ID,
		});

		expect(granted.website.id).toBe(WEBSITE_ID);
		expect(granted.user).toBeNull();
		expect(granted.role).toBeNull();

		await expectRpcError(
			withWorkspace(context, {
				permissions: ["read"],
				websiteId: OTHER_WEBSITE_ID,
			}),
			"FORBIDDEN",
			/API key missing required scope: read:data/
		);
	});

	it("denies plan-gated access below the required plan", async () => {
		const getBilling = mock(async () => ({
			canUserUpgrade: true,
			customerId: "owner-test",
			isOrganization: true,
			planId: "free",
		}));

		await expectRpcError(
			withWorkspace(apiKeyContext({ getBilling }), {
				organizationId: ORGANIZATION_ID,
				permissions: ["create"],
				requiredPlans: ["pro"],
				resource: "link",
			}),
			"FEATURE_UNAVAILABLE"
		);
		expect(getBilling).toHaveBeenCalledTimes(1);
	});
});

describe("withWorkspace website resolution", () => {
	it("rejects unknown websites", async () => {
		await expectRpcError(
			withWorkspace(userContext(), {
				permissions: ["read"],
				websiteId: "missing-site",
			}),
			"NOT_FOUND"
		);
	});

	it("rejects websites that belong to another organization", async () => {
		websites.set(WEBSITE_ID, {
			id: WEBSITE_ID,
			isPublic: false,
			organizationId: OTHER_ORGANIZATION_ID,
		});

		await expectRpcError(
			withWorkspace(userContext(), {
				organizationId: ORGANIZATION_ID,
				permissions: ["read"],
				websiteId: WEBSITE_ID,
			}),
			"FORBIDDEN",
			/Website does not belong to this organization/
		);
	});

	it("rejects principals without a user or api key", async () => {
		await expectRpcError(
			withWorkspace(anonymousContext(), {
				organizationId: ORGANIZATION_ID,
				permissions: ["read"],
				resource: "link",
			}),
			"UNAUTHORIZED"
		);
	});
});

describe("withPublicWorkspace demo access", () => {
	it("grants anonymous read access to public websites as the demo tier", async () => {
		websites.set(WEBSITE_ID, {
			id: WEBSITE_ID,
			isPublic: true,
			organizationId: ORGANIZATION_ID,
		});

		const workspace = await withPublicWorkspace(anonymousContext(), {
			permissions: ["read"],
			websiteId: WEBSITE_ID,
		});

		expect(workspace.tier).toBe("demo");
		expect(workspace.role).toBeNull();
		expect(workspace.website.id).toBe(WEBSITE_ID);
	});

	it("denies anonymous write access even on public websites", async () => {
		websites.set(WEBSITE_ID, {
			id: WEBSITE_ID,
			isPublic: true,
			organizationId: ORGANIZATION_ID,
		});

		await expectRpcError(
			withPublicWorkspace(anonymousContext(), {
				permissions: ["update"],
				websiteId: WEBSITE_ID,
			}),
			"UNAUTHORIZED"
		);
	});

	it("denies anonymous access to private websites", async () => {
		websites.set(WEBSITE_ID, {
			id: WEBSITE_ID,
			isPublic: false,
			organizationId: ORGANIZATION_ID,
		});

		await expectRpcError(
			withPublicWorkspace(anonymousContext(), {
				permissions: ["read"],
				websiteId: WEBSITE_ID,
			}),
			"UNAUTHORIZED"
		);
	});
});

describe("withWorkspace plan resolution", () => {
	it("keeps plan-free and plan-aware public results distinct", () => {
		expectTypeOf<PublicWorkspace>().not.toHaveProperty("plan");
		expectTypeOf<PublicWorkspaceWithPlan>().toHaveProperty("plan");
	});

	it("does not resolve billing for plan-free link access", async () => {
		const getBilling = mock(async () => ({
			canUserUpgrade: true,
			customerId: "user-test",
			isOrganization: true,
			planId: "pro",
		}));

		const workspace = await requireLinkAccess(
			apiKeyContext({ getBilling }),
			ORGANIZATION_ID,
			"create"
		);

		expect(getBilling).not.toHaveBeenCalled();
		expect("plan" in workspace).toBe(false);
	});

	it("requiredPlans forces real plan resolution defensively", async () => {
		const getBilling = mock(async () => ({
			canUserUpgrade: true,
			customerId: "user-test",
			isOrganization: true,
			planId: "pro",
		}));

		const workspace = await withWorkspace(apiKeyContext({ getBilling }), {
			organizationId: ORGANIZATION_ID,
			resource: "link",
			permissions: ["create"],
			includePlan: false,
			requiredPlans: ["pro"],
		});

		expect(getBilling).toHaveBeenCalledTimes(1);
		expect(workspace.plan).toBe("pro");
	});

	it("preserves the free fallback for explicit plan consumers", async () => {
		const getBilling = mock(async () => undefined);

		const workspace = await withWorkspace(apiKeyContext({ getBilling }), {
			organizationId: ORGANIZATION_ID,
			resource: "link",
			permissions: ["create"],
			includePlan: true,
		});

		expect(getBilling).toHaveBeenCalledTimes(1);
		expect(workspace.plan).toBe("free");
	});
});
