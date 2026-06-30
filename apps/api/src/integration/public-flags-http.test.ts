import "@databuddy/test/env";

import { and, eq } from "@databuddy/db";
import {
	flagChangeEvents,
	flags,
	flagsToTargetGroups,
	targetGroups,
} from "@databuddy/db/schema";
import {
	addToOrganization,
	cleanup,
	db,
	hasTestDb,
	insertApiKey,
	insertOrganization,
	insertWebsite,
	reset,
	signUp,
} from "@databuddy/test";
import { Elysia } from "elysia";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { flagsRoute } from "../routes/public/flags";

const iit = hasTestDb ? it : it.skip;
const app = new Elysia().use(flagsRoute);

beforeEach(() => reset());
afterAll(() => cleanup());

function url(path: string) {
	return `http://localhost${path}`;
}

async function json<T = any>(response: Response): Promise<T> {
	return (await response.json()) as T;
}

function get(path: string, headers?: HeadersInit) {
	return app.handle(new Request(url(path), { headers }));
}

function post(path: string, body: unknown, headers?: HeadersInit) {
	return app.handle(
		new Request(url(path), {
			body: JSON.stringify(body),
			headers: { "content-type": "application/json", ...headers },
			method: "POST",
		})
	);
}

function patch(path: string, body: unknown, headers?: HeadersInit) {
	return app.handle(
		new Request(url(path), {
			body: JSON.stringify(body),
			headers: { "content-type": "application/json", ...headers },
			method: "PATCH",
		})
	);
}

function del(path: string, headers?: HeadersInit) {
	return app.handle(new Request(url(path), { headers, method: "DELETE" }));
}

async function createOrgWebsite() {
	const user = await signUp();
	const org = await insertOrganization();
	await addToOrganization(user.id, org.id, "admin");
	const website = await insertWebsite({ organizationId: org.id });
	return { user, org, website };
}

async function createManageFlagsKey(opts: {
	organizationId: string;
	userId?: string | null;
	websiteId?: string;
}) {
	return insertApiKey({
		organizationId: opts.organizationId,
		userId: opts.userId ?? null,
		scopes: ["manage:flags"],
		metadata: opts.websiteId
			? { resources: { [`website:${opts.websiteId}`]: ["manage:flags"] } }
			: null,
	});
}

async function insertFlag(
	overrides: Partial<typeof flags.$inferInsert> & {
		createdBy: string;
		key: string;
	}
) {
	const [row] = await db()
		.insert(flags)
		.values({
			id: crypto.randomUUID(),
			key: overrides.key,
			createdBy: overrides.createdBy,
			defaultValue: false,
			status: "active",
			type: "boolean",
			...overrides,
		})
		.returning();
	return row;
}

