import "@databuddy/test/env";

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { appRouter } from "@databuddy/rpc";
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
const handler = {
	create: appRouter.websites.create["~orpc"].handler,
	list: appRouter.websites.list["~orpc"].handler,
	getById: appRouter.websites.getById["~orpc"].handler,
	getPublicSummary: appRouter.websites.getPublicSummary["~orpc"].handler,
	updateSettings: appRouter.websites.updateSettings["~orpc"].handler,
};

beforeEach(() => reset());
afterAll(() => cleanup());

describe("websites.create", () => {
	iit("creates a website for an authorized user", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "admin");

		const result = await handler.create({
			context: userContext(user, org.id),
			input: {
				name: "My Site",
				domain: "mysite.example.com",
				organizationId: org.id,
			},
		});

		expect(result.domain).toBe("mysite.example.com");
		expect(result.name).toBe("My Site");
		expect(result.organizationId).toBe(org.id);
		expect(result.status).toBe("ACTIVE");
		expect(result.id).toBeDefined();
	});

	iit("rejects unauthorized user", async () => {
		const user = await signUp();
		const org = await insertOrganization();

		await expectCode(
			handler.create({
				context: userContext(user, org.id),
				input: {
					name: "My Site",
					domain: "mysite.example.com",
					organizationId: org.id,
				},
			}),
			"FORBIDDEN",
		);
	});

	iit("rejects viewer from creating", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "viewer");

		await expectCode(
			handler.create({
				context: userContext(user, org.id),
				input: {
					name: "My Site",
					domain: "viewer-site.example.com",
					organizationId: org.id,
				},
			}),
			"FORBIDDEN",
		);
	});

	iit("rejects duplicate domain in same org", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "admin");

		const domain = `dupe-${Date.now()}.example.com`;

		await handler.create({
			context: userContext(user, org.id),
			input: { name: "First", domain, organizationId: org.id },
		});

		await expectCode(
			handler.create({
				context: userContext(user, org.id),
				input: { name: "Second", domain, organizationId: org.id },
			}),
			"CONFLICT",
		);
	});

	iit("allows API key with manage:websites scope", async () => {
		const org = await insertOrganization();
		const owner = await signUp();
		await addToOrganization(owner.id, org.id, "owner");

		const result = await handler.create({
			context: apiKeyContext(org.id, ["manage:websites"]),
			input: {
				name: "API Site",
				domain: "api-site.example.com",
				organizationId: org.id,
			},
		});

		expect(result.domain).toBe("api-site.example.com");
		expect(result.organizationId).toBe(org.id);
	});
});

describe("websites.list", () => {
	iit("returns websites for the org", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "owner");
		await insertWebsite({ organizationId: org.id });
		await insertWebsite({ organizationId: org.id });

		const result = await handler.list({
			context: userContext(user, org.id),
			input: { organizationId: org.id },
		});

		expect(result).toHaveLength(2);
	});

	iit("does not return websites from other orgs", async () => {
		const user = await signUp();
		const orgA = await insertOrganization();
		const orgB = await insertOrganization();
		await addToOrganization(user.id, orgA.id, "owner");
		await insertWebsite({ organizationId: orgA.id });
		await insertWebsite({ organizationId: orgB.id });

		const result = await handler.list({
			context: userContext(user, orgA.id),
			input: { organizationId: orgA.id },
		});

		expect(result).toHaveLength(1);
		expect(result[0].organizationId).toBe(orgA.id);
	});

	iit("returns empty array for org with no websites", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "owner");

		const result = await handler.list({
			context: userContext(user, org.id),
			input: { organizationId: org.id },
		});

		expect(result).toEqual([]);
	});
});

