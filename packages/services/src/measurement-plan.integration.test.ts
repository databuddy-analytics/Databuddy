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
import { organization, websites } from "@databuddy/db/schema";
import type { BusinessMeasurementPlan } from "@databuddy/shared/organization-business-context";
import {
	beginBusinessContextGeneration,
	markBusinessContextGeneration,
	readOrganizationBusinessContext,
	restoreOrganizationBusinessProfile,
	saveOrganizationBusinessProfile,
} from "./organization-business-context";

// Run from packages/services with env -i, --no-env-file, and this synthetic DSN.
// Never load a developer .env or point this suite at customer data.
const databaseUrl =
	"postgresql://postgres:synthetic-only@localhost:16553/business_context_settings";
const integration =
	process.env.BUSINESS_CONTEXT_INTEGRATION_TESTS === "true"
		? describe
		: describe.skip;

integration("measurement plan storage in synthetic PostgreSQL", () => {
	let org: string;
	let other: string;
	let websiteId: string;
	let secondaryId: string;
	let foreignId: string;
	let plans: BusinessMeasurementPlan[];
	const teamContext = {
		priority: "Increase activation for synthetic teams",
		successDefinition: "A team publishes its first report",
		exclusions: "Exclude synthetic employee traffic",
	};
	const draft = {
		content: "A synthetic reporting service for small teams.",
		sources: [{ url: "https://reports.example.com/", title: "Reports" }],
	};

	beforeAll(() => {
		if (process.env.DATABASE_URL !== databaseUrl) {
			throw new Error(
				"Use only the synthetic localhost:16553/business_context_settings PostgreSQL database"
			);
		}
	});

	beforeEach(async () => {
		org = `synthetic-measurement-${randomUUID()}`;
		other = `synthetic-measurement-${randomUUID()}`;
		websiteId = `synthetic-measurement-${randomUUID()}`;
		secondaryId = `synthetic-measurement-${randomUUID()}`;
		foreignId = `synthetic-measurement-${randomUUID()}`;
		await db.insert(organization).values(
			[org, other].map((id) => ({
				id,
				name: "Synthetic measurement organization",
				slug: id,
				createdAt: new Date(),
				metadata: JSON.stringify({ unrelated: { preserved: true } }),
			}))
		);
		await db.insert(websites).values([
			{
				id: websiteId,
				organizationId: org,
				domain: "reports.example.com",
				name: "Synthetic reports",
			},
			{
				id: secondaryId,
				organizationId: org,
				domain: "archive.example.com",
				name: "Synthetic archive",
			},
			{
				id: foreignId,
				organizationId: other,
				domain: "archive.example.com",
				name: "Synthetic foreign archive",
			},
		]);
		plans = [
			{
				websiteId,
				domain: "reports.example.com",
				name: "Report activation",
				activationEvent: "report_published",
				returnEvent: "report_viewed",
				horizonDays: 7,
				namespace: "synthetic-reporting",
			},
			{
				websiteId: secondaryId,
				domain: "archive.example.com",
				name: "Archive activation",
				activationEvent: "archive_created",
				returnEvent: "archive_opened",
				horizonDays: 30,
			},
		];
	});

	afterEach(async () => {
		// Organization deletion cascades to all websites, including transferred ones.
		await db.delete(organization).where(inArray(organization.id, [org, other]));
	});
	afterAll(() => shutdownPostgres());

	const save = async (
		input: Omit<
			Parameters<typeof saveOrganizationBusinessProfile>[0],
			"organizationId" | "updatedBy"
		>
	) => {
		const saved = await saveOrganizationBusinessProfile({
			...input,
			organizationId: org,
			updatedBy: "synthetic-owner",
		});
		if (!saved.profile) {
			throw new Error("Save did not return a profile");
		}
		return { ...saved, profile: saved.profile };
	};

	const metadata = async (id = org) => {
		const row = await db.query.organization.findFirst({
			where: { id },
			columns: { metadata: true },
		});
		if (!row?.metadata) {
			throw new Error("Missing synthetic organization metadata");
		}
		return row.metadata;
	};

	const generate = async () => {
		const started = await beginBusinessContextGeneration({
			organizationId: org,
			websiteId,
			requestedBy: "synthetic-owner",
		});
		if (!started.generation) {
			throw new Error("Missing synthetic generation");
		}
		return started.generation.id;
	};

	const ready = async () => {
		const generationId = await generate();
		await markBusinessContextGeneration({
			organizationId: org,
			generationId,
			status: "ready",
			draft,
		});
		return generationId;
	};

	test("round-trips plans for multiple owned websites without changing other metadata or tenants", async () => {
		const saved = await save({
			revision: 0,
			content: "Synthetic owner context",
			teamContext,
			measurementPlans: plans,
		});
		const read = await readOrganizationBusinessContext(org);
		expect(read).toEqual(saved);
		expect(read.profile).toMatchObject({
			content: "Synthetic owner context",
			teamContext,
			measurementPlans: plans,
			revision: 1,
		});
		const stored: unknown = JSON.parse(await metadata());
		expect(stored).toMatchObject({
			unrelated: { preserved: true },
			businessContext: { profile: { measurementPlans: plans } },
		});
		expect(await readOrganizationBusinessContext(other)).toEqual({
			profile: null,
			generation: null,
		});
	});

	test("omitting plans on a later text and team-context save preserves their exact definitions", async () => {
		const original = await save({
			revision: 0,
			content: "Original context",
			measurementPlans: plans,
		});
		await save({ revision: 1, content: "Revised context", teamContext });
		const read = await readOrganizationBusinessContext(org);
		expect(read.profile).toMatchObject({
			content: "Revised context",
			teamContext,
			measurementPlans: plans,
			revision: 2,
		});
		expect(read.history).toEqual([original.profile]);
	});

	test.each([
		"transferred",
		"deleted",
		"missing",
		"changed domain",
	] as const)("validates inherited plans after their website is %s", async (binding) => {
		await save({ revision: 0, content: "Original", measurementPlans: plans });
		const generationId = await ready();
		if (binding === "transferred") {
			await db.delete(websites).where(eq(websites.id, foreignId));
			await db
				.update(websites)
				.set({ organizationId: other })
				.where(eq(websites.id, secondaryId));
		} else if (binding === "deleted") {
			await db
				.update(websites)
				.set({ deletedAt: new Date() })
				.where(eq(websites.id, secondaryId));
		} else if (binding === "missing") {
			await db.delete(websites).where(eq(websites.id, secondaryId));
		} else {
			await db
				.update(websites)
				.set({ domain: "changed.example.com" })
				.where(eq(websites.id, secondaryId));
		}
		const before = await metadata();
		const foreignBefore = await metadata(other);
		for (const candidate of [
			{ revision: 1, content: "Text-only edit", teamContext },
			{ revision: 1, content: draft.content, generationId },
		]) {
			await expect(save(candidate)).rejects.toMatchObject({ code: "CONFLICT" });
			expect(await metadata()).toBe(before);
			expect(await metadata(other)).toBe(foreignBefore);
		}
		const repaired = await save({
			revision: 1,
			content: "Remove the stale definition",
			measurementPlans: [plans[0]],
		});
		expect(repaired.profile.measurementPlans).toEqual([plans[0]]);
		expect(repaired.profile.revision).toBe(2);
	});

	test("an explicit empty array clears plans and a later omission keeps them cleared", async () => {
		const original = await save({
			revision: 0,
			content: "Owner context",
			teamContext,
			measurementPlans: plans,
		});
		const cleared = await save({
			revision: 1,
			content: "Owner context",
			measurementPlans: [],
		});
		expect(await readOrganizationBusinessContext(org)).toEqual(cleared);
		expect(cleared.profile).toMatchObject({
			measurementPlans: [],
			teamContext,
			revision: 2,
		});
		expect(cleared.history).toEqual([original.profile]);
		await save({ revision: 2, content: "Another text edit" });
		const read = await readOrganizationBusinessContext(org);
		expect(read.profile?.measurementPlans).toEqual([]);
		expect(read.history).toEqual([original.profile, cleared.profile]);
	});

	test("public generation and accepting its draft preserve owner plans and their history", async () => {
		const original = await save({
			revision: 0,
			content: "",
			teamContext,
			measurementPlans: plans,
		});
		const generationId = await generate();
		expect((await readOrganizationBusinessContext(org)).profile).toEqual(
			original.profile
		);
		for (const status of ["running", "ready"] as const) {
			await markBusinessContextGeneration({
				organizationId: org,
				generationId,
				status,
				...(status === "ready" ? { draft } : {}),
			});
			const read = await readOrganizationBusinessContext(org);
			expect(read.generation?.status).toBe(status);
			expect(read.profile).toEqual(original.profile);
		}
		expect(
			(await readOrganizationBusinessContext(org)).generation?.draft
		).toEqual(draft);
		await save({ revision: 1, content: draft.content, generationId });
		const accepted = await readOrganizationBusinessContext(org);
		expect(accepted.profile).toMatchObject({
			...draft,
			origin: "website",
			sourceWebsiteId: websiteId,
			teamContext,
			measurementPlans: plans,
			revision: 2,
		});
		expect(accepted.history).toEqual([original.profile]);
		expect(accepted.generation).toBeNull();
	});

	test("history restores the matching plans, text, team inputs and sources at a new revision", async () => {
		const generationId = await ready();
		const original = await save({
			revision: 0,
			content: draft.content,
			generationId,
			teamContext,
			measurementPlans: plans,
		});
		const edited = await save({
			revision: 1,
			content: "Rewritten context",
			teamContext: { ...teamContext, priority: "Improve archive returns" },
			measurementPlans: [{ ...plans[1], returnEvent: "archive_exported" }],
		});
		const cleared = await save({
			revision: 2,
			content: "Cleared definitions",
			measurementPlans: [],
		});
		await restoreOrganizationBusinessProfile({
			organizationId: org,
			revision: 3,
			restoreRevision: 1,
			updatedBy: "synthetic-restorer",
		});
		const restored = await readOrganizationBusinessContext(org);
		expect(restored.profile).toEqual({
			...original.profile,
			revision: 4,
			updatedAt: expect.any(String),
			updatedBy: "synthetic-restorer",
		});
		expect(restored.history).toEqual([
			original.profile,
			edited.profile,
			cleared.profile,
		]);
		await restoreOrganizationBusinessProfile({
			organizationId: org,
			revision: 4,
			restoreRevision: 3,
			updatedBy: "synthetic-restorer",
		});
		expect((await readOrganizationBusinessContext(org)).profile).toMatchObject({
			content: "Cleared definitions",
			measurementPlans: [],
			revision: 5,
		});
	});

	test.each([
		"foreign",
		"deleted",
		"missing",
		"changed domain",
	] as const)("rejects a %s website binding without partially saving valid plans or consuming drafts", async (binding) => {
		await save({ revision: 0, content: "Keep this", measurementPlans: plans });
		await ready();
		await ready();
		const candidate = plans.map((plan) => ({ ...plan, name: "Must not save" }));
		if (binding === "foreign") {
			candidate[1].websiteId = foreignId;
		}
		if (binding === "deleted") {
			await db
				.update(websites)
				.set({ deletedAt: new Date() })
				.where(eq(websites.id, secondaryId));
		}
		if (binding === "missing") {
			await db.delete(websites).where(eq(websites.id, secondaryId));
		}
		if (binding === "changed domain") {
			await db
				.update(websites)
				.set({ domain: "changed.example.com" })
				.where(eq(websites.id, secondaryId));
		}
		const before = await metadata();
		const foreignBefore = await metadata(other);
		await expect(
			save({
				revision: 1,
				content: "Must not save",
				teamContext,
				measurementPlans: candidate,
			})
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(await metadata()).toBe(before);
		expect(await metadata(other)).toBe(foreignBefore);
	});

	test.each([
		"transferred",
		"deleted",
		"changed domain",
	] as const)("history cannot restore a plan whose website was %s", async (binding) => {
		await save({ revision: 0, content: "Original", measurementPlans: plans });
		await save({ revision: 1, content: "Current", measurementPlans: [] });
		await ready();
		if (binding === "transferred") {
			await db.delete(websites).where(eq(websites.id, foreignId));
			await db
				.update(websites)
				.set({ organizationId: other })
				.where(eq(websites.id, secondaryId));
		}
		if (binding === "deleted") {
			await db
				.update(websites)
				.set({ deletedAt: new Date() })
				.where(eq(websites.id, secondaryId));
		}
		if (binding === "changed domain") {
			await db
				.update(websites)
				.set({ domain: "changed.example.com" })
				.where(eq(websites.id, secondaryId));
		}
		const before = await metadata();
		await expect(
			restoreOrganizationBusinessProfile({
				organizationId: org,
				revision: 2,
				restoreRevision: 1,
				updatedBy: "synthetic-restorer",
			})
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(await metadata()).toBe(before);
	});

	test("stale saves and restores leave profile, plans, history, drafts and metadata byte-for-byte unchanged", async () => {
		await save({ revision: 0, content: "Original", measurementPlans: plans });
		await save({
			revision: 1,
			content: "Current",
			teamContext,
			measurementPlans: [plans[1]],
		});
		await ready();
		const generationId = await ready();
		const state = await readOrganizationBusinessContext(org);
		expect(state.history).toHaveLength(1);
		expect(state.previousDrafts).toHaveLength(1);
		expect(state.generation?.status).toBe("ready");
		const before = await metadata();
		for (const measurementPlans of [undefined, [], plans]) {
			await expect(
				save({
					revision: 1,
					content: draft.content,
					generationId,
					measurementPlans,
					teamContext: { ...teamContext, priority: "Stale priority" },
				})
			).rejects.toMatchObject({ code: "CONFLICT" });
			expect(await metadata()).toBe(before);
		}
		await expect(
			restoreOrganizationBusinessProfile({
				organizationId: org,
				revision: 1,
				restoreRevision: 1,
				updatedBy: "synthetic-stale-restorer",
			})
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(await metadata()).toBe(before);
		expect(await readOrganizationBusinessContext(org)).toEqual(state);
	});

	test("concurrent plan editors produce one complete winner and one revision conflict", async () => {
		const original = await save({
			revision: 0,
			content: "Original",
			measurementPlans: plans,
		});
		const edits = [
			{
				revision: 1,
				content: "Editor one",
				measurementPlans: [{ ...plans[0], returnEvent: "report_exported" }],
			},
			{ revision: 1, content: "Editor two", measurementPlans: [] },
		];
		const results = await Promise.allSettled(edits.map(save));
		expect(
			results.filter((result) => result.status === "fulfilled")
		).toHaveLength(1);
		expect(
			results.filter((result) => result.status === "rejected")
		).toHaveLength(1);
		const winner = results.findIndex((result) => result.status === "fulfilled");
		const loser = results.find((result) => result.status === "rejected");
		if (loser?.status !== "rejected") {
			throw new Error("Expected a revision conflict");
		}
		expect(loser.reason).toMatchObject({ code: "CONFLICT" });
		const read = await readOrganizationBusinessContext(org);
		expect(read.profile).toMatchObject({
			content: edits[winner].content,
			measurementPlans: edits[winner].measurementPlans,
			revision: 2,
		});
		expect(read.history).toEqual([original.profile]);
	});
});