describe("public flags HTTP integration", () => {
	describe("public evaluation", () => {
		iit("evaluates website, org, environment, user-scoped, and target-group flags", async () => {
			const { user, org, website } = await createOrgWebsite();

			await insertFlag({
				createdBy: user.id,
				defaultValue: true,
				key: "website-enabled",
				payload: { source: "website" },
				websiteId: website.id,
			});
			await insertFlag({
				createdBy: user.id,
				defaultValue: true,
				environment: "production",
				key: "env-only",
				websiteId: website.id,
			});
			await insertFlag({
				createdBy: user.id,
				defaultValue: false,
				key: "org-enabled",
				organizationId: org.id,
			});
			await insertFlag({
				createdBy: user.id,
				defaultValue: true,
				key: "user-only",
				userId: user.id,
				websiteId: website.id,
			});
			const targetFlag = await insertFlag({
				createdBy: user.id,
				defaultValue: false,
				key: "beta-audience",
				websiteId: website.id,
			});
			const [group] = await db()
				.insert(targetGroups)
				.values({
					id: crypto.randomUUID(),
					createdBy: user.id,
					name: "Enterprise users",
					rules: [
						{
							batch: false,
							enabled: true,
							field: "plan",
							operator: "equals",
							type: "property",
							value: "enterprise",
						},
					],
					websiteId: website.id,
				})
				.returning();
			await db().insert(flagsToTargetGroups).values({
				flagId: targetFlag.id,
				targetGroupId: group.id,
			});

			const websiteResponse = await get(
				`/v1/flags/evaluate?clientId=${website.id}&key=website-enabled`
			);
			expect(websiteResponse.status).toBe(200);
			expect(websiteResponse.headers.get("cache-control")).toContain(
				"public"
			);
			expect(websiteResponse.headers.get("vary")).toBe("Origin");
			expect(await json(websiteResponse)).toMatchObject({
				enabled: true,
				payload: { source: "website" },
				reason: "BOOLEAN_DEFAULT",
				value: true,
			});

			await expect(
				json(
					await get(
						`/v1/flags/evaluate?clientId=${website.id}&key=env-only`
					)
				)
			).resolves.toMatchObject({ reason: "FLAG_NOT_FOUND" });
			await expect(
				json(
					await get(
						`/v1/flags/evaluate?clientId=${website.id}&key=env-only&environment=production`
					)
				)
			).resolves.toMatchObject({ enabled: true });
			await expect(
				json(
					await get(
						`/v1/flags/evaluate?clientId=${org.id}&key=org-enabled`
					)
				)
			).resolves.toMatchObject({ enabled: false, reason: "BOOLEAN_DEFAULT" });
			await expect(
				json(
					await get(
						`/v1/flags/evaluate?clientId=${website.id}&key=user-only`
					)
				)
			).resolves.toMatchObject({ reason: "FLAG_NOT_FOUND" });
			await expect(
				json(
					await get(
						`/v1/flags/evaluate?clientId=${website.id}&key=user-only&userId=${user.id}`
					)
				)
			).resolves.toMatchObject({ enabled: true });

			const targetResult = await json(
				await get(
					`/v1/flags/evaluate?clientId=${website.id}&key=beta-audience&properties=${encodeURIComponent(JSON.stringify({ plan: "enterprise" }))}`
				)
			);
			expect(targetResult).toMatchObject({
				enabled: true,
				reason: "TARGET_GROUP_MATCH",
				value: true,
			});
		});

		iit("bulk evaluation merges client flags with unique user-scoped flags and filters requested keys", async () => {
			const { user, website } = await createOrgWebsite();
			await insertFlag({
				createdBy: user.id,
				defaultValue: true,
				key: "global-a",
				websiteId: website.id,
			});
			await insertFlag({
				createdBy: user.id,
				defaultValue: false,
				key: "global-b",
				websiteId: website.id,
			});
			await insertFlag({
				createdBy: user.id,
				defaultValue: true,
				key: "personal-c",
				userId: user.id,
				websiteId: website.id,
			});

			const response = await get(
				`/v1/flags/bulk?clientId=${website.id}&userId=${user.id}&keys=global-a,personal-c,missing`
			);
			expect(response.status).toBe(200);
			expect(response.headers.get("cache-control")).toContain("public");
			const body = await json(response);

			expect(body.count).toBe(2);
			expect(Object.keys(body.flags).sort()).toEqual([
				"global-a",
				"personal-c",
			]);
			expect(body.flags["global-a"]).toMatchObject({ enabled: true });
			expect(body.flags["personal-c"]).toMatchObject({ enabled: true });
		});

		iit("returns safe defaults for missing params and malformed properties", async () => {
			const { user, website } = await createOrgWebsite();
			await insertFlag({
				createdBy: user.id,
				defaultValue: false,
				key: "needs-plan",
				rules: [
					{
						batch: false,
						enabled: true,
						field: "plan",
						operator: "equals",
						type: "property",
						value: "pro",
					},
				],
				websiteId: website.id,
			});

			const missing = await get("/v1/flags/evaluate?clientId=");
			expect(missing.status).toBe(422);

			const malformedProps = await json(
				await get(
					`/v1/flags/evaluate?clientId=${website.id}&key=needs-plan&properties=%7Bnope`
				)
			);
			expect(malformedProps).toMatchObject({
				enabled: false,
				reason: "BOOLEAN_DEFAULT",
			});
		});
	});

	describe("admin definitions and mutations", () => {
		iit("requires manage:flags and returns private cache headers for definitions", async () => {
			const { user, org, website } = await createOrgWebsite();
			await insertFlag({
				createdBy: user.id,
				defaultValue: true,
				key: "admin-visible",
				websiteId: website.id,
			});
			const goodKey = await createManageFlagsKey({
				organizationId: org.id,
				userId: user.id,
				websiteId: website.id,
			});
			const badKey = await insertApiKey({
				organizationId: org.id,
				userId: user.id,
				scopes: ["read:data"],
			});

			expect(
				(await get(`/v1/flags/definitions?clientId=${website.id}`)).status
			).toBe(401);
			expect(
				(
					await get(`/v1/flags/definitions?clientId=${website.id}`, {
						"x-api-key": badKey.secret,
					})
				).status
			).toBe(403);

			const response = await get(`/v1/flags/definitions?clientId=${website.id}`, {
				"x-api-key": goodKey.secret,
			});
			expect(response.status).toBe(200);
			expect(response.headers.get("cache-control")).toBe("private, no-store");
			expect(await json(response)).toMatchObject({
				count: 1,
				flags: [{ key: "admin-visible" }],
			});
		});

		iit("creates, rejects duplicate, updates, deletes, and records change events", async () => {
			const { user, org, website } = await createOrgWebsite();
			const key = await createManageFlagsKey({
				organizationId: org.id,
				userId: user.id,
				websiteId: website.id,
			});
			const headers = { "x-api-key": key.secret };

			const createResponse = await post(
				"/v1/flags/",
				{
					clientId: website.id,
					key: "checkout-redesign",
					type: "boolean",
					defaultValue: true,
					description: "Gate checkout redesign",
				},
				headers
			);
			expect(createResponse.status).toBe(200);
			const created = await json(createResponse);
			expect(created.flag).toMatchObject({
				key: "checkout-redesign",
				defaultValue: true,
				status: "active",
			});

			expect(
				(
					await post(
						"/v1/flags/",
						{
							clientId: website.id,
							key: "checkout-redesign",
							type: "boolean",
							defaultValue: false,
						},
						headers
					)
				).status
			).toBe(409);

			const updateResponse = await patch(
				`/v1/flags/${created.flag.id}`,
				{
					clientId: website.id,
					defaultValue: false,
					status: "inactive",
				},
				headers
			);
			expect(updateResponse.status).toBe(200);
			expect(await json(updateResponse)).toMatchObject({
				flag: { defaultValue: false, status: "inactive" },
			});

			const deleteResponse = await del(
				`/v1/flags/${created.flag.id}?clientId=${website.id}`,
				headers
			);
			expect(deleteResponse.status).toBe(200);
			expect(await json(deleteResponse)).toEqual({ success: true });

			await expect(
				json(
					await get(
						`/v1/flags/evaluate?clientId=${website.id}&key=checkout-redesign`
					)
				)
			).resolves.toMatchObject({ reason: "FLAG_NOT_FOUND" });

			const events = await db()
				.select({ changeType: flagChangeEvents.changeType })
				.from(flagChangeEvents)
				.where(eq(flagChangeEvents.flagId, created.flag.id));
			expect(events.map((event) => event.changeType).sort()).toEqual([
				"archived",
				"created",
				"updated",
			]);
		});

		iit("prevents cross-client mutations even with a valid key", async () => {
			const { user: userA, org: orgA, website: websiteA } =
				await createOrgWebsite();
			const { user: userB, website: websiteB } = await createOrgWebsite();
			const keyA = await createManageFlagsKey({
				organizationId: orgA.id,
				userId: userA.id,
				websiteId: websiteA.id,
			});
			const flagB = await insertFlag({
				createdBy: userB.id,
				defaultValue: true,
				key: "other-client-flag",
				websiteId: websiteB.id,
			});

			expect(
				(
					await get(`/v1/flags/definitions?clientId=${websiteB.id}`, {
						"x-api-key": keyA.secret,
					})
				).status
			).toBe(403);
			expect(
				(
					await patch(
						`/v1/flags/${flagB.id}`,
						{ clientId: websiteA.id, defaultValue: false },
						{ "x-api-key": keyA.secret }
					)
				).status
			).toBe(403);
		});

		iit("requires user-associated API keys for writes", async () => {
			const { org, website } = await createOrgWebsite();
			const key = await createManageFlagsKey({
				organizationId: org.id,
				userId: null,
				websiteId: website.id,
			});

			const response = await post(
				"/v1/flags/",
				{
					clientId: website.id,
					key: "needs-user-key",
					type: "boolean",
					defaultValue: true,
				},
				{ "x-api-key": key.secret }
			);

			expect(response.status).toBe(403);
			expect(await json(response)).toEqual({
				error: "API key must be associated with a user",
			});
		});
	});
});
