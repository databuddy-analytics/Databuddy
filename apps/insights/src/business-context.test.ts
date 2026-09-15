import "@databuddy/test/env";
import { describe, expect, it, spyOn } from "bun:test";
import {
	businessContextSchema,
	type BusinessContext,
	type BusinessSource,
} from "@databuddy/ai/lib/business-context";
import * as memory from "@databuddy/services/business-memory";
import type { OrganizationBusinessProfile } from "@databuddy/shared/organization-business-context";
import {
	loadCurrentBusinessScope,
	assertBusinessScopeCurrent,
	loadWebsiteBusinessProfile,
	recallWebsiteBusinessContext,
} from "./business-context";

const scope = {
	organizationId: "org-example",
	websiteId: "site-example",
	domain: "example.com",
	startedAt: "2026-09-01T00:00:00.000Z",
};
const asOf = new Date("2026-09-05T12:00:00.000Z");
const subjectKey = "custom_event_reach:report_prepared";
const recallInput = {
	scope,
	asOf,
	subjectKey,
	query: "report usage",
	allowWrite: true,
};
const statement: BusinessSource = {
	id: "reply-example",
	kind: "team_reply",
	observedAt: "2026-09-05T10:00:00.000Z",
	content:
		"Report preparation is NOT a completed download.\nKeep that distinction.",
	author: "Example teammate",
	subjectKey,
};
const page: BusinessSource = {
	id: "homepage-example",
	kind: "website",
	observedAt: "2026-09-05T09:00:00.000Z",
	content: "Example produces downloadable reports.",
	url: "https://example.com/",
};

function context(sources: BusinessSource[] = []): BusinessContext {
	return {
		capturedAt: asOf.toISOString(),
		sources,
		status: "ready",
		issues: [],
	};
}

function dependencies(
	overrides: Partial<
		NonNullable<Parameters<typeof loadWebsiteBusinessProfile>[1]>
	> = {}
): NonNullable<Parameters<typeof loadWebsiteBusinessProfile>[1]> {
	return {
		currentScope: async () => scope,
		readReplies: async () => [statement],
		loadProfile: async () => context([page]),
		recall: async () => context(),
		record: async ({ replies }) => ({
			status: "saved",
			ids: replies.map((reply) => reply.id),
		}),
		...overrides,
	};
}

