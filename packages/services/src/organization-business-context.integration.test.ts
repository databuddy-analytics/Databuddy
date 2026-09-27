import "@databuddy/db/test-env";
import { randomUUID } from "node:crypto";
import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { db, eq, inArray, shutdownPostgres, sql } from "@databuddy/db";
import {
	organization,
	organizationBusinessContexts,
	websites,
} from "@databuddy/db/schema";
import {
	beginBusinessContextGeneration,
	cancelBusinessContextGeneration,
	restoreOrganizationBusinessProfile,
	markBusinessContextGeneration,
	readOrganizationBusinessContext,
	saveOrganizationBusinessProfile,
} from "./organization-business-context";
import { type UpdateWebsiteInput, WebsiteService } from "./websites";

const enabled = process.env.BUSINESS_CONTEXT_INTEGRATION_TESTS === "true";
const integration = enabled ? describe : describe.skip;

afterAll(() => shutdownPostgres());

integration("organization business context in isolated PostgreSQL", () => {
	let org: string;
	let other: string;
	let websiteId: string;
	beforeEach(async () => {
		org = `synthetic-${randomUUID()}`;
		other = `synthetic-${randomUUID()}`;
		websiteId = `synthetic-${randomUUID()}`;
		await db.insert(organization).values(
			[org, other].map((id) => ({
				id,
				name: "Synthetic organization",
				slug: id,
				createdAt: new Date(),
				metadata: JSON.stringify({ unrelated: { preserved: true } }),
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
		await db.delete(organization).where(eq(organization.id, org));
		await db.delete(organization).where(eq(organization.id, other));
	});
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
	const teamContext = {
		priority: "Increase activation",
		successDefinition:
			"Activation means SDK installed and first production event",
		exclusions: "Exclude employee and test traffic",
	};

	test("partial research survives failure without publishing a brief or accepting late outcomes", async () => {
		const generation = (await generate()).generation;
		if (!generation) {
			throw new Error("Missing generation");
		}
		const research = {
			startedAt: generation.requestedAt,
			pages: [
				{
					url: "https://reports.example.com/",
					status: "read" as const,
					title: "Reports",
				},
				{
					url: "https://reports.example.com/pricing",
					status: "failed" as const,
				},
			],
			discoveryFailed: true,
		};
		await markBusinessContextGeneration({
			organizationId: org,
			generationId: generation.id,
			status: "running",
			research,
		});
		await markBusinessContextGeneration({
			organizationId: org,
			generationId: generation.id,
			status: "failed",
			error: "The draft could not be completed.",
		});
		await markBusinessContextGeneration({
			organizationId: org,
			generationId: generation.id,
			status: "ready",
			draft,
			research: { ...research, pages: [] },
		});
		const state = await readOrganizationBusinessContext(org);
		expect(state.profile).toBeNull();
		expect(state.generation).toMatchObject({
			status: "failed",
			draft: null,
			research,
		});
		expect(state.generation?.progress).toBeUndefined();
	});

	test("follow-up answers save through team context without adopting AI text and survive history", async () => {
		await save("Team-authored brief");
		const generation = (await generate()).generation;
		if (!generation) {
			throw new Error("Missing generation");
		}
		const research = { startedAt: generation.requestedAt, pages: [] };
		const questions = [
			{
				field: "priority" as const,
				question: "Which customer outcome matters most?",
			},
			{
				field: "successDefinition" as const,
				question: "What marks a customer's first successful report?",
			},
		];
		await markBusinessContextGeneration({
			organizationId: org,
			generationId: generation.id,
			status: "ready",
			draft: { ...draft, followUpQuestions: questions },
			research,
		});
		const saved = await saveOrganizationBusinessProfile({
			organizationId: org,
			revision: 1,
			content: "Team-authored brief",
			updatedBy: "synthetic-owner",
			teamContext: {
				priority: "Improve report sharing",
				successDefinition: " ",
				exclusions: "",
			},
		});
		expect(saved.generation).toBeNull();
		expect(saved.profile).toMatchObject({
			content: "Team-authored brief",
			origin: "team",
			sources: [],
			research,
			followUpQuestions: [questions[1]],
			teamContext: {
				priority: "Improve report sharing",
				successDefinition: "",
				exclusions: "",
			},
		});
		const answered = await saveOrganizationBusinessProfile({
			organizationId: org,
			revision: 2,
			content: "Corrected team brief",
			updatedBy: "synthetic-owner",
			teamContext,
		});
		expect(answered.profile?.followUpQuestions).toEqual([]);
		expect(answered.profile?.research).toEqual(research);
		const restored = await restoreOrganizationBusinessProfile({
			organizationId: org,
			revision: 3,
			restoreRevision: 2,
			updatedBy: "synthetic-owner",
		});
		expect(restored.profile).toMatchObject({
			content: "Team-authored brief",
			research,
			followUpQuestions: [questions[1]],
		});
	});

	test("an explicitly selected legacy draft never borrows another run's research or questions", async () => {
		const older = (await generate()).generation;
		if (!older) {
			throw new Error("Missing generation");
		}
		await markBusinessContextGeneration({
			organizationId: org,
			generationId: older.id,
			status: "ready",
			draft,
		});
		const newer = (await generate()).generation;
		if (!newer) {
			throw new Error("Missing generation");
		}
		await markBusinessContextGeneration({
			organizationId: org,
			generationId: newer.id,
			status: "ready",
			draft: {
				...draft,
				followUpQuestions: [
					{ field: "priority", question: "Which new outcome matters?" },
				],
			},
			research: { startedAt: newer.requestedAt, pages: [] },
		});
		const saved = await save(draft.content, 0, older.id);
		expect(saved.profile?.followUpQuestions).toBeUndefined();
		expect(saved.profile?.research).toBeUndefined();
	});

	test("source URLs stay scoped and streaming progress never becomes a saved draft", async () => {
		await expect(
			beginBusinessContextGeneration({
				organizationId: org,
				websiteId,
				requestedBy: "synthetic-owner",
				sourceUrls: ["https://other.example/setup"],
			})
		).rejects.toMatchObject({ code: "CONFLICT" });
		const sourceUrls = ["https://docs.reports.example.com/setup"];
		const started = await beginBusinessContextGeneration({
			organizationId: org,
			websiteId,
			requestedBy: "synthetic-owner",
			sourceUrls,
		});
		const generationId = started.generation!.id;
		expect(started.generation?.sourceUrls).toEqual(sourceUrls);
		const reading = await markBusinessContextGeneration({
			organizationId: org,
			generationId,
			status: "running",
			progress: { stage: "writing", content: "## Draft in progress" },
		});
		expect(reading.generation?.draft).toBeNull();
		expect(reading.profile).toBeNull();
		expect(reading.generation?.progress?.content).toBe("## Draft in progress");
		await expect(
			save("## Draft in progress", 0, generationId)
		).rejects.toMatchObject({ code: "CONFLICT" });
		const fetchedAt = new Date().toISOString();
		const completed = {
			...draft,
			sources: draft.sources.map((source) => ({ ...source, fetchedAt })),
		};
		await markBusinessContextGeneration({
			organizationId: org,
			generationId,
			status: "ready",
			draft: completed,
		});
		expect(
			(await readOrganizationBusinessContext(org)).generation?.progress
		).toBeUndefined();
		const saved = await save(completed.content, 0, generationId);
		expect(saved.profile?.sources[0]?.fetchedAt).toBe(fetchedAt);
	});

	test("team-only context survives public regeneration without becoming public evidence", async () => {
		await saveOrganizationBusinessProfile({
			organizationId: org,
			revision: 0,
			content: "",
			teamContext,
			updatedBy: "owner",
		});
		const generationId = (await generate()).generation!.id;
		await markBusinessContextGeneration({
			organizationId: org,
			generationId,
			status: "ready",
			draft,
		});
		const saved = await save(draft.content, 1, generationId);
		expect(saved.profile?.teamContext).toEqual(teamContext);
		expect(saved.profile?.origin).toBe("website");
		expect(saved.history?.[0]?.teamContext).toEqual(teamContext);
	});

	test("history restores text, team inputs and sources together using a new revision", async () => {
		const generationId = (await generate()).generation!.id;
		await markBusinessContextGeneration({
			organizationId: org,
			generationId,
			status: "ready",
			draft,
		});
		await saveOrganizationBusinessProfile({
			organizationId: org,
			revision: 0,
			content: draft.content,
			generationId,
			teamContext,
			updatedBy: "first-owner",
		});
		const edited = await saveOrganizationBusinessProfile({
			organizationId: org,
			revision: 1,
			content: "Entirely rewritten",
			teamContext: { priority: "", successDefinition: "", exclusions: "" },
			updatedBy: "second-owner",
		});
		expect(edited.profile).toMatchObject({
			origin: "mixed",
			sources: [],
			sourceWebsiteId: null,
		});
		const restored = await restoreOrganizationBusinessProfile({
			organizationId: org,
			revision: 2,
			restoreRevision: 1,
			updatedBy: "restoring-owner",
		});
		expect(restored.profile).toMatchObject({
			...draft,
			teamContext,
			origin: "website",
			sourceWebsiteId: websiteId,
			revision: 3,
			updatedBy: "restoring-owner",
		});
		expect(restored.history?.map((item) => item.revision)).toEqual([1, 2]);
		await expect(
			restoreOrganizationBusinessProfile({
				organizationId: org,
				revision: 2,
				restoreRevision: 1,
				updatedBy: "stale-owner",
			})
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect((await readOrganizationBusinessContext(org)).profile?.revision).toBe(
			3
		);
		await expect(
			restoreOrganizationBusinessProfile({
				organizationId: other,
				revision: 0,
				restoreRevision: 1,
				updatedBy: "other-owner",
			})
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("saved history retains only five previous versions", async () => {
		for (let revision = 0; revision < 8; revision++) {
			await save(`Version ${revision + 1}`, revision);
		}
		const saved = await readOrganizationBusinessContext(org);
		expect(saved.history?.map((item) => item.revision)).toEqual([
			3, 4, 5, 6, 7,
		]);
		await expect(
			restoreOrganizationBusinessProfile({
				organizationId: org,
				revision: 8,
				restoreRevision: 1,
				updatedBy: "owner",
			})
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("cancel is durable, rejects late publication and cannot cancel a newer generation", async () => {
		const old = (await generate()).generation!.id;
		await cancelBusinessContextGeneration({
			organizationId: org,
			generationId: old,
		});
		await markBusinessContextGeneration({
			organizationId: org,
			generationId: old,
			status: "ready",
			draft,
		});
		expect((await readOrganizationBusinessContext(org)).generation).toBeNull();
		const fresh = (await generate()).generation!.id;
		await cancelBusinessContextGeneration({
			organizationId: org,
			generationId: old,
		});
		expect((await readOrganizationBusinessContext(org)).generation?.id).toBe(
			fresh
		);
		await markBusinessContextGeneration({
			organizationId: org,
			generationId: fresh,
			status: "ready",
			draft,
		});
		const newer = (await generate()).generation!.id;
		await cancelBusinessContextGeneration({
			organizationId: org,
			generationId: fresh,
		});
		const state = await readOrganizationBusinessContext(org);
		expect(state.previousDrafts).toEqual([]);
		expect(state.generation?.id).toBe(newer);
	});

	test("request abort while publication waits for its lock cannot commit a ready draft", async () => {
		await save("Saved context");
		const generation = (await generate()).generation;
		if (!generation) {
			throw new Error("Missing generation");
		}
		const request = new AbortController();
		const locked = Promise.withResolvers<number>();
		const release = Promise.withResolvers<void>();
		const holding = db.transaction(async (tx) => {
			await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${org}))`);
			const result = await tx.execute<{ pid: number }>(
				sql`select pg_backend_pid() as pid`
			);
			const row = result.rows[0];
			if (!row) {
				throw new Error("Missing lock holder");
			}
			locked.resolve(row.pid);
			await release.promise;
		});
		holding.catch(locked.reject);
		const pid = await locked.promise;
		const outcome = Promise.allSettled([
			markBusinessContextGeneration({
				organizationId: org,
				generationId: generation.id,
				status: "ready",
				draft,
				signal: request.signal,
			}),
		]);
		try {
			let blocked = false;
			const deadline = Date.now() + 2000;
			while (!blocked && Date.now() < deadline) {
				const result = await db.execute<{ blocked: boolean }>(sql`
					select exists (
						select 1 from pg_stat_activity
						where ${pid} = any(pg_blocking_pids(pid))
						and wait_event = 'advisory'
					) as blocked
				`);
				blocked = result.rows[0]?.blocked ?? false;
				if (!blocked) {
					await Bun.sleep(10);
				}
			}
			expect(blocked).toBe(true);
			request.abort();
		} finally {
			release.resolve();
			await holding;
		}
		expect((await outcome)[0]).toMatchObject({
			status: "rejected",
			reason: { name: "AbortError" },
		});
		const state = await readOrganizationBusinessContext(org);
		expect(state.generation?.status).toBe("running");
		expect(state.generation?.draft).toBeNull();
		expect(state.profile?.content).toBe("Saved context");
		await cancelBusinessContextGeneration({
			organizationId: org,
			generationId: generation.id,
			activeOnly: true,
		});
		expect((await readOrganizationBusinessContext(org)).generation).toBeNull();
	});

	test("disconnect cleanup preserves terminal drafts and cannot remove a newer run", async () => {
		await save("Saved context");
		const first = (await generate()).generation;
		if (!first) {
			throw new Error("Missing generation");
		}
		await cancelBusinessContextGeneration({
			organizationId: org,
			generationId: first.id,
			activeOnly: true,
		});
		expect((await readOrganizationBusinessContext(org)).generation).toBeNull();
		for (const status of ["ready", "failed"] as const) {
			const pending = (await generate()).generation;
			if (!pending) {
				throw new Error("Missing generation");
			}
			await markBusinessContextGeneration({
				organizationId: org,
				generationId: pending.id,
				status,
				draft: status === "ready" ? draft : undefined,
			});
			await cancelBusinessContextGeneration({
				organizationId: org,
				generationId: pending.id,
				activeOnly: true,
			});
			expect(
				(await readOrganizationBusinessContext(org)).generation?.status
			).toBe(status);
		}
		const completed = (await generate()).generation;
		if (!completed) {
			throw new Error("Missing generation");
		}
		await markBusinessContextGeneration({
			organizationId: org,
			generationId: completed.id,
			status: "ready",
			draft,
		});
		const newer = await generate();
		await cancelBusinessContextGeneration({
			organizationId: org,
			generationId: completed.id,
			activeOnly: true,
		});
		const final = await readOrganizationBusinessContext(org);
		expect(final.generation?.id).toBe(newer.generation?.id);
		expect(final.previousDrafts?.some((item) => item.id === completed.id)).toBe(
			true
		);
		expect(final.profile?.content).toBe("Saved context");
	});

	test("manual content is durable and preserves unrelated organization metadata", async () => {
		const content = `Owner-defined priorities and terminology.\n${"x".repeat(11_500)}`;
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

	test("concurrent generation requests admit only one run and never replace saved content", async () => {
		await save("Owner context");
		const results = await Promise.allSettled([generate(), generate()]);
		expect(
			results.filter((result) => result.status === "fulfilled")
		).toHaveLength(1);
		const rejected = results.find((result) => result.status === "rejected");
		expect(rejected?.status === "rejected" && rejected.reason.code).toBe(
			"CONFLICT"
		);
		const started = results.find((result) => result.status === "fulfilled");
		if (started?.status !== "fulfilled" || !started.value.generation) {
			throw new Error("Missing admitted generation");
		}
		const generationId = started.value.generation.id;
		expect(started.value.generation.status).toBe("running");
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
		expect(saved.profile?.sources).toEqual([]);
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
			.update(organizationBusinessContexts)
			.set({ state: expired })
			.where(eq(organizationBusinessContexts.organizationId, org));
		expect(
			(await readOrganizationBusinessContext(org)).generation?.status
		).toBe("failed");
		const retried = await generate();
		expect(retried.generation?.id).not.toBe(started.generation?.id);
		expect(retried.profile?.content).toBe("Keep this");
	});
});

integration("business context source locking and provenance", () => {
	let org: string;
	let other: string;
	let websiteId: string;
	const draft = {
		content: "A synthetic reporting service.",
		sources: [{ url: "https://reports.example.com/", title: "Reports" }],
	};
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
		if (!state.generation) {
			throw new Error("Missing generation");
		}
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
				if (!blocked) {
					await Bun.sleep(10);
				}
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
		expect((await save(content, 1, generationId)).profile?.origin).toBe(
			"mixed"
		);
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

	test("metadata that is not an object neither breaks reads nor blocks writes", async () => {
		await db
			.update(organization)
			.set({ metadata: JSON.stringify("Hello world") })
			.where(inArray(organization.id, [org]));
		expect((await readOrganizationBusinessContext(org)).profile).toBeNull();
		await save("Our team sells annual contracts.");
		expect((await readOrganizationBusinessContext(org)).profile?.content).toBe(
			"Our team sells annual contracts."
		);
	});
});
