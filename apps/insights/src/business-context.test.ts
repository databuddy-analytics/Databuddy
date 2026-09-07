import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import type {
	BusinessContext,
	BusinessSource,
} from "@databuddy/ai/lib/business-context";
import {
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
				result.sources.some((source) => source.kind === "team_reply")
			).toBe(true);
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
