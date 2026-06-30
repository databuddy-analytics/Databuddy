import "@databuddy/test/env";

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createProcedureClient } from "@orpc/server";
import {
	withWorkspace,
	withPublicWorkspace,
	appRouter,
	type Context,
} from "@databuddy/rpc";
import {
	reset,
	cleanup,
	context,
	hasTestDb,
	userContext,
	apiKeyContext,
	expectCode,
	insertOrganization,
	insertWebsite,
	signUp,
	addToOrganization,
} from "@databuddy/test";

const iit = hasTestDb ? it : it.skip;

function call<T>(procedure: T, ctx: Context) {
	return createProcedureClient(procedure as any, { context: ctx });
}

beforeEach(() => reset());
afterAll(() => cleanup());

describe("withWorkspace", () => {
	describe("no auth", () => {
		iit("rejects when no user or apiKey", async () => {
			const org = await insertOrganization();
			await expectCode(
				withWorkspace(context(), {
					organizationId: org.id,
					resource: "organization",
					permissions: ["read"],
				}),
				"UNAUTHORIZED",
			);
		});
	});

	describe("org resolution", () => {
		iit("rejects when no org is resolvable", async () => {
			const user = await signUp();
			const org = await insertOrganization();
			await addToOrganization(user.id, org.id, "owner");

			const ctx = context({
				user: { id: user.id, name: "test", email: user.email },
				headers: user.headers,
			});

			await expectCode(
				withWorkspace(ctx, {
					resource: "organization",
					permissions: ["read"],
				}),
				"BAD_REQUEST",
			);
		});

		iit("resolves org from websiteId when no explicit org", async () => {
			const user = await signUp();
			const org = await insertOrganization();
			await addToOrganization(user.id, org.id, "owner");
			const site = await insertWebsite({ organizationId: org.id });

			const ws = await withWorkspace(userContext(user, org.id), {
				websiteId: site.id,
				permissions: ["read"],
			});
			expect(ws.organizationId).toBe(org.id);
			expect(ws.website?.id).toBe(site.id);
		});
	});

	describe("website loading", () => {
		iit("rejects for nonexistent website", async () => {
			const user = await signUp();
			const org = await insertOrganization();
			await addToOrganization(user.id, org.id, "owner");

			await expectCode(
				withWorkspace(userContext(user, org.id), {
					websiteId: "nonexistent",
					permissions: ["read"],
				}),
				"NOT_FOUND",
			);
		});
	});

	describe("user membership + permissions", () => {
		iit("allows owner with read permission", async () => {
			const user = await signUp();
			const org = await insertOrganization();
			await addToOrganization(user.id, org.id, "owner");

			const ws = await withWorkspace(userContext(user, org.id), {
				organizationId: org.id,
				resource: "website",
				permissions: ["read"],
			});
			expect(ws.role).toBe("owner");
			expect(ws.tier).toBe("authed");
		});

		iit("allows viewer to read website", async () => {
			const user = await signUp();
			const org = await insertOrganization();
			await addToOrganization(user.id, org.id, "viewer");

			const ws = await withWorkspace(userContext(user, org.id), {
				organizationId: org.id,
				resource: "website",
				permissions: ["read"],
			});
			expect(ws.role).toBe("viewer");
		});

		iit("denies viewer from updating website", async () => {
			const user = await signUp();
			const org = await insertOrganization();
			await addToOrganization(user.id, org.id, "viewer");

			await expectCode(
				withWorkspace(userContext(user, org.id), {
					organizationId: org.id,
					resource: "website",
					permissions: ["update"],
				}),
				"FORBIDDEN",
			);
		});

		iit("denies member from creating website", async () => {
			const user = await signUp();
			const org = await insertOrganization();
			await addToOrganization(user.id, org.id, "member");

			await expectCode(
				withWorkspace(userContext(user, org.id), {
					organizationId: org.id,
					resource: "website",
					permissions: ["create"],
				}),
				"FORBIDDEN",
			);
		});

		iit("allows admin to create website", async () => {
			const user = await signUp();
			const org = await insertOrganization();
			await addToOrganization(user.id, org.id, "admin");

			const ws = await withWorkspace(userContext(user, org.id), {
				organizationId: org.id,
				resource: "website",
				permissions: ["create"],
			});
			expect(ws.role).toBe("admin");
		});

		iit("denies user who is not a member of the org", async () => {
			const user = await signUp();
			const org = await insertOrganization();

			await expectCode(
				withWorkspace(userContext(user, org.id), {
					organizationId: org.id,
					resource: "organization",
					permissions: ["read"],
				}),
				"FORBIDDEN",
			);
		});

		iit("denies cross-org access via websiteId", async () => {
			const user = await signUp();
			const orgA = await insertOrganization();
			const orgB = await insertOrganization();
			await addToOrganization(user.id, orgA.id, "owner");
			const siteInB = await insertWebsite({ organizationId: orgB.id });

			await expectCode(
				withWorkspace(userContext(user, orgA.id), {
					websiteId: siteInB.id,
					permissions: ["read"],
				}),
				"FORBIDDEN",
			);
		});
	});

	describe("API key path", () => {
		iit("denies API key with wrong org", async () => {
			const orgA = await insertOrganization();
			const orgB = await insertOrganization();

			await expectCode(
				withWorkspace(apiKeyContext(orgA.id, ["read:data"], orgB.id), {
					organizationId: orgB.id,
				}),
				"FORBIDDEN",
			);
		});

		iit("allows API key with read:data scope to read", async () => {
			const org = await insertOrganization();
			const owner = await signUp();
			await addToOrganization(owner.id, org.id, "owner");

			const ws = await withWorkspace(apiKeyContext(org.id, ["read:data"]), {
				organizationId: org.id,
				resource: "website",
				permissions: ["read"],
			});
			expect(ws.user).toBeNull();
			expect(ws.role).toBeNull();
		});

		iit("denies API key with read:data from writing", async () => {
			const org = await insertOrganization();

			await expectCode(
				withWorkspace(apiKeyContext(org.id, ["read:data"]), {
					organizationId: org.id,
					resource: "website",
					permissions: ["update"],
				}),
				"FORBIDDEN",
			);
		});

		iit("allows API key with manage:websites to create website", async () => {
			const org = await insertOrganization();
			const owner = await signUp();
			await addToOrganization(owner.id, org.id, "owner");

			const ws = await withWorkspace(
				apiKeyContext(org.id, ["manage:websites"]),
				{
					organizationId: org.id,
					resource: "website",
					permissions: ["create"],
				},
			);
			expect(ws.user).toBeNull();
		});

		iit("merges metadata global scopes with top-level scopes", async () => {
			const org = await insertOrganization();
			const owner = await signUp();
			await addToOrganization(owner.id, org.id, "owner");

			const ctx = context({
				apiKey: {
					id: "meta-key",
					name: "Meta Key",
					prefix: "dbdy",
					start: "meta",
					keyHash: "meta-hash",
					userId: null,
					organizationId: org.id,
					type: "user" as const,
					scopes: [],
					enabled: true,
					revokedAt: null,
					rateLimitEnabled: false,
					rateLimitTimeWindow: null,
					rateLimitMax: null,
					expiresAt: null,
					lastUsedAt: null,
					metadata: {
						resources: {
							global: ["read:data"],
						},
					},
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				organizationId: org.id,
			});

			const ws = await withWorkspace(ctx, {
				organizationId: org.id,
				resource: "website",
				permissions: ["read"],
			});
			expect(ws.user).toBeNull();
		});

		iit("denies API key with no scopes", async () => {
			const org = await insertOrganization();

			await expectCode(
				withWorkspace(apiKeyContext(org.id, []), {
					organizationId: org.id,
					resource: "website",
					permissions: ["read"],
				}),
				"FORBIDDEN",
			);
		});
	});

	describe("public access (withPublicWorkspace)", () => {
		iit("allows unauthenticated read on public website", async () => {
			const org = await insertOrganization();
			const owner = await signUp();
			await addToOrganization(owner.id, org.id, "owner");
			const site = await insertWebsite({
				organizationId: org.id,
				isPublic: true,
			});

			const ws = await withPublicWorkspace(context(), {
				websiteId: site.id,
				permissions: ["read"],
			});
			expect(ws.tier).toBe("demo");
			expect(ws.user).toBeNull();
			expect(ws.website.id).toBe(site.id);
		});

		iit("treats view_analytics as read-only for public access", async () => {
			const org = await insertOrganization();
			const owner = await signUp();
			await addToOrganization(owner.id, org.id, "owner");
			const site = await insertWebsite({
				organizationId: org.id,
				isPublic: true,
			});

			const ws = await withPublicWorkspace(context(), {
				websiteId: site.id,
				permissions: ["view_analytics"],
			});
			expect(ws.tier).toBe("demo");
		});

		iit("denies unauthenticated write on public website", async () => {
			const org = await insertOrganization();
			const site = await insertWebsite({
				organizationId: org.id,
				isPublic: true,
			});

			await expectCode(
				withPublicWorkspace(context(), {
					websiteId: site.id,
					permissions: ["update"],
				}),
				"UNAUTHORIZED",
			);
		});

		iit("denies unauthenticated read on private website", async () => {
			const org = await insertOrganization();
			const site = await insertWebsite({
				organizationId: org.id,
				isPublic: false,
			});

			await expectCode(
				withPublicWorkspace(context(), {
					websiteId: site.id,
					permissions: ["read"],
				}),
				"UNAUTHORIZED",
			);
		});

		iit("gives org member authed tier on public website", async () => {
			const owner = await signUp();
			const org = await insertOrganization();
			await addToOrganization(owner.id, org.id, "owner");
			const site = await insertWebsite({
				organizationId: org.id,
				isPublic: true,
			});

			const ws = await withPublicWorkspace(userContext(owner, org.id), {
				websiteId: site.id,
				permissions: ["read"],
			});
			expect(ws.tier).toBe("authed");
			expect(ws.role).toBe("owner");
		});

		iit("gives authed non-member demo tier on public website", async () => {
			const ownerOrg = await insertOrganization();
			const owner = await signUp();
			await addToOrganization(owner.id, ownerOrg.id, "owner");
			const site = await insertWebsite({
				organizationId: ownerOrg.id,
				isPublic: true,
			});

			const outsider = await signUp();
			const outsiderOrg = await insertOrganization();
			await addToOrganization(outsider.id, outsiderOrg.id, "owner");

			const ws = await withPublicWorkspace(
				userContext(outsider, outsiderOrg.id),
				{
					websiteId: site.id,
					permissions: ["read"],
				},
			);
			expect(ws.tier).toBe("demo");
			expect(ws.role).toBeNull();
		});

		iit("gives member with mismatched active org demo tier on public website", async () => {
			const owner = await signUp();
			const orgA = await insertOrganization();
			const orgB = await insertOrganization();
			await addToOrganization(owner.id, orgA.id, "owner");
			await addToOrganization(owner.id, orgB.id, "owner");
			const site = await insertWebsite({
				organizationId: orgA.id,
				isPublic: true,
			});

			const ws = await withPublicWorkspace(userContext(owner, orgB.id), {
				websiteId: site.id,
				permissions: ["read"],
			});
			expect(ws.tier).toBe("demo");
		});

		iit("gives org API key with read scope authed tier on public website", async () => {
			const org = await insertOrganization();
			const owner = await signUp();
			await addToOrganization(owner.id, org.id, "owner");
			const site = await insertWebsite({
				organizationId: org.id,
				isPublic: true,
			});

			const ws = await withPublicWorkspace(
				apiKeyContext(org.id, ["read:data"]),
				{
					websiteId: site.id,
					permissions: ["read"],
				},
			);
			expect(ws.tier).toBe("authed");
			expect(ws.user).toBeNull();
		});

		iit("gives org API key without read scope demo tier on public website", async () => {
			const org = await insertOrganization();
			const owner = await signUp();
			await addToOrganization(owner.id, org.id, "owner");
			const site = await insertWebsite({
				organizationId: org.id,
				isPublic: true,
			});

			const ws = await withPublicWorkspace(
				apiKeyContext(org.id, ["track:events"]),
				{
					websiteId: site.id,
					permissions: ["read"],
				},
			);
			expect(ws.tier).toBe("demo");
		});

		iit("gives cross-org API key demo tier on public website", async () => {
			const ownerOrg = await insertOrganization();
			const owner = await signUp();
			await addToOrganization(owner.id, ownerOrg.id, "owner");
			const site = await insertWebsite({
				organizationId: ownerOrg.id,
				isPublic: true,
			});
			const otherOrg = await insertOrganization();

			const ws = await withPublicWorkspace(
				apiKeyContext(otherOrg.id, ["read:data"]),
				{
					websiteId: site.id,
					permissions: ["read"],
				},
			);
			expect(ws.tier).toBe("demo");
		});
	});

	describe("flag resource", () => {
		iit("allows API key with manage:flags alone to write flags", async () => {
			const org = await insertOrganization();
			const owner = await signUp();
			await addToOrganization(owner.id, org.id, "owner");
			const site = await insertWebsite({ organizationId: org.id });

			const ws = await withWorkspace(apiKeyContext(org.id, ["manage:flags"]), {
				websiteId: site.id,
				resource: "flag",
				permissions: ["update"],
			});
			expect(ws.tier).toBe("authed");
			expect(ws.user).toBeNull();
		});

		iit("denies API key with manage:websites but without manage:flags", async () => {
			const org = await insertOrganization();
			const site = await insertWebsite({ organizationId: org.id });

			await expectCode(
				withWorkspace(apiKeyContext(org.id, ["manage:websites"]), {
					websiteId: site.id,
					resource: "flag",
					permissions: ["update"],
				}),
				"FORBIDDEN",
			);
		});

		iit("allows API key with read:data to read flags", async () => {
			const org = await insertOrganization();
			const owner = await signUp();
			await addToOrganization(owner.id, org.id, "owner");

			const ws = await withWorkspace(apiKeyContext(org.id, ["read:data"]), {
				organizationId: org.id,
				resource: "flag",
				permissions: ["read"],
			});
			expect(ws.tier).toBe("authed");
		});

		iit("allows member to create and update flags", async () => {
			const user = await signUp();
			const org = await insertOrganization();
			await addToOrganization(user.id, org.id, "member");

			const ws = await withWorkspace(userContext(user, org.id), {
				organizationId: org.id,
				resource: "flag",
				permissions: ["create", "update"],
			});
			expect(ws.role).toBe("member");
		});

		iit("denies member from deleting flags", async () => {
			const user = await signUp();
			const org = await insertOrganization();
			await addToOrganization(user.id, org.id, "member");

			await expectCode(
				withWorkspace(userContext(user, org.id), {
					organizationId: org.id,
					resource: "flag",
					permissions: ["delete"],
				}),
				"FORBIDDEN",
			);
		});

		iit("denies viewer from writing flags", async () => {
			const user = await signUp();
			const org = await insertOrganization();
			await addToOrganization(user.id, org.id, "viewer");

			await expectCode(
				withWorkspace(userContext(user, org.id), {
					organizationId: org.id,
					resource: "flag",
					permissions: ["update"],
				}),
				"FORBIDDEN",
			);
		});
	});

	describe("monitor resource", () => {
		iit("allows API key with read:monitors to read monitors", async () => {
			const org = await insertOrganization();

			const ws = await withWorkspace(apiKeyContext(org.id, ["read:monitors"]), {
				organizationId: org.id,
				resource: "monitor",
				permissions: ["read"],
			});
			expect(ws.tier).toBe("authed");
			expect(ws.user).toBeNull();
		});

		iit("denies API key with read:data from reading monitors", async () => {
			const org = await insertOrganization();

			await expectCode(
				withWorkspace(apiKeyContext(org.id, ["read:data"]), {
					organizationId: org.id,
					resource: "monitor",
					permissions: ["read"],
				}),
				"FORBIDDEN",
			);
		});

		iit("allows API key with write:monitors to write monitors", async () => {
			const org = await insertOrganization();

			const ws = await withWorkspace(apiKeyContext(org.id, ["write:monitors"]), {
				organizationId: org.id,
				resource: "monitor",
				permissions: ["update"],
			});
			expect(ws.tier).toBe("authed");
		});
	});

	describe("status page resource", () => {
		iit("allows API key with read:status_pages to read status pages", async () => {
			const org = await insertOrganization();

			const ws = await withWorkspace(
				apiKeyContext(org.id, ["read:status_pages"]),
				{
					organizationId: org.id,
					resource: "status_page",
					permissions: ["read"],
				},
			);
			expect(ws.tier).toBe("authed");
			expect(ws.user).toBeNull();
		});

		iit("denies API key with read:data from reading status pages", async () => {
			const org = await insertOrganization();

			await expectCode(
				withWorkspace(apiKeyContext(org.id, ["read:data"]), {
					organizationId: org.id,
					resource: "status_page",
					permissions: ["read"],
				}),
				"FORBIDDEN",
			);
		});

		iit("allows API key with write:status_pages to write status pages", async () => {
			const org = await insertOrganization();

			const ws = await withWorkspace(
				apiKeyContext(org.id, ["write:status_pages"]),
				{
					organizationId: org.id,
					resource: "status_page",
					permissions: ["update"],
				},
			);
			expect(ws.tier).toBe("authed");
		});
	});

	describe("plan gating", () => {
		iit("rejects when required plan not met", async () => {
			const user = await signUp();
			const org = await insertOrganization();
			await addToOrganization(user.id, org.id, "owner");

			await expectCode(
				withWorkspace(userContext(user, org.id), {
					organizationId: org.id,
					resource: "organization",
					permissions: ["read"],
					requiredPlans: ["pro"],
				}),
				"FEATURE_UNAVAILABLE",
			);
		});

		iit("rejects non-member with FORBIDDEN before revealing plan gate", async () => {
			const user = await signUp();
			const org = await insertOrganization();

			await expectCode(
				withWorkspace(userContext(user, org.id), {
					organizationId: org.id,
					resource: "organization",
					permissions: ["read"],
					requiredPlans: ["pro"],
				}),
				"FORBIDDEN",
			);
		});

		iit("allows when no plan requirement", async () => {
			const user = await signUp();
			const org = await insertOrganization();
			await addToOrganization(user.id, org.id, "owner");

			const ws = await withWorkspace(userContext(user, org.id), {
				organizationId: org.id,
				resource: "organization",
				permissions: ["read"],
			});
			expect(ws.plan).toBe("free");
		});
	});

	describe("sessionProcedure guard", () => {
		iit("rejects API key on organizations.getUserPendingInvitations", async () => {
			const org = await insertOrganization();
			const owner = await signUp();
			await addToOrganization(owner.id, org.id, "owner");

			await expectCode(
				call(
					appRouter.organizations.getUserPendingInvitations,
					apiKeyContext(org.id, ["read:data", "manage:config"]),
				)(undefined),
				"UNAUTHORIZED",
			);
		});

		iit("rejects API key on apikeys.getMyRole", async () => {
			const org = await insertOrganization();
			const owner = await signUp();
			await addToOrganization(owner.id, org.id, "owner");

			await expectCode(
				call(
					appRouter.apikeys.getMyRole,
					apiKeyContext(org.id, ["read:data", "manage:config"]),
				)({ organizationId: org.id }),
				"UNAUTHORIZED",
			);
		});

		iit("rejects API key on feedback.list", async () => {
			const org = await insertOrganization();
			const owner = await signUp();
			await addToOrganization(owner.id, org.id, "owner");

			await expectCode(
				call(
					appRouter.feedback.list,
					apiKeyContext(org.id, ["read:data"]),
				)(undefined),
				"UNAUTHORIZED",
			);
		});

		iit("allows user session on apikeys.getMyRole", async () => {
			const user = await signUp();
			const org = await insertOrganization();
			await addToOrganization(user.id, org.id, "admin");

			const result = await call(
				appRouter.apikeys.getMyRole,
				userContext(user, org.id),
			)({ organizationId: org.id });
			expect(result.role).toBe("admin");
		});
	});
});
