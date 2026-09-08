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
import { db, eq, shutdownPostgres } from "@databuddy/db";
import { organization, websites } from "@databuddy/db/schema";
import {
	beginBusinessContextGeneration,
	markBusinessContextGeneration,
	readOrganizationBusinessContext,
	saveOrganizationBusinessProfile,
} from "./organization-business-context";

const integration =
	process.env.BUSINESS_CONTEXT_INTEGRATION_TESTS === "true"
		? describe
		: describe.skip;
integration("organization business context in isolated PostgreSQL", () => {
	let org: string;
	let other: string;
	let websiteId: string;
	beforeAll(() => {
		const url = new URL(process.env.DATABASE_URL ?? "");
		if (
			!["localhost", "127.0.0.1"].includes(url.hostname) ||
			!["/databuddy_test", "/business_context_settings"].includes(url.pathname)
		) {
			throw new Error(
				"Use a localhost databuddy_test or business_context_settings database"
			);
		}
	});
	beforeEach(async () => {
		org = `synthetic-${randomUUID()}`;
		other = `synthetic-${randomUUID()}`;
		websiteId = `synthetic-${randomUUID()}`;
		await db
			.insert(organization)
			.values(
				[org, other].map((id) => ({
					id,
					name: "Synthetic organization",
					slug: id,
					createdAt: new Date(),
					metadata: JSON.stringify({ unrelated: { preserved: true } }),
				}))
			);
		await db
			.insert(websites)
			.values({
				id: websiteId,
				organizationId: org,
				domain: "reports.example.com",
				name: "Synthetic reports",
			});
	});
	afterEach(async () => {
		await db.delete(organization).where(eq(organization.id, org));
		await db.delete(organization).where(eq(organization.id, other));
	});
	afterAll(() => shutdownPostgres());
	const save = (content: string, revision = 0, generationId?: string) =>
		saveOrganizationBusinessProfile({
			organizationId: org,
			revision,
			content,
			updatedBy: "synthetic-owner",
			generationId,
		});
	const generate = () =>
		beginBusinessContextGeneration({
			organizationId: org,
			websiteId,
			requestedBy: "synthetic-owner",
		});
	const draft = {
		content: "A synthetic reporting service for small teams.",
		sources: [{ url: "https://reports.example.com/", title: "Reports" }],
	};

	test("manual content is durable and preserves unrelated organization metadata", async () => {
		const content =
			"Owner-defined priorities and terminology.\n" + "x".repeat(11_500);
		await save(content);
		const read = await readOrganizationBusinessContext(org);
		expect(read.profile?.content).toBe(content);
		expect(read.profile?.revision).toBe(1);
		const row = await db.query.organization.findFirst({
			where: { id: org },
			columns: { metadata: true },
		});
		expect(JSON.parse(row?.metadata ?? "{}").unrelated).toEqual({
			preserved: true,
		});
		expect((await readOrganizationBusinessContext(other)).profile).toBeNull();
	});

	test("duplicate generation requests share a draft job and never replace saved content", async () => {
		await save("Owner context");
		const [first, second] = await Promise.all([generate(), generate()]);
		expect(first.generation?.id).toBe(second.generation?.id);
		const generationId = first.generation!.id;
		await markBusinessContextGeneration({
			organizationId: org,
			generationId,
			status: "running",
		});
		await markBusinessContextGeneration({
			organizationId: org,
			generationId,
			status: "ready",
			draft,
		});
		const read = await readOrganizationBusinessContext(org);
		expect(read.profile?.content).toBe("Owner context");
		expect(read.generation?.draft).toEqual(draft);
		await save("Edited AI draft", 1, generationId);
		const saved = await readOrganizationBusinessContext(org);
		expect(saved.profile?.content).toBe("Edited AI draft");
		expect(saved.profile?.sources).toEqual(draft.sources);
		expect(saved.generation).toBeNull();
	});

	test("a manual save wins over a late generation result", async () => {
		const generationId = (await generate()).generation!.id;
		await save("New manual context");
		await markBusinessContextGeneration({
			organizationId: org,
			generationId,
			status: "ready",
			draft,
		});
		expect((await readOrganizationBusinessContext(org)).profile?.content).toBe(
			"New manual context"
		);
		expect((await readOrganizationBusinessContext(org)).generation).toBeNull();
	});

	test("concurrent editors cannot silently overwrite each other", async () => {
		await save("Original");
		const results = await Promise.allSettled([
			save("Editor one", 1),
			save("Editor two", 1),
		]);
		expect(
			results.filter((result) => result.status === "fulfilled")
		).toHaveLength(1);
		const rejected = results.find((result) => result.status === "rejected");
		expect(rejected?.status === "rejected" && rejected.reason.code).toBe(
			"CONFLICT"
		);
		expect((await readOrganizationBusinessContext(org)).profile?.revision).toBe(
			2
		);
	});

	test("stale draft IDs cannot be saved or complete a newer request", async () => {
		const old = (await generate()).generation!.id;
		await markBusinessContextGeneration({
			organizationId: org,
			generationId: old,
			status: "failed",
		});
		const fresh = (await generate()).generation!.id;
		await markBusinessContextGeneration({
			organizationId: org,
			generationId: old,
			status: "ready",
			draft,
		});
		expect((await readOrganizationBusinessContext(org)).generation?.id).toBe(
			fresh
		);
		await expect(save("Stale", 0, old)).rejects.toMatchObject({
			code: "CONFLICT",
		});
	});

	test("cross-organization websites are rejected before any draft is stored", async () => {
		await expect(
			beginBusinessContextGeneration({
				organizationId: other,
				websiteId,
				requestedBy: "synthetic-owner",
			})
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(
			(await readOrganizationBusinessContext(other)).generation
		).toBeNull();
	});

	test("a moved source cannot complete a draft for its old organization", async () => {
		const generationId = (await generate()).generation!.id;
		await db
			.update(websites)
			.set({ organizationId: other })
			.where(eq(websites.id, websiteId));
		await markBusinessContextGeneration({
			organizationId: org,
			generationId,
			status: "ready",
			draft,
		});
		expect(
			(await readOrganizationBusinessContext(org)).generation?.status
		).toBe("failed");
		expect(
			(await readOrganizationBusinessContext(org)).generation?.draft
		).toBeNull();
	});

	test("changing the source domain invalidates an already generated draft", async () => {
		const generationId = (await generate()).generation!.id;
		await markBusinessContextGeneration({
			organizationId: org,
			generationId,
			status: "ready",
			draft,
		});
		await db
			.update(websites)
			.set({ domain: "changed.example.com" })
			.where(eq(websites.id, websiteId));
		await expect(save("Old-site draft", 0, generationId)).rejects.toMatchObject(
			{ code: "CONFLICT" }
		);
		expect((await readOrganizationBusinessContext(org)).profile).toBeNull();
	});

	test("stalled jobs become retryable without deleting the saved profile", async () => {
		await save("Keep this");
		const started = await generate();
		const expired = {
			...started,
			generation: {
				...started.generation!,
				requestedAt: new Date(Date.now() - 181_000).toISOString(),
			},
		};
		await db
			.update(organization)
			.set({ metadata: JSON.stringify({ businessContext: expired }) })
			.where(eq(organization.id, org));
		expect(
			(await readOrganizationBusinessContext(org)).generation?.status
		).toBe("failed");
		const retried = await generate();
		expect(retried.generation?.id).not.toBe(started.generation?.id);
		expect(retried.profile?.content).toBe("Keep this");
	});
});
