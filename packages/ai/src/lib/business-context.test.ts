import "@databuddy/db/test-env";
import { afterAll, describe, expect, it } from "bun:test";
import Supermemory from "supermemory";
import {
	businessContainerTag,
	loadBusinessProfile,
	mergeBusinessContext,
	prioritizeBusinessContext,
	recallBusinessContext,
	recordBusinessReplies,
	type BusinessSource,
	type BusinessContext,
} from "./business-context";

const scope = {
	organizationId: "org-synthetic",
	websiteId: "site-synthetic",
	domain: "reports.example.com",
};
const asOf = new Date("2026-09-07T08:00:00Z");
const reply: BusinessSource = {
	id: "reply-1",
	kind: "team_reply",
	content: "report_exported means a file was prepared, before download.",
	observedAt: "2026-08-01T08:00:00Z",
	subjectKey: "custom_event:report_exported",
	author: "Test teammate",
};
const page: BusinessSource = {
	id: "page-1",
	kind: "website",
	content: "Report preparation software for operations teams.",
	url: "https://reports.example.com/",
	observedAt: "2026-09-06T08:00:00Z",
};
function document(source: BusinessSource, overrides = {}) {
	const { content, id, ...metadata } = source;
	return {
		id: `doc-${id}`,
		content,
		metadata: {
			version: 1,
			...scope,
			...metadata,
			sourceId: id,
			...(source.kind === "team_reply" ? { originalText: content } : {}),
			...overrides,
		},
	};
}
function provider(
	respond: (
		path: string,
		body: Record<string, unknown>
	) => Response | Promise<Response>
) {
	return new Supermemory({
		apiKey: "synthetic-only",
		maxRetries: 0,
		fetch: async (input, init) => {
			const request = new Request(input, init);
			const body = request.method === "GET" ? {} : await request.json();
			return respond(new URL(request.url).pathname, body);
		},
	});
}
function json(value: unknown) {
	return Response.json(value);
}

