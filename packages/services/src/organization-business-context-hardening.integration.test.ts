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
import { db, inArray, shutdownPostgres, sql } from "@databuddy/db";
import { organization, websites } from "@databuddy/db/schema";
import {
	beginBusinessContextGeneration,
	markBusinessContextGeneration,
	readOrganizationBusinessContext,
	saveOrganizationBusinessProfile,
} from "./organization-business-context";
import { WebsiteService, type UpdateWebsiteInput } from "./websites";

const integration =
	process.env.BUSINESS_CONTEXT_INTEGRATION_TESTS === "true"
		? describe
		: describe.skip;

integration("business context source locking and provenance", () => {
	let org: string;
	let other: string;
	let websiteId: string;
	const draft = {
		content: "A synthetic reporting service.",
		sources: [{ url: "https://reports.example.com/", title: "Reports" }],
	};
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
		org = `synthetic-lock-${randomUUID()}`;
		other = `synthetic-lock-${randomUUID()}`;
		websiteId = `synthetic-lock-${randomUUID()}`;
		await db.insert(organization).values(
			[org, other].map((id) => ({
				id,
				name: "Synthetic organization",
				slug: id,
				createdAt: new Date(),
			}))
		);
		await db.insert(websites).values({
			id: websiteId,
			organizationId: org,
			domain: "reports.example.com",
			name: "Synthetic reports",
		});
	});
	afterEach(async () => {
		await db.delete(organization).where(inArray(organization.id, [org, other]));
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
	const generate = async () => {
		const state = await beginBusinessContextGeneration({
			organizationId: org,
			websiteId,
			requestedBy: "synthetic-owner",
		});
		if (!state.generation) throw new Error("Missing generation");
		return state.generation.id;
	};
	const ready = async (content = draft.content) => {
		const generationId = await generate();
		await markBusinessContextGeneration({
			organizationId: org,
			generationId,
			status: "ready",
			draft: { ...draft, content },
		});
		return generationId;
	};

	// Hold a real website mutation open, then observe the store waiting on its
	// PostgreSQL row lock before committing. No sleeps choose the interleaving.
	async function interleave<T>(
		updates: UpdateWebsiteInput,
		operation: () => Promise<T>,
		restoreOwnership = false
	) {
		const locked = Promise.withResolvers<number>();
		const release = Promise.withResolvers<void>();
		const mutation = db.transaction(async (tx) => {
			await new WebsiteService(db, null).updateInTransaction(
				tx,
				websiteId,
				updates
			);
			const result = await tx.execute<{ pid: number }>(
				sql`select pg_backend_pid() as pid`
			);
			locked.resolve(result.rows[0].pid);
			await release.promise;
			if (restoreOwnership) {
				await new WebsiteService(db, null).updateInTransaction(tx, websiteId, {
					organizationId: org,
				});
			}
		});
		mutation.catch(locked.reject);
		const pid = await locked.promise;
		const outcome = operation().then(
			(value) => ({ value }),
			(error: unknown) => ({ error })
		);
		try {
			let blocked = false;
			const deadline = Date.now() + 2000;
			while (!blocked && Date.now() < deadline) {
				const result = await db.execute<{ blocked: boolean }>(sql`
					select exists (
						select 1 from pg_stat_activity
						where ${pid} = any(pg_blocking_pids(pid))
						and query like '%"websites"%'
					) as blocked
				`);
				blocked = result.rows[0].blocked;
				if (!blocked) await Bun.sleep(10);
			}
			expect(blocked).toBe(true);
		} finally {
			release.resolve();
			await mutation;
			await outcome;
		}
		return await outcome;
	}

	test("begin waits for a transfer and rejects the old organization", async () => {
		const result = await interleave({ organizationId: other }, generate);
		expect(result).toMatchObject({ error: { code: "NOT_FOUND" } });
		expect((await readOrganizationBusinessContext(org)).generation).toBeNull();
	});

	test("completion waits for a domain edit and fails the outdated draft", async () => {
		const generationId = await generate();
		const result = await interleave({ domain: "changed.example.com" }, () =>
			markBusinessContextGeneration({
				organizationId: org,
				generationId,
				status: "ready",
				draft,
			})
		);
		expect(result).toMatchObject({
			value: { generation: { status: "failed", draft: null } },
		});
		expect((await readOrganizationBusinessContext(org)).profile).toBeNull();
	});

	test("save waits for source deletion and preserves the previous profile", async () => {
		await save("Existing team context");
		const generationId = await ready();
		const result = await interleave({ deletedAt: new Date() }, () =>
			save(draft.content, 1, generationId)
		);
		expect(result).toMatchObject({ error: { code: "CONFLICT" } });
		expect((await readOrganizationBusinessContext(org)).profile).toMatchObject({
			content: "Existing team context",
			revision: 1,
		});
	});

	test("a source transfer can take the organization FK lock while completion waits", async () => {
		const generationId = await generate();
		const result = await interleave(
			{ organizationId: other },
			() =>
				markBusinessContextGeneration({
					organizationId: org,
					generationId,
					status: "ready",
					draft,
				}),
			true
		);
		expect(result).toMatchObject({
			value: { generation: { status: "ready", draft } },
		});
	});

	test("public generation and unchanged manual saves retain website provenance", async () => {
		const generationId = await ready();
		expect((await save(draft.content, 0, generationId)).profile?.origin).toBe(
			"website"
		);
		expect((await save(draft.content, 1)).profile?.origin).toBe("website");
		expect(
			(await save(`${draft.content} Trial started is our signup event.`, 2))
				.profile?.origin
		).toBe("mixed");
	});

	test("accepted regeneration keeps inherited nonempty team assertions", async () => {
		await save("Trial started is our signup event.");
		const content = `${draft.content} Trial started is our signup event.`;
		const generationId = await ready(content);
		expect((await save(content, 1, generationId)).profile?.origin).toBe("mixed");
		expect((await save(content, 2)).profile?.origin).toBe("mixed");
	});

	test("retaining the first AI draft preserves its sources and website provenance", async () => {
		const firstGeneration = await ready();
		await ready("A replacement public brief.");
		const saved = await save(draft.content, 0, firstGeneration);
		expect(saved.profile).toMatchObject({
			...draft,
			origin: "website",
			sourceWebsiteId: websiteId,
			revision: 1,
		});
		expect(saved.generation).toBeNull();
		expect(saved.previousDrafts ?? []).toHaveLength(0);
	});

	test("draft history stays bounded and evicted drafts cannot become team context", async () => {
		const firstGeneration = await ready();
		for (let attempt = 0; attempt < 6; attempt++) {
			await ready(`Replacement public brief ${attempt}.`);
		}
		const state = await readOrganizationBusinessContext(org);
		expect(state.previousDrafts).toHaveLength(5);
		expect(
			state.previousDrafts?.some((item) => item.id === firstGeneration)
		).toBe(false);
		await expect(save(draft.content, 0, firstGeneration)).rejects.toMatchObject(
			{
				code: "CONFLICT",
			}
		);
		expect((await readOrganizationBusinessContext(org)).profile).toBeNull();
	});

	test("an empty team profile does not upgrade public generation", async () => {
		await save("");
		const generationId = await ready();
		expect((await save(draft.content, 1, generationId)).profile?.origin).toBe(
			"website"
		);
	});

	test("editing a generated draft preserves mixed provenance", async () => {
		const generationId = await ready();
		expect(
			(await save("Our team sells annual contracts.", 0, generationId)).profile
				?.origin
		).toBe("mixed");
	});
});
