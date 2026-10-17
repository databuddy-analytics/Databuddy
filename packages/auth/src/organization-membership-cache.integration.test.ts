import "@databuddy/db/test-env";
import { randomUUID } from "node:crypto";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";
import { db, inArray, shutdownPostgres } from "@databuddy/db";
import {
	account,
	auditEvents,
	invitation,
	member,
	organization,
	user,
} from "@databuddy/db/schema";
import {
	cacheNamespaces,
	getCacheableKey,
	getRedisCache,
} from "@databuddy/redis";

const integration =
	process.env.ORGANIZATION_INTEGRATION_TESTS === "true"
		? describe
		: describe.skip;

integration("organization membership cache invalidation", () => {
	let auth: typeof import("./auth").auth;
	const baseURL = "http://localhost:3001";
	const password = "SyntheticTestPassword123!";
	const userIds: string[] = [];
	const organizationIds: string[] = [];

	beforeAll(async () => {
		auth = (await import("./auth")).auth;
	});
	afterEach(async () => {
		await db
			.delete(auditEvents)
			.where(inArray(auditEvents.organizationId, organizationIds));
		await db
			.delete(organization)
			.where(inArray(organization.id, organizationIds));
		await db.delete(user).where(inArray(user.id, userIds));
		userIds.length = 0;
		organizationIds.length = 0;
	});
	afterAll(() => shutdownPostgres());

	async function signedInUser() {
		const id = `synthetic-cache-${randomUUID()}`;
		const email = `${id}@example.com`;
		const now = new Date();
		await db.insert(user).values({
			id,
			name: "Synthetic member",
			email,
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
		});
		const context = await auth.$context;
		await db.insert(account).values({
			id: randomUUID(),
			accountId: id,
			userId: id,
			providerId: "credential",
			password: await context.password.hash(password),
			createdAt: now,
			updatedAt: now,
		});
		userIds.push(id);
		const response = await auth.handler(
			new Request(`${baseURL}/api/auth/sign-in/email`, {
				method: "POST",
				headers: { "content-type": "application/json", origin: baseURL },
				body: JSON.stringify({ email, password }),
			})
		);
		expect(response.status).toBe(200);
		const cookie = response.headers
			.getSetCookie()
			.map((value) => value.split(";")[0])
			.join("; ");
		return { id, email, cookie };
	}

	async function organizationWith(members: { id: string; role: string }[]) {
		const id = `synthetic-cache-${randomUUID()}`;
		const now = new Date();
		await db.insert(organization).values({
			id,
			name: "Synthetic organization",
			slug: id,
			createdAt: now,
		});
		await db.insert(member).values(
			members.map((row) => ({
				id: randomUUID(),
				organizationId: id,
				userId: row.id,
				role: row.role,
				createdAt: now,
			}))
		);
		organizationIds.push(id);
		return id;
	}

	async function cachedRole(userId: string, organizationId: string) {
		const key = getCacheableKey(
			cacheNamespaces.memberRole,
			userId,
			organizationId
		);
		await getRedisCache().set(
			key,
			JSON.stringify({ role: "member" }),
			"EX",
			60
		);
		return () => getRedisCache().exists(key);
	}

	const organizationRequest = (cookie: string, path: string, body: unknown) =>
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

	test("leaving clears the cached role immediately", async () => {
		const owner = await signedInUser();
		const leaver = await signedInUser();
		const organizationId = await organizationWith([
			{ id: owner.id, role: "owner" },
			{ id: leaver.id, role: "member" },
		]);
		const stillCached = await cachedRole(leaver.id, organizationId);

		const response = await organizationRequest(leaver.cookie, "leave", {
			organizationId,
		});

		expect(response.status).toBe(200);
		expect(await stillCached()).toBe(0);
	});

	test("accepting an invitation clears the cached role", async () => {
		const owner = await signedInUser();
		const invitee = await signedInUser();
		const organizationId = await organizationWith([
			{ id: owner.id, role: "owner" },
		]);
		const invitationId = randomUUID();
		await db.insert(invitation).values({
			id: invitationId,
			organizationId,
			email: invitee.email,
			role: "member",
			status: "pending",
			inviterId: owner.id,
			expiresAt: new Date(Date.now() + 60_000),
		});
		const stillCached = await cachedRole(invitee.id, organizationId);

		const response = await organizationRequest(
			invitee.cookie,
			"accept-invitation",
			{ invitationId }
		);

		expect(response.status).toBe(200);
		expect(await stillCached()).toBe(0);
	});

	test("deleting the organization clears every member's cached role", async () => {
		const owner = await signedInUser();
		const other = await signedInUser();
		const organizationId = await organizationWith([
			{ id: owner.id, role: "owner" },
			{ id: other.id, role: "member" },
		]);
		const ownerCached = await cachedRole(owner.id, organizationId);
		const otherCached = await cachedRole(other.id, organizationId);

		const response = await organizationRequest(owner.cookie, "delete", {
			organizationId,
		});

		expect(response.status).toBe(200);
		expect(await ownerCached()).toBe(0);
		expect(await otherCached()).toBe(0);
	});
});