describe("website business context reconciliation", () => {
	it("propagates native lookup failures instead of returning an unbound live scope", async () => {
		const failure = new Error("Native scope database unavailable");
		const lookup = spyOn(memory, "getWebsiteBusinessScope").mockRejectedValue(
			failure
		);
		try {
			await expect(
				loadCurrentBusinessScope({ ...scope, startedAt: undefined }, true)
			).rejects.toBe(failure);
			await expect(loadCurrentBusinessScope(scope)).rejects.toBe(failure);
		} finally {
			lookup.mockRestore();
		}
	});

	it("rejects missing or changed native scopes and binds successful initialization", async () => {
		const lookup = spyOn(memory, "getWebsiteBusinessScope");
		try {
			for (const changed of [
				null,
				{ ...scope, domain: "other.example" },
				{ ...scope, startedAt: "2026-09-05T11:00:00.000Z" },
			]) {
				lookup.mockResolvedValue(changed);
				await expect(loadCurrentBusinessScope(scope)).rejects.toThrow(
					"scope changed"
				);
			}
			lookup.mockResolvedValue(scope);
			expect(
				await loadCurrentBusinessScope({ ...scope, startedAt: undefined }, true)
			).toEqual(scope);
		} finally {
			lookup.mockRestore();
		}
	});

	it("awaits acknowledgment and stores the persisted statement verbatim during exact recall", async () => {
		let release: (() => void) | undefined;
		const acknowledged = new Promise<void>((resolve) => {
			release = resolve;
		});
		const written: BusinessSource[][] = [];
		let done = false;
		const work = recallWebsiteBusinessContext(
			recallInput,
			dependencies({
				record: async (input) => {
					written.push(input.replies);
					await acknowledged;
					return {
						status: "saved",
						ids: input.replies.map((reply) => reply.id),
					};
				},
			})
		).then((result) => {
			done = true;
			return result;
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(written).toEqual([[statement]]);
		expect(done).toBe(false);
		release?.();
		expect((await work).sources).toEqual([statement]);
	});

	it("does not reindex every shared recent reply when the profile lists only public documents", async () => {
		const replies = Array.from({ length: 16 }, (_, index) => ({
			...statement,
			id: `recent-${index}`,
		}));
		let writes = 0;
		const deps = dependencies({
			readReplies: async () => replies,
			record: async () => {
				writes += 1;
				return { status: "saved", ids: [] };
			},
		});
		for (let index = 0; index < 2; index += 1) {
			const result = await loadWebsiteBusinessProfile(
				{ scope, asOf, allowRefresh: true },
				deps
			);
			expect(result.sources).toContainEqual(page);
			expect(
				result.sources.filter((source) => source.kind === "team_reply")
			).toEqual(replies.slice(0, 15));
			expect(result.status).toBe("partial");
			expect(result.issues).toContain(
				"Context is bounded; additional source records were omitted."
			);
		}
		expect(writes).toBe(0);
	});

	it("retains raw replies when indexing fails, retries missed subject records, and skips retrieved IDs", async () => {
		let available = false;
		let writes = 0;
		const deps = dependencies({
			recall: async () => context(available ? [statement] : []),
			record: async () => {
				writes += 1;
				return { status: "unavailable", ids: [] };
			},
		});
		const first = await recallWebsiteBusinessContext(recallInput, deps);
		expect(first.status).toBe("partial");
		expect(first.sources).toContainEqual(statement);
		expect(first.issues.join(" ")).toContain("not acknowledged");
		await recallWebsiteBusinessContext(recallInput, deps);
		expect(writes).toBe(2);
		available = true;
		await recallWebsiteBusinessContext(recallInput, deps);
		expect(writes).toBe(2);
	});

	it("does not let retrieved text replace the canonical persisted statement", async () => {
		const result = await recallWebsiteBusinessContext(
			recallInput,
			dependencies({
				recall: async () =>
					context([{ ...statement, content: "Incorrect inferred meaning" }]),
				record: async () => {
					throw new Error("Known IDs should not be reindexed");
				},
			})
		);
		expect(result.sources).toEqual([statement]);
	});

	it("recalls bounded exact-subject PG context even when semantic search misses it", async () => {
		const reads: string[] = [];
		const result = await recallWebsiteBusinessContext(
			recallInput,
			dependencies({
				readReplies: async (input) => {
					expect(input.scope).toEqual(scope);
					expect(input.asOf).toEqual(asOf);
					reads.push(input.subjectKey ?? "");
					return [statement];
				},
			})
		);
		expect(reads).toEqual([subjectKey]);
		expect(result.sources).toEqual([statement]);
	});

	it("keeps raw replies during provider failure and does not claim partial acknowledgments were saved", async () => {
		for (const record of [
			async () => {
				throw new Error("Provider offline");
			},
			async () => ({ status: "saved" as const, ids: [] }),
		]) {
			const result = await recallWebsiteBusinessContext(
				recallInput,
				dependencies({
					recall: async () => {
						throw new Error("Provider offline");
					},
					record,
				})
			);
			expect(result.sources).toEqual([statement]);
			expect(result.status).toBe("partial");
			expect(result.issues.join(" ")).toContain("acknowledge");
		}
	});

	it("withholds indexed and raw context when deletion, transfer or a new scope epoch races retrieval", async () => {
		for (const changed of [
			null,
			{ ...scope, organizationId: "other" },
			{ ...scope, domain: "other.example" },
			{ ...scope, startedAt: "2026-09-05T11:00:00.000Z" },
		]) {
			let checks = 0;
			let writes = 0;
			const result = await recallWebsiteBusinessContext(
				recallInput,
				dependencies({
					currentScope: async () => (++checks === 1 ? scope : changed),
					recall: async () => context([page, statement]),
					record: async () => {
						writes += 1;
						return { status: "saved", ids: [statement.id] };
					},
				})
			);
			expect(writes).toBe(0);
			expect(result.sources).toEqual([]);
			expect(result.status).toBe("unavailable");
		}
	});

	it("preserves an unindexed correction when unrelated website edits leave its epoch unchanged", async () => {
		let recovered = false;
		const deps = dependencies({
			currentScope: async () => ({ ...scope }),
			record: async () => ({
				status: recovered ? "saved" : "unavailable",
				ids: recovered ? [statement.id] : [],
			}),
		});
		expect(
			(await recallWebsiteBusinessContext(recallInput, deps)).sources
		).toContainEqual(statement);
		recovered = true;
		const result = await recallWebsiteBusinessContext(recallInput, deps);
		expect(result.sources).toEqual([statement]);
		expect(result.status).toBe("ready");
	});

	it("preserves older semantic meaning ahead of long recent status replies for the same subject", async () => {
		const meaning = {
			...statement,
			id: "old-semantic-meaning",
			observedAt: "2026-09-02T00:00:00.000Z",
		};
		const statuses: BusinessSource[] = Array.from(
			{ length: 8 },
			(_, index) => ({
				...statement,
				id: `status-${index}`,
				content: "x".repeat(2000),
			})
		);
		const result = await recallWebsiteBusinessContext(
			{ ...recallInput, allowWrite: false },
			dependencies({
				recall: async () =>
					context([
						meaning,
						page,
						{ ...statuses[0]!, content: "Provider changed this status text" },
					]),
				readReplies: async () => statuses,
			})
		);
		expect(result.sources).toContainEqual(meaning);
		expect(result.sources).toContainEqual(page);
		expect(
			result.sources.find((source) => source.id === statuses[0]!.id)
		).toEqual(statuses[0]!);
		expect(
			result.sources.filter((source) => source.id.startsWith("status-"))
		).toHaveLength(7);
		expect(
			result.sources.reduce(
				(length, source) => length + source.content.length,
				0
			)
		).toBeLessThanOrEqual(16_000);
	});

	it("takes the website lock and rejects post-model scope changes before an outcome write", async () => {
		for (const current of [
			{
				domain: scope.domain,
				settings: { businessContextStartedAt: scope.startedAt },
			},
			{
				domain: "other.example",
				settings: { businessContextStartedAt: scope.startedAt },
			},
			{
				domain: scope.domain,
				settings: { businessContextStartedAt: "2026-09-05T11:00:00.000Z" },
			},
			undefined,
		]) {
			let locked = false;
			let committed = false;
			const database = {
				select: () => ({
					from: () => ({
						where: () => ({
							limit: () => ({
								for: async (strength: string) => {
									expect(strength).toBe("update");
									locked = true;
									return current ? [current] : [];
								},
							}),
						}),
					}),
				}),
			} as unknown as Parameters<typeof assertBusinessScopeCurrent>[1];
			const commit = async () => {
				await assertBusinessScopeCurrent(scope, database);
				committed = true;
			};
			if (
				current?.domain === scope.domain &&
				current.settings.businessContextStartedAt === scope.startedAt
			) {
				await commit();
				expect(committed).toBe(true);
			} else {
				await expect(commit()).rejects.toThrow("scope changed");
				expect(committed).toBe(false);
			}
			expect(locked).toBe(true);
		}
	});

	it("historical profile and recall never write and exclude pre-epoch and future raw replies", async () => {
		let writes = 0;
		const deps = dependencies({
			readReplies: async () => [
				statement,
				{ ...statement, id: "future", observedAt: "2026-09-06T00:00:00Z" },
				{ ...statement, id: "old-domain", observedAt: "2026-08-31T00:00:00Z" },
			],
			loadProfile: async (input) => {
				expect(input.allowRefresh).toBe(false);
				return context();
			},
			record: async () => {
				writes += 1;
				return { status: "saved", ids: [] };
			},
		});
		const shared = await loadWebsiteBusinessProfile(
			{ scope, asOf, allowRefresh: false },
			deps
		);
		const recalled = await recallWebsiteBusinessContext(
			{ ...recallInput, allowWrite: false },
			deps
		);
		expect(shared.sources).toEqual([statement]);
		expect(recalled.sources).toEqual([statement]);
		expect(writes).toBe(0);
	});
});

describe("saved organization business context", () => {
	const profile: OrganizationBusinessProfile = {
		content: "Report preparation starts a draft; it does not deliver a report.",
		origin: "team",
		sources: [],
		revision: 3,
		updatedAt: "2026-09-05T11:00:00.000Z",
		updatedBy: "example-editor",
		sourceWebsiteId: null,
	};
	const input = { scope, asOf, allowRefresh: false };

	it("keeps canonical replies ahead of extra public pages before selection", async () => {
		const pages = Array.from({ length: 4 }, (_, index) => ({
			...page,
			id: `page-${index}`,
			url: `https://example.com/${index || ""}`,
			content: "Public background. ".padEnd(4000, "."),
		}));
		const result = await loadWebsiteBusinessProfile(
			input,
			dependencies({
				loadProfile: async () => context(pages),
				readReplies: async () => [statement],
				readOrganization: async () => ({ profile, generation: null }),
			})
		);

		expect(result.sources).toContainEqual(statement);
		expect(result.sources[0]).toMatchObject({
			kind: "organization_profile",
			content: profile.content,
		});
		expect(result.sources[1]).toEqual(statement);
		expect(result.sources.filter((source) => source.kind === "website")).toEqual(
			pages.slice(0, 3)
		);
		expect(
			result.sources.reduce((total, source) => total + source.content.length, 0)
		).toBeLessThanOrEqual(16_000);
		expect(result.status).toBe("partial");
		expect(businessContextSchema.parse(result)).toEqual(result);
	});

	it("keeps the complete 12k saved profile and canonical correction ahead of a full homepage", async () => {
		const content = "A".repeat(4000) + "B".repeat(4000) + "C".repeat(4000);
		const result = await loadWebsiteBusinessProfile(
			input,
			dependencies({
				loadProfile: async () =>
					context([{ ...page, content: "P".repeat(4000) }]),
				readOrganization: async () => ({
					profile: { ...profile, content },
					generation: null,
				}),
			})
		);
		expect(result.sources.map((source) => source.kind)).toEqual([
			"organization_profile",
			"organization_profile",
			"organization_profile",
			"team_reply",
		]);
		expect(
			result.sources
				.slice(0, 3)
				.map((source) => source.content)
				.join("")
		).toBe(content);
		expect(result.sources).toContainEqual(statement);
		expect(result.sources.some((source) => source.id === page.id)).toBe(false);
		expect(
			result.sources.reduce(
				(length, source) => length + source.content.length,
				0
			)
		).toBe(12_000 + statement.content.length);
		expect(businessContextSchema.safeParse(result).success).toBe(true);
		expect(result.status).toBe("partial");
		expect(result.issues).toContain(
			"Context is bounded; additional source records were omitted."
		);
	});

	it.each([
		{ name: "deleted scope", current: null },
		{
			name: "organization transfer",
			current: { ...scope, organizationId: "other" },
		},
		{ name: "changed domain", current: { ...scope, domain: "other.example" } },
		{
			name: "new epoch",
			current: { ...scope, startedAt: "2026-09-05T11:00:00.000Z" },
		},
		{
			name: "failed lookup",
			current: new Error("Synthetic scope recheck unavailable"),
		},
	])("withholds all context and skips organization reading after reconciliation finds $name", async ({
		current,
	}) => {
		let checks = 0;
		let profileReads = 0;
		let replyReads = 0;
		let organizationReads = 0;
		let writes = 0;
		const result = await loadWebsiteBusinessProfile(
			input,
			dependencies({
				currentScope: async () => {
					checks += 1;
					if (checks === 1) {
						return scope;
					}
					if (current instanceof Error) {
						throw current;
					}
					return current;
				},
				loadProfile: async () => {
					profileReads += 1;
					return context([page]);
				},
				readReplies: async () => {
					replyReads += 1;
					return [statement];
				},
				readOrganization: async () => {
					organizationReads += 1;
					return { profile, generation: null };
				},
				record: async () => {
					writes += 1;
					return { status: "saved", ids: [] };
				},
			})
		);
		expect(checks).toBe(2);
		expect(profileReads).toBe(1);
		expect(replyReads).toBe(1);
		expect(organizationReads).toBe(0);
		expect(writes).toBe(0);
		expect(result.sources).toEqual([]);
		expect(result.status).toBe("unavailable");
		expect(result.issues.length).toBeGreaterThan(0);
	});

	it.each([
		"throws",
		"returns unavailable",
	])("keeps saved organization context and canonical replies when the public page loader %s", async (failure) => {
		let checks = 0;
		const reads: string[] = [];
		const result = await loadWebsiteBusinessProfile(
			input,
			dependencies({
				currentScope: async () => {
					checks += 1;
					return scope;
				},
				loadProfile: async () => {
					if (failure === "throws") {
						throw new Error("Synthetic public page unavailable");
					}
					return {
						...context(),
						status: "unavailable",
						issues: ["Synthetic public page unavailable"],
					};
				},
				readOrganization: async (organizationId) => {
					reads.push(organizationId);
					return { profile, generation: null };
				},
			})
		);
		expect(checks).toBe(3);
		expect(reads).toEqual([scope.organizationId]);
		expect(result.sources).toHaveLength(2);
		expect(result.sources[0]).toMatchObject({
			kind: "organization_profile",
			content: profile.content,
			origin: profile.origin,
			observedAt: profile.updatedAt,
		});
		expect(result.sources).toContainEqual(statement);
		expect(result.status).toBe("partial");
		expect(result.issues.length).toBeGreaterThan(0);
	});

	it.each([
		"team",
		"website",
		"mixed",
	] as const)("preserves all 12k saved characters and %s provenance through the loader", async (origin) => {
		const content =
			"A".repeat(3999) + "1" + "B".repeat(3999) + "2" + "C".repeat(3999) + "3";
		const references = Array.from({ length: 8 }, (_, index) => ({
			url: `https://example.com/docs/report-${index}?source=business-profile`,
			title: `Report definition ${index + 1}`,
		}));
		const reads: string[] = [];
		let writes = 0;
		const result = await loadWebsiteBusinessProfile(
			input,
			dependencies({
				readOrganization: async (organizationId) => {
					reads.push(organizationId);
					return {
						profile: { ...profile, content, origin, sources: references },
						generation: null,
					};
				},
				record: async () => {
					writes += 1;
					return { status: "saved", ids: [] };
				},
			})
		);
		const chunks = result.sources.filter(
			(source) => source.kind === "organization_profile"
		);
		expect(reads).toEqual([scope.organizationId]);
		expect(writes).toBe(0);
		expect(businessContextSchema.parse(result)).toEqual(result);
		expect(chunks.map((source) => source.content.length)).toEqual([
			4000, 4000, 4000,
		]);
		expect(chunks.map((source) => source.content).join("")).toBe(content);
		expect(new Set(chunks.map((source) => source.id)).size).toBe(3);
		expect(chunks[0]?.references).toEqual(references);
		expect(chunks.slice(1).map((source) => source.references)).toEqual([
			undefined,
			undefined,
		]);
		for (const source of chunks) {
			expect(source).toMatchObject({
				origin,
				observedAt: profile.updatedAt,
				profileVersion: {
					revision: profile.revision,
					updatedAt: profile.updatedAt,
				},
			});
		}
		expect(result.sources).toContainEqual(page);
		expect(result.sources).toContainEqual(statement);
	});


	it("supplies team-only priorities and definitions before bounded public background", async () => {
		const teamContext = {
			priority: "Prioritize activation",
			successDefinition: "Activation requires a production event",
			exclusions: "Exclude employee traffic",
		};
		for (const content of ["", "Public background ".repeat(650)]) {
			const result = await loadWebsiteBusinessProfile(input, dependencies({
				readOrganization: async () => ({ profile: { ...profile, content, origin: "mixed", teamContext }, generation: null }),
			}));
			expect(businessContextSchema.parse(result)).toEqual(result);
			const sources = result.sources.filter((source) => source.kind === "organization_profile");
			expect(sources[0]).toMatchObject({ origin: "team" });
			expect(sources[0]?.content).toContain(teamContext.successDefinition);
			expect(sources[0]?.content).toContain(teamContext.exclusions);
			for (const source of sources) {
				expect(source.profileVersion).toEqual({ revision: profile.revision, updatedAt: profile.updatedAt });
			}
			if (content) expect(sources[1]?.origin).toBe("mixed");
		}
	});

	it("retains the maximum brief, all team fields and a correction with profile revisions", async () => {
		const content = "B".repeat(11990) + " END BRIEF";
		const teamContext = {
			priority: "P".repeat(2000),
			successDefinition: "D".repeat(2000),
			exclusions: "E".repeat(2000),
		};
		const correction = { ...statement, content: "Correction: ".padEnd(4000, "R") };
		const result = await loadWebsiteBusinessProfile(input, dependencies({
			readOrganization: async () => ({ profile: { ...profile, content, origin: "mixed", teamContext }, generation: null }),
			readReplies: async () => [correction],
			loadProfile: async () => context([{ ...page, content: "Public page ".padEnd(4000, "W") }]),
		}));
		const sources = result.sources.filter((source) => source.kind === "organization_profile");
		const supplied = sources.map((source) => source.content).join("");
		expect(sources).toHaveLength(5);
		expect(sources.map((source) => source.origin)).toEqual(["team", "team", "mixed", "mixed", "mixed"]);
		expect(supplied).toContain(content);
		for (const value of Object.values(teamContext)) expect(supplied).toContain(value);
		for (const source of sources) {
			expect(source.profileVersion).toEqual({ revision: profile.revision, updatedAt: profile.updatedAt });
		}
		expect(result.sources).toContainEqual(correction);
		expect(result.sources.some((source) => source.kind === "website")).toBe(false);
		expect(result.sources.reduce((total, source) => total + source.content.length, 0)).toBeLessThanOrEqual(24_000);
		expect(businessContextSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
	});

	it.each([
		null,
		profile,
	])("does not consume a ready unsaved draft alongside saved profile %j", async (saved) => {
		const draftContent = "Unsaved proposal: report preparation means delivery.";
		const result = await loadWebsiteBusinessProfile(
			input,
			dependencies({
				readOrganization: async () => ({
					profile: saved,
					generation: {
						id: "example-generation",
						websiteId: scope.websiteId,
						domain: scope.domain,
						requestedBy: "example-editor",
						requestedAt: asOf.toISOString(),
						baseRevision: saved?.revision ?? 0,
						status: "ready",
						draft: { content: draftContent, sources: [] },
						error: null,
					},
				}),
			})
		);
		expect(
			result.sources
				.filter((source) => source.kind === "organization_profile")
				.map((source) => source.content)
		).toEqual(saved ? [saved.content] : []);
		expect(
			result.sources.some((source) => source.content.includes(draftContent))
		).toBe(false);
		expect(result.sources).toContainEqual(page);
		expect(result.sources).toContainEqual(statement);
	});

	it.each([
		{ updatedAt: "2026-09-05T12:00:00.001Z", included: false },
		{ updatedAt: "2026-09-05T12:00:00.000Z", included: true },
	])("respects the historical cutoff for saved revision $updatedAt", async ({
		updatedAt,
		included,
	}) => {
		const result = await loadWebsiteBusinessProfile(
			input,
			dependencies({
				readOrganization: async () => ({
					profile: { ...profile, updatedAt },
					generation: null,
				}),
			})
		);
		expect(
			result.sources.some((source) => source.kind === "organization_profile")
		).toBe(included);
		expect(result.sources).toContainEqual(page);
		expect(result.sources).toContainEqual(statement);
	});

	it("preserves the homepage and canonical team reply when organization reading fails", async () => {
		const result = await loadWebsiteBusinessProfile(
			input,
			dependencies({
				readOrganization: async () => {
					throw new Error("Synthetic organization context unavailable");
				},
			})
		);
		expect(result.status).toBe("partial");
		expect(result.sources).toHaveLength(2);
		expect(result.sources).toContainEqual(page);
		expect(result.sources).toContainEqual(statement);
		expect(result.issues.length).toBeGreaterThan(0);
	});

	it.each([
		null,
		{ ...scope, organizationId: "other" },
		{ ...scope, domain: "other.example" },
		{ ...scope, startedAt: "2026-09-05T11:00:00.000Z" },
		new Error("Synthetic final scope lookup unavailable"),
	])("withholds private context when the scope changes during organization retrieval: %j", async (changed) => {
		let loaded = false;
		const result = await loadWebsiteBusinessProfile(
			input,
			dependencies({
				currentScope: async () => {
					if (!loaded) return scope;
					if (changed instanceof Error) throw changed;
					return changed;
				},
				readOrganization: async () => {
					loaded = true;
					return { profile, generation: null };
				},
			})
		);
		expect(loaded).toBe(true);
		expect(result.status).toBe("unavailable");
		expect(result.sources).toHaveLength(0);
	});
});
