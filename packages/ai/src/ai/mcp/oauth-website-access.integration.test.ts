import "@databuddy/db/test-env";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const integration =
	process.env.MCP_OAUTH_INTEGRATION_TESTS === "true" ? describe : describe.skip;

integration("MCP OAuth website authorization", () => {
	let toolContext: typeof import("./tool-context");
	let dbModule: typeof import("@databuddy/db");
	let schema: typeof import("@databuddy/db/schema");

	const suffix = randomUUID().slice(0, 8);
	const organizationId = `mcp-oauth-org-${suffix}`;
	const otherOrganizationId = `mcp-oauth-other-org-${suffix}`;
	const websiteId = `mcp-oauth-site-${suffix}`;
	const otherWebsiteId = `mcp-oauth-other-site-${suffix}`;
	const viewerId = `mcp-oauth-viewer-${suffix}`;
	const outsiderId = `mcp-oauth-outsider-${suffix}`;
	const multiOrgId = `mcp-oauth-multi-org-${suffix}`;
	const userIds = [viewerId, outsiderId, multiOrgId];

	async function insertUser(id: string) {
		const now = new Date();
		await dbModule.db.insert(schema.user).values({
			id,
			name: id,
			email: `${id}@example.com`,
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
		});
	}

	beforeAll(async () => {
		dbModule = await import("@databuddy/db");
		schema = await import("@databuddy/db/schema");
		toolContext = await import("./tool-context");

		const now = new Date();
		await dbModule.db.insert(schema.organization).values([
			{ id: organizationId, name: organizationId, createdAt: now },
			{ id: otherOrganizationId, name: otherOrganizationId, createdAt: now },
		]);
		for (const id of userIds) {
			await insertUser(id);
		}
		await dbModule.db.insert(schema.member).values([
			{
				id: `member-${viewerId}`,
				organizationId,
				userId: viewerId,
				role: "viewer",
				createdAt: now,
			},
			{
				id: `member-${outsiderId}`,
				organizationId: otherOrganizationId,
				userId: outsiderId,
				role: "owner",
				createdAt: now,
			},
			{
				id: `member-${multiOrgId}`,
				organizationId,
				userId: multiOrgId,
				role: "viewer",
				createdAt: now,
			},
			{
				id: `member-other-${multiOrgId}`,
				organizationId: otherOrganizationId,
				userId: multiOrgId,
				role: "viewer",
				createdAt: now,
			},
		]);
		await dbModule.db.insert(schema.websites).values([
			{
				id: websiteId,
				domain: `${websiteId}.example.com`,
				organizationId,
			},
			{
				id: otherWebsiteId,
				domain: `${otherWebsiteId}.example.com`,
				organizationId: otherOrganizationId,
			},
		]);
	});

	afterAll(async () => {
		const { db, inArray } = dbModule;
		await db
			.delete(schema.websites)
			.where(inArray(schema.websites.id, [websiteId, otherWebsiteId]));
		await db
			.delete(schema.member)
			.where(inArray(schema.member.userId, userIds));
		await db.delete(schema.user).where(inArray(schema.user.id, userIds));
		await db
			.delete(schema.organization)
			.where(
				inArray(schema.organization.id, [organizationId, otherOrganizationId])
			);
		await db.$client.end();
	});

	test("grants a member of the website's organization", async () => {
		const access = await toolContext.ensureWebsiteAccess(websiteId, {
			apiKey: null,
			oauthUserId: viewerId,
			requestHeaders: new Headers(),
			userId: viewerId,
		});

		expect(access).not.toBeInstanceOf(Error);
		expect((access as { domain: string }).domain).toBe(
			`${websiteId}.example.com`
		);
	});

	test("denies a user who belongs to a different organization", async () => {
		const access = await toolContext.ensureWebsiteAccess(websiteId, {
			apiKey: null,
			oauthUserId: outsiderId,
			requestHeaders: new Headers(),
			userId: outsiderId,
		});

		expect(access).toBeInstanceOf(Error);
		expect((access as Error).message).toBe("Access denied to this website");
	});

	test("lists websites from every organization an ungranted principal can read", async () => {
		const listed = await toolContext.getCachedAccessibleWebsites({
			apiKey: null,
			oauthUserId: multiOrgId,
			userId: multiOrgId,
		});
		expect(listed.map((website) => website.id).sort()).toEqual(
			[otherWebsiteId, websiteId].sort()
		);
		const viewerSites = await toolContext.getCachedAccessibleWebsites({
			apiKey: null,
			oauthUserId: viewerId,
			userId: viewerId,
		});
		expect(viewerSites.map((website) => website.id)).toEqual([websiteId]);
	});

	test("keeps a granted principal inside the organization it consented to", async () => {
		const listed = await toolContext.getCachedAccessibleWebsites({
			apiKey: null,
			oauthGrant: { organizationId, websiteIds: null },
			oauthUserId: multiOrgId,
			organizationId,
			userId: multiOrgId,
		});
		expect(listed.map((website) => website.id)).toEqual([websiteId]);
	});

	test("resolves an organization only for a principal with exactly one", async () => {
		expect(
			await toolContext.resolveOrganizationId({
				apiKey: null,
				oauthUserId: viewerId,
				userId: viewerId,
			})
		).toBe(organizationId);
		expect(
			await toolContext.resolveOrganizationId({
				apiKey: null,
				oauthUserId: multiOrgId,
				userId: multiOrgId,
			})
		).toMatchObject({
			code: "invalid_input",
			message: expect.stringContaining("2 organizations"),
		});
	});

	test("denies a user with no membership at all", async () => {
		const access = await toolContext.ensureWebsiteAccess(websiteId, {
			apiKey: null,
			oauthUserId: `ghost-${suffix}`,
			requestHeaders: new Headers(),
			userId: `ghost-${suffix}`,
		});

		expect(access).toBeInstanceOf(Error);
	});
});
