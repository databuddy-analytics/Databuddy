import "@databuddy/db/test-env";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const integration =
	process.env.MCP_OAUTH_INTEGRATION_TESTS === "true" ? describe : describe.skip;

integration("MCP OAuth website authorization", () => {
	let ensureWebsiteAccess: typeof import("./tool-context").ensureWebsiteAccess;
	let dbModule: typeof import("@databuddy/db");
	let schema: typeof import("@databuddy/db/schema");

	const suffix = randomUUID().slice(0, 8);
	const organizationId = `mcp-oauth-org-${suffix}`;
	const otherOrganizationId = `mcp-oauth-other-org-${suffix}`;
	const websiteId = `mcp-oauth-site-${suffix}`;
	const viewerId = `mcp-oauth-viewer-${suffix}`;
	const outsiderId = `mcp-oauth-outsider-${suffix}`;

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
		({ ensureWebsiteAccess } = await import("./tool-context"));

		const now = new Date();
		await dbModule.db.insert(schema.organization).values([
			{ id: organizationId, name: organizationId, createdAt: now },
			{ id: otherOrganizationId, name: otherOrganizationId, createdAt: now },
		]);
		await insertUser(viewerId);
		await insertUser(outsiderId);
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
		]);
		await dbModule.db.insert(schema.websites).values({
			id: websiteId,
			domain: `${websiteId}.example.com`,
			organizationId,
		});
	});

	afterAll(async () => {
		const { db, inArray, eq } = dbModule;
		await db.delete(schema.websites).where(eq(schema.websites.id, websiteId));
		await db
			.delete(schema.member)
			.where(inArray(schema.member.userId, [viewerId, outsiderId]));
		await db
			.delete(schema.user)
			.where(inArray(schema.user.id, [viewerId, outsiderId]));
		await db
			.delete(schema.organization)
			.where(
				inArray(schema.organization.id, [organizationId, otherOrganizationId])
			);
		await db.$client.end();
	});

	test("grants a member of the website's organization", async () => {
		const access = await ensureWebsiteAccess(
			websiteId,
			new Headers(),
			null,
			null,
			viewerId
		);

		expect(access).not.toBeInstanceOf(Error);
		expect((access as { domain: string }).domain).toBe(
			`${websiteId}.example.com`
		);
	});

	test("denies a user who belongs to a different organization", async () => {
		const access = await ensureWebsiteAccess(
			websiteId,
			new Headers(),
			null,
			null,
			outsiderId
		);

		expect(access).toBeInstanceOf(Error);
		expect((access as Error).message).toBe("Access denied to this website");
	});

	test("denies a user with no membership at all", async () => {
		const access = await ensureWebsiteAccess(
			websiteId,
			new Headers(),
			null,
			null,
			`ghost-${suffix}`
		);

		expect(access).toBeInstanceOf(Error);
	});
});
