import { randomUUID } from "node:crypto";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	spyOn,
} from "bun:test";
import { db, eq, shutdownPostgres, sql } from "@databuddy/db";
import { websiteBusinessContexts, websites } from "@databuddy/db/schema";
import {
	businessContainerTag,
	BusinessMemoryRetirementError,
	deleteOrganizationWithBusinessMemory,
	getMemoryClient,
	getWebsiteBusinessScope,
	withBusinessMemoryWrite,
	type BusinessScope,
} from "./business-memory";
import { WebsiteService } from "./websites";

const enabled = process.env.BUSINESS_MEMORY_INTEGRATION_TESTS === "true";
const integration = enabled ? describe : describe.skip;

integration("business memory lifecycle against isolated PostgreSQL", () => {
	const service = new WebsiteService(db, null);
	const documents = new Map<string, number>();
	const events: string[] = [];
	let partial = false;
	let unavailable = false;
	let hold: "write" | "retire" | null = null;
	let release: (() => void) | undefined;
	let entered: Promise<void>;
	let markEntered: (() => void) | undefined;
	let fetchMock: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
	let previousKey: string | undefined;
	let org: string;

	beforeAll(async () => {
		const url = new URL(process.env.DATABASE_URL ?? "");
		if (
			url.hostname !== "127.0.0.1" ||
			url.port !== "16543" ||
			url.pathname !== "/business_memory_synthetic"
		) {
			throw new Error(
				"Use the dedicated localhost:16543/business_memory_synthetic test database"
			);
		}
		previousKey = process.env.SUPERMEMORY_API_KEY;
		process.env.SUPERMEMORY_API_KEY = "synthetic-transport-only";
		await db.execute(
			sql`CREATE TABLE IF NOT EXISTS organization (id text PRIMARY KEY)`
		);
		await db.execute(sql`CREATE TABLE IF NOT EXISTS websites (
			id text PRIMARY KEY, domain text NOT NULL, name text, status text NOT NULL DEFAULT 'ACTIVE',
			"isPublic" boolean NOT NULL DEFAULT false, "createdAt" timestamptz NOT NULL DEFAULT now(),
			"updatedAt" timestamptz NOT NULL DEFAULT now(), "deletedAt" timestamptz,
			organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE, integrations jsonb, settings jsonb
		)`);
		await db.execute(sql`CREATE TABLE IF NOT EXISTS website_business_contexts (
			website_id text PRIMARY KEY REFERENCES websites(id) ON DELETE CASCADE,
			organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
			domain text NOT NULL, started_at text NOT NULL, revision integer NOT NULL CHECK (revision >= 1),
			profile jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
			refresh_after timestamptz NOT NULL, indexed_revision integer
		)`);
		fetchMock = spyOn(globalThis, "fetch").mockImplementation(
			async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (url.hostname !== "api.supermemory.ai")
					throw new Error("Unexpected provider request");
				const body = await request.json();
				const action = request.method === "DELETE" ? "retire" : "write";
				events.push(`${action}:entered`);
				if (hold === action) {
					markEntered?.();
					await new Promise<void>((resolve) => {
						release = resolve;
					});
				}
				if (action === "write") {
					expect(url.pathname).toBe("/v3/documents/batch");
					documents.set(
						body.containerTag,
						(documents.get(body.containerTag) ?? 0) + 1
					);
					events.push("write:acknowledged");
					return Response.json({
						failed: 0,
						success: 1,
						results: [{ id: "synthetic-document", status: "queued" }],
					});
				}
				expect(url.pathname).toBe("/v3/documents/bulk");
				const tag = body.containerTags[0];
				if (unavailable)
					return Response.json(
						{ error: "synthetic provider unavailable" },
						{ status: 503 }
					);
				if (partial)
					return Response.json({
						success: true,
						deletedCount: 0,
						skippedProcessingCount: 1,
					});
				const deletedCount = documents.get(tag) ?? 0;
				documents.delete(tag);
				events.push("retire:acknowledged");
				return Response.json({
					success: true,
					deletedCount,
					skippedProcessingCount: 0,
				});
			}
		);
	});
	beforeEach(async () => {
		org = `synthetic-${randomUUID()}`;
		await db.execute(sql`INSERT INTO organization(id) VALUES (${org})`);
		documents.clear();
		events.length = 0;
		partial = false;
		unavailable = false;
		hold = null;
		release = undefined;
		entered = new Promise((resolve) => {
			markEntered = resolve;
		});
	});
	afterEach(async () => {
		release?.();
		await db.delete(websites).where(eq(websites.organizationId, org));
		await db.execute(sql`DELETE FROM organization WHERE id=${org}`);
	});
	afterAll(async () => {
		fetchMock?.mockRestore();
		if (previousKey === undefined)
			Reflect.deleteProperty(process.env, "SUPERMEMORY_API_KEY");
		else process.env.SUPERMEMORY_API_KEY = previousKey;
		await shutdownPostgres();
	});

	async function fixture() {
		const websiteId = `synthetic-${randomUUID()}`;
		await db.insert(websites).values({
			id: websiteId,
			organizationId: org,
			domain: "reports.example.com",
			name: "Synthetic reports",
			settings: { allowedOrigins: ["https://example.com"] },
		});
		const scope = await getWebsiteBusinessScope(
			{ organizationId: org, websiteId },
			{ initialize: true }
		);
		if (!scope) throw new Error("Synthetic scope was not initialized");
		await db.insert(websiteBusinessContexts).values({
			websiteId,
			organizationId: org,
			domain: scope.domain,
			startedAt: scope.startedAt,
			revision: 1,
			profile: {
				capturedAt: scope.startedAt,
				sources: [],
				brief: null,
				issues: [],
			},
			refreshAfter: new Date(),
		});
		return scope;
	}
	function retained(scope: BusinessScope) {
		return db
			.select()
			.from(websiteBusinessContexts)
			.where(eq(websiteBusinessContexts.websiteId, scope.websiteId));
	}
	async function waitForBlockedTransaction() {
		const deadline = Date.now() + 2000;
		while (Date.now() < deadline) {
			const result = await db.execute(
				sql`SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'`
			);
			if (Number(result.rows[0]?.waiting) > 0) return;
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		throw new Error(
			"The competing operation did not wait on PostgreSQL's row lock"
		);
	}
	function write(scope: BusinessScope) {
		return withBusinessMemoryWrite(scope, async () => {
			const client = getMemoryClient();
			if (!client) throw new Error("Synthetic provider missing");
			return client.documents.batchAdd(
				{
					containerTag: businessContainerTag(scope),
					documents: [
						{
							content: "Synthetic team statement",
							customId: "synthetic-statement",
						},
					],
				},
				{ timeout: 4000, maxRetries: 0 }
			);
		});
	}

	it("initializes one epoch under concurrency and preserves ordinary website edits", async () => {
		const input = {
			organizationId: org,
			websiteId: `synthetic-${randomUUID()}`,
		};
		const [before] = await db
			.insert(websites)
			.values({
				id: input.websiteId,
				organizationId: org,
				domain: "reports.example.com",
				settings: { allowedOrigins: ["https://example.com"] },
			})
			.returning();
		expect(await getWebsiteBusinessScope(input)).toBeNull();
		const results = await Promise.all(
			Array.from({ length: 4 }, () =>
				getWebsiteBusinessScope(input, { initialize: true })
			)
		);
		const scope = results[0];
		if (!scope) throw new Error("Concurrent initialization failed");
		expect(
			results.every((result) => result?.startedAt === scope.startedAt)
		).toBe(true);
		const [initialized] = await db
			.select()
			.from(websites)
			.where(eq(websites.id, scope.websiteId));
		expect(initialized?.updatedAt).toEqual(before?.updatedAt);
		expect(initialized?.settings?.allowedOrigins).toEqual(
			before?.settings?.allowedOrigins
		);
		expect(
			await getWebsiteBusinessScope(
				{ ...input, organizationId: "foreign-org" },
				{ initialize: true }
			)
		).toBeNull();
		await db.transaction((tx) =>
			service.updateInTransaction(tx, scope.websiteId, {
				name: "Renamed",
				settings: {
					allowedOrigins: [],
					businessContextStartedAt: "2000-01-01T00:00:00Z",
				},
			})
		);
		expect(await getWebsiteBusinessScope(scope)).toEqual(scope);
		await db.transaction((tx) =>
			service.updateInTransaction(tx, scope.websiteId, { settings: null })
		);
		expect(await getWebsiteBusinessScope(scope)).toEqual(scope);
		const [cleared] = await db
			.select({ settings: websites.settings })
			.from(websites)
			.where(eq(websites.id, scope.websiteId));
		expect(cleared?.settings).toEqual({
			businessContextStartedAt: scope.startedAt,
		});
		await db.transaction((tx) =>
			service.updateInTransaction(tx, scope.websiteId, {
				domain: "www.reports.example.com",
			})
		);
		expect(await getWebsiteBusinessScope(scope)).toEqual(scope);
		expect(events).toEqual([]);
		await db.transaction((tx) =>
			service.updateInTransaction(tx, scope.websiteId, {
				domain: "other.example.com",
			})
		);
		const second = await getWebsiteBusinessScope(scope);
		expect(second?.startedAt).not.toBe(scope.startedAt);
		await db.transaction((tx) =>
			service.updateInTransaction(tx, scope.websiteId, { domain: scope.domain })
		);
		const third = await getWebsiteBusinessScope(scope);
		expect(third?.startedAt).not.toBe(second?.startedAt);
		expect(third && businessContainerTag(third)).not.toBe(
			businessContainerTag(scope)
		);
		const target = `synthetic-${randomUUID()}`;
		await db.execute(sql`INSERT INTO organization(id) VALUES (${target})`);
		try {
			await db.transaction((tx) =>
				service.updateInTransaction(tx, scope.websiteId, {
					organizationId: target,
				})
			);
			expect(await getWebsiteBusinessScope(scope)).toBeNull();
			const transferred = await getWebsiteBusinessScope({
				...scope,
				organizationId: target,
			});
			expect(transferred?.startedAt).not.toBe(third?.startedAt);
			await db.transaction((tx) =>
				service.updateInTransaction(tx, scope.websiteId, {
					organizationId: org,
				})
			);
		} finally {
			await db.delete(websites).where(eq(websites.organizationId, target));
			await db.execute(sql`DELETE FROM organization WHERE id=${target}`);
		}
	});
	it("keeps durable pages for ordinary edits and clears them atomically on transfer", async () => {
		const scope = await fixture();
		await service.updateById(scope.websiteId, {
			name: "Renamed",
			domain: "www.reports.example.com",
		});
		expect(await retained(scope)).toHaveLength(1);
		const target = `synthetic-${randomUUID()}`;
		await db.execute(sql`INSERT INTO organization(id) VALUES (${target})`);
		try {
			await db.transaction(async (tx) => {
				await service.updateInTransaction(tx, scope.websiteId, {
					organizationId: target,
				});
				expect(
					await tx
						.select()
						.from(websiteBusinessContexts)
						.where(eq(websiteBusinessContexts.websiteId, scope.websiteId))
				).toHaveLength(0);
				// Another connection sees the original context until this transaction commits.
				expect(await retained(scope)).toHaveLength(1);
			});
			expect(await retained(scope)).toHaveLength(0);
		} finally {
			await db.delete(websites).where(eq(websites.organizationId, target));
			await db.execute(sql`DELETE FROM organization WHERE id=${target}`);
		}
	});

	it("clears durable pages on domain change and soft deletion inside the mutation", async () => {
		for (const updates of [
			{ domain: "other.example.com" },
			{ deletedAt: new Date() },
		]) {
			const scope = await fixture();
			await db.transaction(async (tx) => {
				await service.updateInTransaction(tx, scope.websiteId, updates);
				expect(
					await tx
						.select()
						.from(websiteBusinessContexts)
						.where(eq(websiteBusinessContexts.websiteId, scope.websiteId))
				).toHaveLength(0);
			});
			expect(await retained(scope)).toHaveLength(0);
		}
	});

	it("rolls back durable-page invalidation when transfer retirement fails", async () => {
		const scope = await fixture();
		const target = `synthetic-${randomUUID()}`;
		await db.execute(sql`INSERT INTO organization(id) VALUES (${target})`);
		partial = true;
		try {
			await expect(
				service.updateById(scope.websiteId, { organizationId: target })
			).rejects.toBeInstanceOf(BusinessMemoryRetirementError);
			expect(await getWebsiteBusinessScope(scope)).toEqual(scope);
			expect(await retained(scope)).toHaveLength(1);
		} finally {
			await db.execute(sql`DELETE FROM organization WHERE id=${target}`);
		}
	});

	it("deletion waits for a native write, then retires the acknowledged document before deleting", async () => {
		const scope = await fixture();
		hold = "write";
		const writing = write(scope);
		await entered;
		const deleting = db.transaction((tx) =>
			service.deleteInTransaction(tx, scope.websiteId)
		);
		await waitForBlockedTransaction();
		expect(events).toEqual(["write:entered"]);
		release?.();
		await writing;
		await deleting;
		expect(events).toEqual([
			"write:entered",
			"write:acknowledged",
			"retire:entered",
			"retire:acknowledged",
		]);
		expect(documents.size).toBe(0);
		expect(await getWebsiteBusinessScope(scope)).toBeNull();
		expect(await retained(scope)).toHaveLength(0);
	}, 10_000);

	it("a late write waiting behind deletion rechecks the row and never reaches Supermemory", async () => {
		const scope = await fixture();
		hold = "retire";
		const deleting = db.transaction((tx) =>
			service.deleteInTransaction(tx, scope.websiteId)
		);
		await entered;
		const writing = write(scope).then(
			() => "unexpected write",
			(error) => error.message
		);
		await waitForBlockedTransaction();
		expect(events).toEqual(["retire:entered"]);
		release?.();
		await deleting;
		expect(await writing).toContain("scope changed or was deleted");
		expect(events).not.toContain("write:entered");
	}, 10_000);

	it("partial and unavailable retirement roll back deletion and domain changes so the operation can retry", async () => {
		for (const failure of ["partial", "unavailable"] as const) {
			for (const action of ["delete", "domain"] as const) {
				const scope = await fixture();
				documents.set(businessContainerTag(scope), 1);
				partial = failure === "partial";
				unavailable = failure === "unavailable";
				const mutate = () =>
					db.transaction((tx) =>
						action === "delete"
							? service.deleteInTransaction(tx, scope.websiteId)
							: service.updateInTransaction(tx, scope.websiteId, {
									domain: "other.example.com",
								})
					);
				await expect(mutate()).rejects.toBeInstanceOf(
					BusinessMemoryRetirementError
				);
				expect(await getWebsiteBusinessScope(scope)).toEqual(scope);
				partial = false;
				unavailable = false;
				await mutate();
				expect(documents.has(businessContainerTag(scope))).toBe(false);
			}
		}
	});

	it("organization deletion waits for a writer and retires every website before the cascade", async () => {
		const first = await fixture();
		const second = await fixture();
		documents.set(businessContainerTag(second), 1);
		hold = "write";
		const writing = write(first);
		await entered;
		const deleting = deleteOrganizationWithBusinessMemory(org);
		await waitForBlockedTransaction();
		expect(events).toEqual(["write:entered"]);
		release?.();
		await writing;
		await deleting;
		expect(documents.size).toBe(0);
		expect(
			events.filter((event) => event === "retire:acknowledged")
		).toHaveLength(2);
		expect(await getWebsiteBusinessScope(first)).toBeNull();
		expect(await getWebsiteBusinessScope(second)).toBeNull();
		const remaining = await db.execute(
			sql`SELECT id FROM organization WHERE id=${org}`
		);
		expect(remaining.rows).toHaveLength(0);
	}, 10_000);

	it("organization deletion blocks late writes and new website references until the cascade commits", async () => {
		const scope = await fixture();
		hold = "retire";
		const deleting = deleteOrganizationWithBusinessMemory(org);
		await entered;
		const writing = write(scope).then(
			() => "unexpected write",
			(error) => error.message
		);
		const creating = db
			.insert(websites)
			.values({
				id: `synthetic-${randomUUID()}`,
				organizationId: org,
				domain: "new.example.com",
			})
			.then(
				() => "unexpected creation",
				() => "rejected"
			);
		await waitForBlockedTransaction();
		release?.();
		await deleting;
		expect(await writing).toContain("scope changed or was deleted");
		expect(await creating).toBe("rejected");
		expect(events).not.toContain("write:entered");
	}, 10_000);

	it("failed organization retirement retains scopes and organization for a retry", async () => {
		for (const failure of ["partial", "unavailable"] as const) {
			const scope = await fixture();
			documents.set(businessContainerTag(scope), 1);
			partial = failure === "partial";
			unavailable = failure === "unavailable";
			await expect(
				deleteOrganizationWithBusinessMemory(org)
			).rejects.toBeInstanceOf(BusinessMemoryRetirementError);
			expect(await getWebsiteBusinessScope(scope)).toEqual(scope);
			const remaining = await db.execute(
				sql`SELECT id FROM organization WHERE id=${org}`
			);
			expect(remaining.rows).toHaveLength(1);
			partial = false;
			unavailable = false;
		}
		await deleteOrganizationWithBusinessMemory(org);
		expect(documents.size).toBe(0);
	});
	it("a rejected website mutation leaves the memory index intact", async () => {
		const scope = await fixture();
		documents.set(businessContainerTag(scope), 1);
		await expect(
			db.transaction((tx) =>
				service.updateInTransaction(tx, scope.websiteId, {
					organizationId: "synthetic-missing-organization",
				})
			)
		).rejects.toThrow();
		expect(events).toEqual([]);
		expect(documents.get(businessContainerTag(scope))).toBe(1);
		expect(await getWebsiteBusinessScope(scope)).toEqual(scope);
	});
});
