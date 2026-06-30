import "@databuddy/test/env";

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { withWorkspace } from "@databuddy/rpc";
import {
	reset,
	cleanup,
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

beforeEach(() => reset());
afterAll(() => cleanup());

describe("cross-tenant isolation", () => {
	describe("user cannot access another org's resources", () => {
		iit("cannot read websites in another org", async () => {
			const userA = await signUp();
			const userB = await signUp();
			const orgA = await insertOrganization();
			const orgB = await insertOrganization();
			await addToOrganization(userA.id, orgA.id, "owner");
			await addToOrganization(userB.id, orgB.id, "owner");

			await expectCode(
				withWorkspace(userContext(userA, orgB.id), {
					organizationId: orgB.id,
					resource: "website",
					permissions: ["read"],
				}),
				"FORBIDDEN",
			);
		});

		iit("cannot access website by ID in another org", async () => {
			const userA = await signUp();
			const orgA = await insertOrganization();
			const orgB = await insertOrganization();
			await addToOrganization(userA.id, orgA.id, "owner");
			const siteB = await insertWebsite({ organizationId: orgB.id });

			await expectCode(
				withWorkspace(userContext(userA, orgA.id), {
					websiteId: siteB.id,
					permissions: ["read"],
				}),
				"FORBIDDEN",
			);
		});

		iit("cannot create websites in another org", async () => {
			const userA = await signUp();
			const orgA = await insertOrganization();
			const orgB = await insertOrganization();
			await addToOrganization(userA.id, orgA.id, "admin");

			await expectCode(
				withWorkspace(userContext(userA, orgB.id), {
					organizationId: orgB.id,
					resource: "website",
					permissions: ["create"],
				}),
				"FORBIDDEN",
			);
		});

		iit("cannot read links in another org", async () => {
			const userA = await signUp();
			const orgA = await insertOrganization();
			const orgB = await insertOrganization();
			await addToOrganization(userA.id, orgA.id, "owner");

			await expectCode(
				withWorkspace(userContext(userA, orgB.id), {
					organizationId: orgB.id,
					resource: "link",
					permissions: ["read"],
				}),
				"FORBIDDEN",
			);
		});
	});

	describe("API key cannot access another org's resources", () => {
		iit("org A key cannot read org B websites", async () => {
			const orgA = await insertOrganization();
			const orgB = await insertOrganization();

			await expectCode(
				withWorkspace(apiKeyContext(orgA.id, ["read:data"], orgB.id), {
					organizationId: orgB.id,
					resource: "website",
					permissions: ["read"],
				}),
				"FORBIDDEN",
			);
		});

		iit("org A key cannot access org B website by ID", async () => {
			const orgA = await insertOrganization();
			const orgB = await insertOrganization();
			const siteB = await insertWebsite({ organizationId: orgB.id });

			await expectCode(
				withWorkspace(apiKeyContext(orgA.id, ["read:data"], orgB.id), {
					websiteId: siteB.id,
					permissions: ["read"],
				}),
				"FORBIDDEN",
			);
		});

		iit("org A key cannot create links in org B", async () => {
			const orgA = await insertOrganization();
			const orgB = await insertOrganization();

			await expectCode(
				withWorkspace(apiKeyContext(orgA.id, ["write:links"], orgB.id), {
					organizationId: orgB.id,
					resource: "link",
					permissions: ["create"],
				}),
				"FORBIDDEN",
			);
		});
	});

	describe("user with roles in multiple orgs", () => {
		iit("can read own org but not write in other org", async () => {
			const user = await signUp();
			const orgA = await insertOrganization();
			const orgB = await insertOrganization();
			await addToOrganization(user.id, orgA.id, "owner");
			await addToOrganization(user.id, orgB.id, "viewer");

			const wsA = await withWorkspace(userContext(user, orgA.id), {
				organizationId: orgA.id,
				resource: "website",
				permissions: ["read"],
			});
			expect(wsA.role).toBe("owner");

			await expectCode(
				withWorkspace(userContext(user, orgB.id), {
					organizationId: orgB.id,
					resource: "website",
					permissions: ["create"],
				}),
				"FORBIDDEN",
			);
		});

		iit("cannot read another membership's website while a different org is active", async () => {
			const user = await signUp();
			const orgA = await insertOrganization();
			const orgB = await insertOrganization();
			await addToOrganization(user.id, orgA.id, "owner");
			await addToOrganization(user.id, orgB.id, "owner");
			const siteB = await insertWebsite({ organizationId: orgB.id });

			await expectCode(
				withWorkspace(userContext(user, orgA.id), {
					websiteId: siteB.id,
					permissions: ["read"],
				}),
				"FORBIDDEN",
			);
		});
	});

	describe("allowCrossOrg bypass for transfer-like flows", () => {
		iit(
			"owner of both source and target can authorize against non-active org",
			async () => {
				const user = await signUp();
				const orgA = await insertOrganization();
				const orgB = await insertOrganization();
				await addToOrganization(user.id, orgA.id, "owner");
				await addToOrganization(user.id, orgB.id, "owner");
				const siteA = await insertWebsite({ organizationId: orgA.id });

				const source = await withWorkspace(userContext(user, orgA.id), {
					websiteId: siteA.id,
					permissions: ["update"],
					allowCrossOrg: true,
				});
				expect(source.organizationId).toBe(orgA.id);

				const target = await withWorkspace(userContext(user, orgA.id), {
					organizationId: orgB.id,
					resource: "website",
					permissions: ["create"],
					allowCrossOrg: true,
				});
				expect(target.organizationId).toBe(orgB.id);
				expect(target.role).toBe("owner");
			},
		);

		iit(
			"allowCrossOrg still blocks non-members from creating in target org",
			async () => {
				const user = await signUp();
				const orgA = await insertOrganization();
				const orgB = await insertOrganization();
				await addToOrganization(user.id, orgA.id, "owner");

				await expectCode(
					withWorkspace(userContext(user, orgA.id), {
						organizationId: orgB.id,
						resource: "website",
						permissions: ["create"],
						allowCrossOrg: true,
					}),
					"FORBIDDEN",
				);
			},
		);

		iit(
			"allowCrossOrg still blocks insufficient role in target org",
			async () => {
				const user = await signUp();
				const orgA = await insertOrganization();
				const orgB = await insertOrganization();
				await addToOrganization(user.id, orgA.id, "owner");
				await addToOrganization(user.id, orgB.id, "viewer");

				await expectCode(
					withWorkspace(userContext(user, orgA.id), {
						organizationId: orgB.id,
						resource: "website",
						permissions: ["create"],
						allowCrossOrg: true,
					}),
					"FORBIDDEN",
				);
			},
		);
	});

	describe("correct org access still works", () => {
		iit("user A can read their own org's websites", async () => {
			const userA = await signUp();
			const orgA = await insertOrganization();
			await addToOrganization(userA.id, orgA.id, "owner");
			const siteA = await insertWebsite({ organizationId: orgA.id });

			const ws = await withWorkspace(userContext(userA, orgA.id), {
				websiteId: siteA.id,
				permissions: ["read"],
			});
			expect(ws.website?.id).toBe(siteA.id);
			expect(ws.organizationId).toBe(orgA.id);
		});

		iit("API key can read its own org's websites", async () => {
			const org = await insertOrganization();
			const owner = await signUp();
			await addToOrganization(owner.id, org.id, "owner");
			const site = await insertWebsite({ organizationId: org.id });

			const ws = await withWorkspace(apiKeyContext(org.id, ["read:data"]), {
				websiteId: site.id,
				permissions: ["read"],
			});
			expect(ws.website?.id).toBe(site.id);
		});
	});
});
