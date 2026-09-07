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
import {
	organization,
	websiteBusinessContexts,
	websites,
} from "@databuddy/db/schema";
import type { BusinessProfile } from "@databuddy/shared/business-context";
import {
	loadBusinessProfileRecord,
	markBusinessProfileIndexed,
	saveBusinessProfileRecord,
} from "./business-profile";

// Explicit opt-in only; never inherit the normal .env DATABASE_URL.
const url = process.env.BUSINESS_PROFILE_TEST_DATABASE_URL;
const integration = url ? describe : describe.skip;
const epoch = "2026-09-01T00:00:00.000Z";
const refreshAfter = new Date("2026-09-15T00:00:00.000Z");
const asOf = new Date("2099-01-01T00:00:00.000Z");
const profile: BusinessProfile = {
	capturedAt: "2026-09-03T00:00:00.000Z",
	sources: [
		{
			id: "public-homepage",
			kind: "website",
			content: "Reports for small teams.",
			url: "https://reports.example.com/",
			observedAt: "2026-09-03T00:00:00.000Z",
		},
	],
	brief: {
		facts: [
			{
				topic: "offering",
				sourceId: "public-homepage",
				quote: "Reports for small teams.",
			},
		],
		unknowns: [],
	},
	issues: [],
};

integration("durable business profiles against isolated PostgreSQL", () => {
	let originalUrl: string | undefined;
	let originalKey: string | undefined;
	let fetch: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
	let scope: Parameters<typeof saveBusinessProfileRecord>[0];
	let secondOrg: string;

	beforeAll(() => {
		const parsed = new URL(url ?? "");
		if (
			!["127.0.0.1", "localhost"].includes(parsed.hostname) || !["/business_profile_eval", "/databuddy_test"].includes(parsed.pathname)
		)
			throw new Error(
				"Use an explicitly isolated loopback PostgreSQL test database"
			);
		originalUrl = process.env.DATABASE_URL;
		originalKey = process.env.SUPERMEMORY_API_KEY;
		process.env.DATABASE_URL = parsed.toString();
		Reflect.deleteProperty(process.env, "SUPERMEMORY_API_KEY");
		fetch = spyOn(globalThis, "fetch").mockRejectedValue(
			new Error("Durable storage must not call a remote provider")
		);
	});
	beforeEach(async () => {
		scope = {
			organizationId: `synthetic-${randomUUID()}`,
			websiteId: `synthetic-${randomUUID()}`,
			domain: "reports.example.com",
			startedAt: epoch,
		};
		secondOrg = `synthetic-${randomUUID()}`;
		await db.insert(organization).values(
			[scope.organizationId, secondOrg].map((id) => ({
				id,
				name: "Synthetic",
				createdAt: new Date(),
			}))
		);
		await db.insert(websites).values({
			id: scope.websiteId,
			organizationId: scope.organizationId,
			domain: scope.domain,
			settings: { businessContextStartedAt: epoch },
		});
	});
	afterEach(async () => {
		await db
			.delete(organization)
			.where(eq(organization.id, scope.organizationId));
		await db.delete(organization).where(eq(organization.id, secondOrg));
	});
	afterAll(async () => {
		fetch?.mockRestore();
		await shutdownPostgres();
		if (originalUrl === undefined)
			Reflect.deleteProperty(process.env, "DATABASE_URL");
		else process.env.DATABASE_URL = originalUrl;
		if (originalKey === undefined)
			Reflect.deleteProperty(process.env, "SUPERMEMORY_API_KEY");
		else process.env.SUPERMEMORY_API_KEY = originalKey;
	});

	async function save(
		expectedRevision: number | null = null,
		document = profile
	) {
		const saved = await saveBusinessProfileRecord(scope, document, {
			expectedRevision,
			refreshAfter,
		});
		if (!saved) throw new Error("Synthetic profile was not saved");
		return saved;
	}

	async function waitForWriter(
		tx: Parameters<Parameters<typeof db.transaction>[0]>[0]
	) {
		const deadline = Date.now() + 2000;
		while (Date.now() < deadline) {
			const result =
				await tx.execute(sql`SELECT count(*)::int AS waiting FROM pg_stat_activity
				WHERE datname = current_database() AND wait_event_type = 'Lock'
				AND query LIKE '%websites%' AND pg_backend_pid() = ANY(pg_blocking_pids(pid))`);
			if (Number(result.rows[0]?.waiting) > 0) return;
			await Bun.sleep(10);
		}
		throw new Error(
			"The second database session did not wait on the website row"
		);
	}

	it("loads original JSON with the provider disabled and applies the as-of boundary", async () => {
		const saved = await save();
		expect(saved.revision).toBe(1);
		expect(saved.indexedRevision).toBeNull();
		expect(saved.profile).toEqual(profile);
		expect(
			await loadBusinessProfileRecord(scope, new Date(profile.capturedAt))
		).toEqual(saved);
		expect(
			await loadBusinessProfileRecord(
				scope,
				new Date(Date.parse(profile.capturedAt) - 1)
			)
		).toBeNull();
		expect(
			await loadBusinessProfileRecord(
				{ ...scope, domain: "www.reports.example.com" },
				asOf
			)
		).toEqual(saved);
		expect(fetch).not.toHaveBeenCalled();
	});
	it("rejects stale revisions and acknowledges only the exact current projection", async () => {
		const first = await save();
		expect(
			(await markBusinessProfileIndexed(scope, first.revision))?.indexedRevision
		).toBe(1);
		const second = await save(1, { ...profile, brief: null });
		expect(second.revision).toBe(2);
		expect(second.indexedRevision).toBeNull();
		expect(
			await saveBusinessProfileRecord(scope, profile, {
				expectedRevision: 1,
				refreshAfter,
			})
		).toBeNull();
		expect(
			await saveBusinessProfileRecord(scope, profile, {
				expectedRevision: null,
				refreshAfter,
			})
		).toBeNull();
		expect(await markBusinessProfileIndexed(scope, 1)).toBeNull();
		const indexed = await markBusinessProfileIndexed(scope, 2);
		expect(indexed?.indexedRevision).toBe(2);
		expect(indexed?.updatedAt).toEqual(second.updatedAt);
		expect(
			(await loadBusinessProfileRecord(scope, asOf))?.profile.brief
		).toBeNull();
	});
	it("lets only one concurrent writer consume an expected revision", async () => {
		await save();
		const results = await Promise.all([
			saveBusinessProfileRecord(
				scope,
				{ ...profile, issues: ["First writer"] },
				{
					expectedRevision: 1,
					refreshAfter,
				}
			),
			saveBusinessProfileRecord(
				scope,
				{ ...profile, issues: ["Second writer"] },
				{
					expectedRevision: 1,
					refreshAfter,
				}
			),
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
		expect((await loadBusinessProfileRecord(scope, asOf))?.revision).toBe(2);
		expect((await loadBusinessProfileRecord(scope, asOf))?.profile).toEqual(
			results.find(Boolean)?.profile
		);
	});
	it("serializes concurrent creation of an absent profile", async () => {
		const results = await Promise.all([
			saveBusinessProfileRecord(scope, profile, {
				expectedRevision: null,
				refreshAfter,
			}),
			saveBusinessProfileRecord(scope, profile, {
				expectedRevision: null,
				refreshAfter,
			}),
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
		expect((await loadBusinessProfileRecord(scope, asOf))?.revision).toBe(1);
	});
	it("rechecks the epoch after waiting for a website mutation in a second session", async () => {
		await save();
		let writing: ReturnType<typeof saveBusinessProfileRecord> | undefined;
		const startedAt = "2026-09-02T00:00:00.000Z";
		await db.transaction(async (tx) => {
			await tx
				.update(websites)
				.set({ settings: { businessContextStartedAt: startedAt } })
				.where(eq(websites.id, scope.websiteId));
			writing = saveBusinessProfileRecord(scope, profile, {
				expectedRevision: 1,
				refreshAfter,
			});
			await waitForWriter(tx);
		});
		expect(await writing).toBeNull();
		expect(await loadBusinessProfileRecord(scope, asOf)).toBeNull();
		expect(await markBusinessProfileIndexed(scope, 1)).toBeNull();
		const current = { ...scope, startedAt };
		expect(await loadBusinessProfileRecord(current, asOf)).toBeNull();
		expect(
			await saveBusinessProfileRecord(current, profile, {
				expectedRevision: 1,
				refreshAfter,
			})
		).toBeNull();
		expect(
			(
				await saveBusinessProfileRecord(current, profile, {
					expectedRevision: null,
					refreshAfter,
				})
			)?.revision
		).toBe(2);
	});
	it.each([
		"domain",
		"organization",
		"deleted",
		"epoch removed",
	])("hides and rejects the old scope after %s changes", async (change) => {
		await save();
		const changes = {
			domain: { domain: "other.example.com" },
			organization: { organizationId: secondOrg },
			deleted: { deletedAt: new Date() },
			"epoch removed": { settings: null },
		};
		await db
			.update(websites)
			.set(changes[change])
			.where(eq(websites.id, scope.websiteId));
		expect(await loadBusinessProfileRecord(scope, asOf)).toBeNull();
		expect(
			await saveBusinessProfileRecord(scope, profile, {
				expectedRevision: 1,
				refreshAfter,
			})
		).toBeNull();
		expect(await markBusinessProfileIndexed(scope, 1)).toBeNull();
	});
	it("rejects foreign scopes before returning or overwriting a document", async () => {
		await save();
		const foreign = { ...scope, organizationId: secondOrg };
		expect(await loadBusinessProfileRecord(foreign, asOf)).toBeNull();
		expect(
			await saveBusinessProfileRecord(foreign, profile, {
				expectedRevision: null,
				refreshAfter,
			})
		).toBeNull();
		expect(await markBusinessProfileIndexed(foreign, 1)).toBeNull();
	});
	it("rechecks deletion after waiting and the website FK cascades the document", async () => {
		await save();
		let writing: ReturnType<typeof saveBusinessProfileRecord> | undefined;
		await db.transaction(async (tx) => {
			await tx.delete(websites).where(eq(websites.id, scope.websiteId));
			writing = saveBusinessProfileRecord(scope, profile, {
				expectedRevision: 1,
				refreshAfter,
			});
			await waitForWriter(tx);
		});
		expect(await writing).toBeNull();
		expect(
			await db
				.select()
				.from(websiteBusinessContexts)
				.where(eq(websiteBusinessContexts.websiteId, scope.websiteId))
		).toEqual([]);
	});
	it("cascades organization deletion and enforces a positive revision", async () => {
		await save();
		await expect(
			db
				.update(websiteBusinessContexts)
				.set({ revision: 0 })
				.where(eq(websiteBusinessContexts.websiteId, scope.websiteId))
				.execute()
		).rejects.toThrow();
		await db
			.delete(organization)
			.where(eq(organization.id, scope.organizationId));
		expect(
			await db
				.select()
				.from(websiteBusinessContexts)
				.where(eq(websiteBusinessContexts.websiteId, scope.websiteId))
		).toEqual([]);
	});
	it("rejects unsupported brief quotations before persisting the document", async () => {
		const invalid = {
			...profile,
			brief: {
				facts: [
					{
						topic: "offering" as const,
						sourceId: "public-homepage",
						quote: "An invented promise.",
					},
				],
				unknowns: [],
			},
		};
		await expect(
			saveBusinessProfileRecord(scope, invalid, {
				expectedRevision: null,
				refreshAfter,
			})
		).rejects.toThrow();
		expect(await loadBusinessProfileRecord(scope, asOf)).toBeNull();
	});
	it.each([
		"2026-08-31T00:00:00.000Z",
		"2026-09-04T00:00:00.000Z",
	])("rejects sources outside the scope/capture window: %s", async (observedAt) => {
		const invalid = {
			...profile,
			sources: profile.sources.map((source) => ({ ...source, observedAt })),
		};
		expect(
			await saveBusinessProfileRecord(scope, invalid, {
				expectedRevision: null,
				refreshAfter,
			})
		).toBeNull();
		await save();
		await db
			.update(websiteBusinessContexts)
			.set({ profile: invalid })
			.where(eq(websiteBusinessContexts.websiteId, scope.websiteId));
		expect(await loadBusinessProfileRecord(scope, asOf)).toBeNull();
	});
	it("does not expose malformed stored JSON or captures preceding the epoch", async () => {
		await save();
		await db
			.update(websiteBusinessContexts)
			.set({ profile: sql`'{}'::jsonb` })
			.where(eq(websiteBusinessContexts.websiteId, scope.websiteId));
		expect(await loadBusinessProfileRecord(scope, asOf)).toBeNull();
		expect(
			await saveBusinessProfileRecord(
				scope,
				{
					...profile,
					capturedAt: "2026-08-31T00:00:00.000Z",
					sources: [],
					brief: null,
				},
				{ expectedRevision: 1, refreshAfter }
			)
		).toBeNull();
	});
});