describe("scoped business context through the native Supermemory transport", () => {
	it("loads durable team statements and a sourced profile without personal containers", async () => {
		const requests: Record<string, unknown>[] = [];
		const client = provider((path, body) => {
			requests.push(body);
			expect(path).toBe("/v3/documents/list");
			return json({
				memories: [document(page)],
				pagination: { currentPage: 1, totalItems: 2, totalPages: 1 },
			});
		});
		const result = await loadBusinessProfile({
			scope,
			asOf,
			client,
			allowRefresh: false,
		});
		expect(result.sources).toEqual([page]);
		expect(result.issues).toContain(
			"Website context is limited to the listed page excerpts."
		);
		expect(requests[0]?.containerTags).toEqual([businessContainerTag(scope)]);
		expect(requests[0]?.includeContent).toBe(true);
		expect(requests[0]?.filters).toEqual({
			AND: [
				...Object.entries(scope).map(([key, value]) => ({ key, value })),
				{ key: "kind", value: "website" },
			],
		});
	});
	it("rejects foreign, future, expired and ungrounded sources before model input", async () => {
		const records = [
			document(reply, { organizationId: "other-org" }),
			document(reply, { websiteId: "sibling" }),
			document(reply, { domain: "old.example.com" }),
			document(reply, { observedAt: "2026-09-08T00:00:00Z" }),
			document(reply, { observedAt: "2026-09-07T00:00:00+99:99" }),
			document(reply, { expiresAt: "2026-09-07T00:00:00+99:99" }),
			document(reply, { expiresAt: "2026-09-01T00:00:00Z" }),
			document(page, { observedAt: "2026-08-01T00:00:00Z" }),
			document(page, { url: "https://reports.example.com.attacker.test/" }),
			{
				...document(reply, { originalText: undefined }),
				content: null,
				summary: reply.content,
			},
		];
		const client = provider(() =>
			json({ results: records, timing: 1, total: records.length })
		);
		const result = await recallBusinessContext({
			scope,
			asOf,
			client,
			query: "report_exported",
		});
		expect(result.sources).toEqual([]);
		expect(result.status).toBe("partial");
		expect(result.issues.length).toBeGreaterThan(0);
	});
	it("recalls the full original text rather than an inferred provider summary or chunk", async () => {
		const client = provider((path, body) => {
			expect(path).toBe("/v3/search");
			expect(body.includeFullDocs).toBe(true);
			expect(body.rewriteQuery).toBe(false);
			return json({
				results: [
					{
						...document(reply),
						summary: "The user completed a download",
						chunks: [{ content: "User completed a download" }],
					},
				],
				timing: 1,
				total: 1,
			});
		});
		expect(
			(
				await recallBusinessContext({
					scope,
					asOf,
					client,
					query: "report_exported",
				})
			).sources
		).toEqual([reply]);
	});
	it("distinguishes provider failure from an empty successful search without retries", async () => {
		let attempts = 0;
		const client = provider(() => {
			attempts++;
			return json({ error: "unavailable" });
		});
		expect(
			(
				await recallBusinessContext({
					scope,
					asOf,
					client,
					query: "report_exported",
				})
			).status
		).toBe("unavailable");
		expect(attempts).toBe(1);
	});
	it("refuses an uninitialized write before reaching the provider", async () => {
		let requests = 0;
		const client = provider(() => {
			requests++;
			return json({});
		});
		expect(
			await recordBusinessReplies({ scope, replies: [reply], client })
		).toEqual({ status: "unavailable", ids: [] });
		expect(requests).toBe(0);
	});
	it.skipIf(process.env.BUSINESS_CONTEXT_INTEGRATION_TESTS !== "true")(
		"does not claim a partial batch failure was saved; retry IDs stay stable under a native website lock",
		async () => {
			const { db, eq, sql } = await import("@databuddy/db");
			const { organization, websites } = await import("@databuddy/db/schema");
			const { getWebsiteBusinessScope } = await import(
				"@databuddy/services/business-memory"
			);
			const organizationId = `synthetic-${crypto.randomUUID()}`;
			const websiteId = `synthetic-${crypto.randomUUID()}`;
			await db.insert(organization).values({
				id: organizationId,
				name: "Synthetic organization",
				slug: organizationId,
				createdAt: new Date(),
			});
			await db
				.insert(websites)
				.values({ id: websiteId, organizationId, domain: scope.domain });
			const initialized = await getWebsiteBusinessScope(
				{ websiteId, organizationId },
				{ initialize: true }
			);
			if (!initialized) {
				throw new Error("Synthetic scope not initialized");
			}
			try {
				const bodies: Record<string, unknown>[] = [];
				const client = provider((path, body) => {
					expect(path).toBe("/v3/documents/batch");
					bodies.push(body);
					return json(
						bodies.length === 1
							? {
									failed: 1,
									success: 0,
									results: [{ id: "", status: "error" }],
								}
							: {
									failed: 0,
									success: 1,
									results: [{ id: "provider-doc", status: "queued" }],
								}
					);
				});
				const args = {
					scope: initialized,
					replies: [{ ...reply, observedAt: new Date().toISOString() }],
					client,
				};
				expect(await recordBusinessReplies(args)).toEqual({
					status: "unavailable",
					ids: [],
				});
				expect(await recordBusinessReplies(args)).toEqual({
					status: "saved",
					ids: [reply.id],
				});
				expect(bodies[0]).toEqual(bodies[1]);
				expect(bodies[0]?.containerTag).toBe(businessContainerTag(initialized));
			} finally {
				await db.delete(websites).where(eq(websites.id, websiteId));
				await db.execute(
					sql`DELETE FROM organization WHERE id=${organizationId}`
				);
			}
		}
	);
	it("cannot promote a public page into the authenticated reply index", () => {
		expect(() => recordBusinessReplies({ scope, replies: [page] })).toThrow(
			"authenticated team replies"
		);
	});
	it("keeps literal team text when a provider extracts or changes document content", async () => {
		const original = "https://reports.example.com/docs";
		const client = provider(() =>
			json({
				results: [
					{
						...document({ ...reply, content: original }),
						type: "webpage",
						content: "This event proves a completed payment.",
					},
				],
				timing: 1,
				total: 1,
			})
		);
		const result = await recallBusinessContext({
			scope,
			asOf,
			client,
			query: "report_exported",
		});
		expect(result.sources[0]?.content).toBe(original);
		expect(result.sources[0]?.content).not.toContain("completed payment");
		const ungrounded = provider(() =>
			json({
				results: [document(reply, { originalText: undefined })],
				timing: 1,
				total: 1,
			})
		);
		expect(
			(
				await recallBusinessContext({
					scope,
					asOf,
					client: ungrounded,
					query: "report_exported",
				})
			).sources
		).toEqual([]);
	});
	it("preserves an older exact correction and homepage ahead of unrelated recent conversation", () => {
		const shared = {
			capturedAt: asOf.toISOString(),
			status: "ready" as const,
			issues: [],
			sources: [
				page,
				...Array.from({ length: 8 }, (_, i) => ({
					...reply,
					id: `unrelated-${i}`,
					observedAt: "2026-09-06T00:00:00Z",
					content: "x".repeat(2000),
				})),
			],
		};
		const relevant = { ...shared, sources: [reply] };
		const result = mergeBusinessContext(shared, relevant);
		expect(result.sources.map((s) => s.id)).toContain(reply.id);
		expect(result.sources.map((s) => s.id)).toContain(page.id);
		expect(
			result.sources.reduce((n, s) => n + s.content.length, 0)
		).toBeLessThanOrEqual(16_000);
		expect(result.sources.length).toBeLessThan(shared.sources.length + 1);
		const canonical = {
			...relevant,
			sources: [{ ...reply, content: "Canonical PostgreSQL reply" }],
		};
		expect(mergeBusinessContext(relevant, canonical).sources[0]?.content).toBe(
			"Canonical PostgreSQL reply"
		);
	});
	it("isolates ambiguous identifier boundaries and canonicalizes only the website alias", () => {
		expect(
			businessContainerTag({ ...scope, domain: "www.reports.example.com" })
		).toBe(businessContainerTag(scope));
		expect(
			businessContainerTag({ ...scope, organizationId: "a_b", websiteId: "c" })
		).not.toBe(
			businessContainerTag({ ...scope, organizationId: "a", websiteId: "b_c" })
		);
		expect(() =>
			businessContainerTag({
				...scope,
				domain: "reports.example.com@other.test",
			})
		).toThrow();
	});
	it("deduplicates stable sources and reports context truncation", () => {
		const source = {
			capturedAt: asOf.toISOString(),
			status: "ready" as const,
			issues: [],
			sources: [reply, page],
		};
		expect(mergeBusinessContext(source, source).sources).toHaveLength(2);
		const many = {
			...source,
			sources: Array.from({ length: 20 }, (_, i) => ({
				...reply,
				id: String(i),
				content: "x".repeat(4000),
			})),
		};
		const result = mergeBusinessContext(many);
		expect(
			result.sources.reduce((total, item) => total + item.content.length, 0)
		).toBeLessThanOrEqual(16_000);
		expect(result.status).toBe("partial");
	});
});

