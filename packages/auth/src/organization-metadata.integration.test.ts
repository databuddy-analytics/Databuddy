import { randomUUID } from "node:crypto";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { db, eq, inArray, shutdownPostgres } from "@databuddy/db";
import {
	account,
	auditEvents,
	member,
	organization,
	user,
} from "@databuddy/db/schema";
import {
	readOrganizationBusinessContext,
	saveOrganizationBusinessProfile,
} from "@databuddy/services/organization-business-context";

const integration =
	process.env.BUSINESS_CONTEXT_INTEGRATION_TESTS === "true"
		? describe
		: describe.skip;

integration("native Better Auth organization metadata protection", () => {
	let auth: typeof import("./auth").auth;
	let org: string;
	let userId: string;
	let cookie: string;
	const createdSlugs: string[] = [];
	const baseURL = "http://localhost:3001";
	const password = "SyntheticTestPassword123!";
	const preserved = "Team-defined signup means a trial started.";

	beforeAll(async () => {
		const url = new URL(process.env.DATABASE_URL ?? "");
		const redis = new URL(process.env.REDIS_URL ?? "");
		if (
			!["localhost", "127.0.0.1"].includes(url.hostname) ||
			!["/databuddy_test", "/business_context_settings"].includes(
				url.pathname
			) ||
			!["localhost", "127.0.0.1"].includes(redis.hostname) ||
			process.env.NODE_ENV !== "test"
		) {
			throw new Error(
				"Use NODE_ENV=test, localhost Redis and a localhost databuddy_test or business_context_settings database"
			);
		}
		auth = (await import("./auth")).auth;
	});
	beforeEach(async () => {
		org = `synthetic-auth-${randomUUID()}`;
		userId = `synthetic-auth-${randomUUID()}`;
		const email = `${userId}@example.com`;
		const now = new Date();
		await db
			.insert(user)
			.values({
				id: userId,
				name: "Synthetic owner",
				email,
				emailVerified: true,
				createdAt: now,
				updatedAt: now,
			});
		await db
			.insert(organization)
			.values({
				id: org,
				name: "Synthetic organization",
				slug: org,
				createdAt: now,
			});
		await db
			.insert(member)
			.values({
				id: randomUUID(),
				organizationId: org,
				userId,
				role: "owner",
				createdAt: now,
			});
		const context = await auth.$context;
		await db
			.insert(account)
			.values({
				id: randomUUID(),
				accountId: userId,
				userId,
				providerId: "credential",
				password: await context.password.hash(password),
				createdAt: now,
				updatedAt: now,
			});
		const response = await auth.handler(
			new Request(`${baseURL}/api/auth/sign-in/email`, {
				method: "POST",
				headers: { "content-type": "application/json", origin: baseURL },
				body: JSON.stringify({ email, password }),
			})
		);
		expect(response.status).toBe(200);
		cookie = response.headers
			.getSetCookie()
			.map((value) => value.split(";")[0])
			.join("; ");
		expect(cookie).toContain("session_token=");
		await saveOrganizationBusinessProfile({
			organizationId: org,
			content: preserved,
			revision: 0,
			updatedBy: userId,
		});
	});
	afterEach(async () => {
		const created = createdSlugs.length
			? await db
					.select({ id: organization.id })
					.from(organization)
					.where(inArray(organization.slug, createdSlugs))
			: [];
		const ids = [org, ...created.map((row) => row.id)];
		await db
			.delete(auditEvents)
			.where(inArray(auditEvents.organizationId, ids));
		await db.delete(organization).where(inArray(organization.id, ids));
		await db.delete(user).where(eq(user.id, userId));
		createdSlugs.length = 0;
	});
	afterAll(() => shutdownPostgres());
	const request = (path: string, body: unknown) =>
		auth.handler(
			new Request(`${baseURL}/api/auth/organization/${path}`, {
				method: "POST",
				headers: {
					cookie,
					origin: baseURL,
					"content-type": "application/json",
				},
				body: JSON.stringify(body),
			})
		);
	const metadata = () =>
		db.query.organization.findFirst({
			where: { id: org },
			columns: { metadata: true, name: true, slug: true, logo: true },
		});

	test.each([
		"owner",
		"admin",
	])("%s cannot replace or forge canonical metadata", async (role) => {
		await db.update(member).set({ role }).where(eq(member.organizationId, org));
		const original = await metadata();
		for (const value of [
			{},
			{
				businessContext: {
					profile: { content: "Forged", origin: "team", revision: 999 },
					generation: null,
				},
			},
		]) {
			const response = await request("update", {
				organizationId: org,
				data: { name: "Must not change", metadata: value },
			});
			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				message: "Organization metadata is managed by the server.",
			});
			expect(await metadata()).toEqual(original);
		}
	});

	test("native create rejects supplied metadata before inserting an organization", async () => {
		for (const value of [
			{},
			{ businessContext: { profile: null, generation: null } },
		]) {
			const slug = `synthetic-create-${randomUUID()}`;
			createdSlugs.push(slug);
			const response = await request("create", {
				name: "Synthetic create",
				slug,
				metadata: value,
			});
			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				message: "Organization metadata is managed by the server.",
			});
			expect(
				await db.query.organization.findFirst({ where: { slug } })
			).toBeUndefined();
		}
	});

	test("normal native create and name/slug/logo edits preserve server metadata", async () => {
		const slug = `synthetic-create-${randomUUID()}`;
		createdSlugs.push(slug);
		const created = await request("create", {
			name: "Synthetic create",
			slug,
			logo: "https://example.com/logo.png",
			metadata: undefined,
			keepCurrentActiveOrganization: true,
		});
		expect(created.status).toBe(200);
		const before = await metadata();
		const edits = {
			name: "Renamed organization",
			slug: `synthetic-renamed-${randomUUID()}`,
			logo: "https://example.com/renamed.png",
			metadata: undefined,
		};
		const response = await request("update", {
			organizationId: org,
			data: edits,
		});
		expect(response.status).toBe(200);
		expect(await metadata()).toEqual({ ...edits, metadata: before?.metadata ?? null });
		expect((await readOrganizationBusinessContext(org)).profile).toMatchObject({
			content: preserved,
			origin: "team",
			revision: 1,
		});
	});
});
