import "@databuddy/test/env";

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createProcedureClient } from "@orpc/server";
import { appRouter, type Context } from "@databuddy/rpc";
import {
	reset,
	cleanup,
	hasTestDb,
	userContext,
	apiKeyContext,
	expectCode,
	insertOrganization,
	signUp,
	addToOrganization,
} from "@databuddy/test";

const iit = hasTestDb ? it : it.skip;

function call<T>(procedure: T, ctx: Context) {
	return createProcedureClient(procedure as any, { context: ctx });
}

beforeEach(() => reset());
afterAll(() => cleanup());

describe("links.create", () => {
	iit("creates a link for a member", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "member");

		const result = await call(
			appRouter.links.create,
			userContext(user, org.id),
		)({
			name: "My Link",
			targetUrl: "https://example.com",
			organizationId: org.id,
		});

		expect(result.name).toBe("My Link");
		expect(result.targetUrl).toBe("https://example.com");
		expect(result.organizationId).toBe(org.id);
		expect(result.slug).toBeDefined();
		expect(result.createdBy).toBe(user.id);
	});

	iit("creates with custom slug", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "member");

		const result = await call(
			appRouter.links.create,
			userContext(user, org.id),
		)({
			name: "Custom",
			targetUrl: "https://example.com",
			organizationId: org.id,
			slug: `custom-${Date.now()}`,
		});

		expect(result.slug).toContain("custom-");
	});

	iit("denies viewer from creating", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "viewer");

		await expectCode(
			call(appRouter.links.create, userContext(user, org.id))({
				name: "Blocked",
				targetUrl: "https://example.com",
				organizationId: org.id,
			}),
			"FORBIDDEN",
		);
	});

	iit("denies member from deleting", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "member");

		const link = await call(
			appRouter.links.create,
			userContext(user, org.id),
		)({
			name: "To Delete",
			targetUrl: "https://example.com",
			organizationId: org.id,
		});

		await expectCode(
			call(appRouter.links.delete, userContext(user, org.id))({
				id: link.id,
			}),
			"FORBIDDEN",
		);
	});

	iit("allows admin to delete", async () => {
		const admin = await signUp();
		const org = await insertOrganization();
		await addToOrganization(admin.id, org.id, "admin");

		const link = await call(
			appRouter.links.create,
			userContext(admin, org.id),
		)({
			name: "Deletable",
			targetUrl: "https://example.com",
			organizationId: org.id,
		});

		const result = await call(
			appRouter.links.delete,
			userContext(admin, org.id),
		)({ id: link.id });
		expect(result.success).toBe(true);
	});

	iit("rejects duplicate custom slug", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "member");
		const slug = `taken-${Date.now()}`;

		await call(appRouter.links.create, userContext(user, org.id))({
			name: "First",
			targetUrl: "https://example.com",
			organizationId: org.id,
			slug,
		});

		try {
			await call(appRouter.links.create, userContext(user, org.id))({
				name: "Second",
				targetUrl: "https://example.com",
				organizationId: org.id,
				slug,
			});
			throw new Error("Expected rejection");
		} catch (e: any) {
			expect(e.message).toContain("slug");
		}
	});

	iit("resolves createdBy to org owner for API key", async () => {
		const org = await insertOrganization();
		const owner = await signUp();
		await addToOrganization(owner.id, org.id, "owner");

		const result = await call(
			appRouter.links.create,
			apiKeyContext(org.id, ["write:links"]),
		)({
			name: "API Link",
			targetUrl: "https://example.com",
			organizationId: org.id,
		});

		expect(result.createdBy).toBe(owner.id);
	});

	iit("rejects API key with manage:config but without write:links", async () => {
		const org = await insertOrganization();
		const owner = await signUp();
		await addToOrganization(owner.id, org.id, "owner");

		await expectCode(
			call(appRouter.links.create, apiKeyContext(org.id, ["manage:config"]))({
				name: "Missing Scope",
				targetUrl: "https://example.com",
				organizationId: org.id,
			}),
			"FORBIDDEN",
		);
	});

	iit("rejects API key create when org has no owner", async () => {
		const org = await insertOrganization();

		await expectCode(
			call(
				appRouter.links.create,
				apiKeyContext(org.id, ["write:links"]),
			)({
				name: "No Owner",
				targetUrl: "https://example.com",
				organizationId: org.id,
			}),
			"FORBIDDEN",
		);
	});

	iit("allows API key with read:links alone to list", async () => {
		const org = await insertOrganization();
		const owner = await signUp();
		await addToOrganization(owner.id, org.id, "owner");

		const result = await call(
			appRouter.links.list,
			apiKeyContext(org.id, ["read:links"]),
		)({ organizationId: org.id });

		expect(result).toEqual([]);
	});
});

describe("links.list", () => {
	iit("returns links for the org", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "member");

		await call(appRouter.links.create, userContext(user, org.id))({
			name: "Link 1",
			targetUrl: "https://one.example.com",
			organizationId: org.id,
		});
		await call(appRouter.links.create, userContext(user, org.id))({
			name: "Link 2",
			targetUrl: "https://two.example.com",
			organizationId: org.id,
		});

		const result = await call(
			appRouter.links.list,
			userContext(user, org.id),
		)({ organizationId: org.id });

		expect(result).toHaveLength(2);
	});

	iit("does not leak links from other orgs", async () => {
		const userA = await signUp();
		const userB = await signUp();
		const orgA = await insertOrganization();
		const orgB = await insertOrganization();
		await addToOrganization(userA.id, orgA.id, "member");
		await addToOrganization(userB.id, orgB.id, "member");

		await call(appRouter.links.create, userContext(userA, orgA.id))({
			name: "Org A Link",
			targetUrl: "https://a.example.com",
			organizationId: orgA.id,
		});
		await call(appRouter.links.create, userContext(userB, orgB.id))({
			name: "Org B Link",
			targetUrl: "https://b.example.com",
			organizationId: orgB.id,
		});

		const result = await call(
			appRouter.links.list,
			userContext(userA, orgA.id),
		)({ organizationId: orgA.id });

		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("Org A Link");
	});
});