describe("websites.getById", () => {
	iit("returns website for authenticated user", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "owner");
		const site = await insertWebsite({ organizationId: org.id });

		const result = await handler.getById({
			context: userContext(user, org.id),
			input: { id: site.id },
		});

		expect(result.id).toBe(site.id);
		expect(result.domain).toBe(site.domain);
	});

	iit("rejects public website for unauthenticated user", async () => {
		const org = await insertOrganization();
		const owner = await signUp();
		await addToOrganization(owner.id, org.id, "owner");
		const site = await insertWebsite({
			organizationId: org.id,
			isPublic: true,
		});

		await expectCode(
			handler.getById({
				context: context(),
				input: { id: site.id },
			}),
			"UNAUTHORIZED"
		);

		const summary = await handler.getPublicSummary({
			context: context(),
			input: { id: site.id },
		});
		expect(summary.id).toBe(site.id);
		expect(summary).not.toHaveProperty("organizationId");
	});

	iit("rejects private website for unauthenticated user", async () => {
		const org = await insertOrganization();
		const site = await insertWebsite({
			organizationId: org.id,
			isPublic: false,
		});

		await expectCode(
			handler.getById({
				context: context(),
				input: { id: site.id },
			}),
			"UNAUTHORIZED",
		);
	});

	iit("rejects nonexistent website", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "owner");

		await expectCode(
			handler.getById({
				context: userContext(user, org.id),
				input: { id: "nonexistent" },
			}),
			"NOT_FOUND",
		);
	});
});

describe("websites.updateSettings", () => {
	iit("preserves allowedIps when only allowedOrigins is updated", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "admin");
		const site = await insertWebsite({
			organizationId: org.id,
			settings: { allowedIps: ["10.0.0.1"], allowedOrigins: ["old.example.com"] },
		});

		const result = await handler.updateSettings({
			context: userContext(user, org.id),
			input: {
				id: site.id,
				settings: { allowedOrigins: ["new.example.com"] },
			},
		});

		expect(result.settings).toEqual({
			allowedIps: ["10.0.0.1"],
			allowedOrigins: ["new.example.com"],
		});
	});

	iit("preserves allowedOrigins when only allowedIps is updated", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "admin");
		const site = await insertWebsite({
			organizationId: org.id,
			settings: { allowedIps: ["10.0.0.1"], allowedOrigins: ["cal.com"] },
		});

		const result = await handler.updateSettings({
			context: userContext(user, org.id),
			input: { id: site.id, settings: { allowedIps: ["10.0.0.2"] } },
		});

		expect(result.settings).toEqual({
			allowedIps: ["10.0.0.2"],
			allowedOrigins: ["cal.com"],
		});
	});

	iit("treats an empty settings patch as a no-op", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "admin");
		const initial = {
			allowedIps: ["10.0.0.1"],
			allowedOrigins: ["cal.com"],
		};
		const site = await insertWebsite({
			organizationId: org.id,
			settings: initial,
		});

		const result = await handler.updateSettings({
			context: userContext(user, org.id),
			input: { id: site.id, settings: {} },
		});

		expect(result.settings).toEqual(initial);
	});

	iit("treats a missing settings field as a no-op", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "admin");
		const initial = {
			allowedIps: ["10.0.0.1"],
			allowedOrigins: ["cal.com"],
		};
		const site = await insertWebsite({
			organizationId: org.id,
			settings: initial,
		});

		const result = await handler.updateSettings({
			context: userContext(user, org.id),
			input: { id: site.id },
		});

		expect(result.settings).toEqual(initial);
	});

	iit("clears a single list via an empty array without touching the other", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "admin");
		const site = await insertWebsite({
			organizationId: org.id,
			settings: { allowedIps: ["10.0.0.1"], allowedOrigins: ["cal.com"] },
		});

		const result = await handler.updateSettings({
			context: userContext(user, org.id),
			input: { id: site.id, settings: { allowedOrigins: [] } },
		});

		expect(result.settings).toEqual({ allowedIps: ["10.0.0.1"] });
	});

	iit("clears all settings when both lists are emptied", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "admin");
		const site = await insertWebsite({
			organizationId: org.id,
			settings: { allowedIps: ["10.0.0.1"], allowedOrigins: ["cal.com"] },
		});

		const result = await handler.updateSettings({
			context: userContext(user, org.id),
			input: {
				id: site.id,
				settings: { allowedIps: [], allowedOrigins: [] },
			},
		});

		expect(result.settings).toBeNull();
	});

	iit("rejects viewer role from updating settings", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "viewer");
		const site = await insertWebsite({ organizationId: org.id });

		await expectCode(
			handler.updateSettings({
				context: userContext(user, org.id),
				input: {
					id: site.id,
					settings: { allowedOrigins: ["cal.com"] },
				},
			}),
			"FORBIDDEN",
		);
	});
});
