import { describe, expect, it } from "bun:test";
import Supermemory from "supermemory";
import {
	businessContainerTag,
	loadBusinessProfile,
	mergeBusinessContext,
	recallBusinessContext,
	recordBusinessReplies,
	type BusinessSource,
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
	it("does not claim a partial batch failure was saved; retry IDs stay stable", async () => {
		const bodies: Record<string, unknown>[] = [];
		const client = provider((path, body) => {
			expect(path).toBe("/v3/documents/batch");
			bodies.push(body);
			return json(
				bodies.length === 1
					? { failed: 1, success: 0, results: [{ id: "", status: "error" }] }
					: {
							failed: 0,
							success: 1,
							results: [{ id: "provider-doc", status: "queued" }],
						}
			);
		});
		const args = { scope, replies: [reply], client };
		expect(await recordBusinessReplies(args)).toEqual({
			status: "unavailable",
			ids: [],
		});
		expect(await recordBusinessReplies(args)).toEqual({
			status: "saved",
			ids: [reply.id],
		});
		expect(bodies[0]).toEqual(bodies[1]);
		expect(bodies[0]?.containerTag).toBe(businessContainerTag(scope));
	});
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
		).toBeLessThanOrEqual(16000);
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