afterAll(async () => {
	if (process.env.BUSINESS_CONTEXT_INTEGRATION_TESTS === "true") {
		const { shutdownPostgres } = await import("@databuddy/db");
		await shutdownPostgres();
	}
});

describe("optional business context ranking", () => {
	const source = (id: string, size = 4000): BusinessSource => ({
		...page,
		id,
		url: `https://reports.example.com/${id}`,
		content: id.padEnd(size, "."),
	});
	const input: BusinessContext = {
		capturedAt: asOf.toISOString(),
		status: "ready",
		issues: [],
		sources: [
			page,
			reply,
			source("a"),
			source("b"),
			source("c"),
			source("decisive"),
		],
	};
	it("recovers an omitted page without changing sources, pins, or native limits", async () => {
		const before = structuredClone(input);
		const baseline = mergeBusinessContext(input);
		expect(baseline.sources.some((s) => s.id === "decisive")).toBe(false);
		const ranked = await prioritizeBusinessContext(
			[input],
			async ({ pages }) =>
				new Map(pages.map((s) => [s.id, s.id === "decisive" ? 1 : 0]))
		);
		expect(ranked.sources.some((s) => s.id === "decisive")).toBe(true);
		expect(ranked.sources).toContain(page);
		expect(ranked.sources).toContain(reply);
		expect(ranked.sources.every((s) => input.sources.includes(s))).toBe(true);
		expect(
			ranked.sources.reduce((n, s) => n + s.content.length, 0)
		).toBeLessThanOrEqual(16_000);
		expect(input).toEqual(before);
	});
	it("does not call ranking when native context fits", async () => {
		const small = { ...input, sources: input.sources.slice(0, 3) };
		const actual = await prioritizeBusinessContext([small], () => {
			throw new Error("Unnecessary ranking");
		});
		expect(actual).toEqual(mergeBusinessContext(small));
	});
	it("keeps the exact native order for ties or invalid scores", async () => {
		for (const invalid of [
			null,
			new Map<string, number>(),
			new Map([["a", Number.NaN]]),
		]) {
			expect(
				await prioritizeBusinessContext([input], async () => invalid)
			).toEqual(mergeBusinessContext(input));
		}
		expect(
			await prioritizeBusinessContext(
				[input],
				async ({ pages }) => new Map(pages.map((s) => [s.id, 0.5]))
			)
		).toEqual(mergeBusinessContext(input));
	});
	it("keeps the original fallback homepage and later duplicate content", async () => {
		const first = source("first");
		const newer = {
			...source("decisive"),
			content: "Canonical newer page".padEnd(4000, "."),
		};
		const contexts: BusinessContext[] = [
			{ ...input, sources: [source("decisive")] },
			{
				...input,
				sources: [first, source("a"), source("b"), source("c"), newer],
			},
		];
		const ranked = await prioritizeBusinessContext(
			contexts,
			async ({ pages }) => {
				expect(pages).not.toContain(first);
				return new Map(pages.map((s) => [s.id, s.id === "decisive" ? 1 : 0]));
			}
		);
		expect(ranked.sources[0]).toBe(first);
		expect(ranked.sources).toContain(newer);
	});
	it("falls back when larger ranked pages would displace a protected reply", async () => {
		const lateReply = { ...reply, content: "Correction".padEnd(4000, ".") };
		const crowded = {
			...input,
			sources: [
				source("home"),
				source("small", 1000),
				source("medium", 2000),
				source("tiny", 1000),
				lateReply,
				source("large"),
				source("last"),
				source("extra"),
			],
		};
		const result = await prioritizeBusinessContext(
			[crowded],
			async ({ pages }) =>
				new Map(
					pages.map((s) => [
						s.id,
						["large", "last", "extra"].includes(s.id) ? 1 : 0,
					])
				)
		);
		expect(result.sources).toContain(lateReply);
		expect(result).toEqual(mergeBusinessContext(crowded));
	});
});
