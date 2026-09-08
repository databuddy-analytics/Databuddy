import * as profiles from "@databuddy/services/business-profile";
import { afterAll, describe, expect, it, spyOn } from "bun:test";
import Supermemory from "supermemory";
import {
	businessContainerTag,
	mergeBusinessContext,
 profileBusinessContext,
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
        const client = provider(() => { requests++; return json({}); });
        expect(await recordBusinessReplies({ scope, replies: [reply], client })).toEqual({ status: "unavailable", ids: [] });
        expect(requests).toBe(0);
    });
    it.skipIf(process.env.BUSINESS_MEMORY_INTEGRATION_TESTS !== "true")("does not claim a partial batch failure was saved; retry IDs stay stable under a native website lock", async () => {
        const url = new URL(process.env.DATABASE_URL ?? "");
        if (url.hostname !== "127.0.0.1" || url.port !== "16543" || url.pathname !== "/business_memory_synthetic") throw new Error("Use the dedicated synthetic business-memory database");
        const { db, eq, sql } = await import("@databuddy/db");
        const { websites } = await import("@databuddy/db/schema");
        const { getWebsiteBusinessScope } = await import("@databuddy/services/business-memory");
        const organizationId = `synthetic-${crypto.randomUUID()}`;
        const websiteId = `synthetic-${crypto.randomUUID()}`;
        await db.execute(sql`INSERT INTO organization(id) VALUES (${organizationId})`);
        await db.insert(websites).values({ id: websiteId, organizationId, domain: scope.domain });
        const initialized = await getWebsiteBusinessScope({ websiteId, organizationId }, { initialize: true });
        if (!initialized) throw new Error("Synthetic scope not initialized");
        try {
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
		const args = { scope: initialized, replies: [{ ...reply, observedAt: new Date().toISOString() }], client };
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
            await db.execute(sql`DELETE FROM organization WHERE id=${organizationId}`);
        }
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
		).toBeLessThanOrEqual(64000);
		expect(result.sources.length).toBe(shared.sources.length + 1);
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
		).toBeLessThanOrEqual(64_000);
		expect(result.status).toBe("partial");
	});
});

afterAll(async () => {
    if (process.env.BUSINESS_MEMORY_INTEGRATION_TESTS === "true") {
        const { shutdownPostgres } = await import("@databuddy/db");
        await shutdownPostgres();
    }
});

describe("canonical profile evidence",()=>{
 it("drops the whole combined claim when its qualifying source expires",()=>{
  const terms={...page,id:"terms",content:"Self-service plans are available.",url:"https://reports.example.com/pricing"};
  const restriction={...page,id:"restriction",content:"Continuous investigations require an invitation.",url:"https://reports.example.com/access",expiresAt:asOf.toISOString()};
  const brief={facts:[{topic:"business_model" as const,claim:"Core plans are self-service; continuous investigations require an invitation.",evidence:[{sourceId:terms.id,quote:terms.content},{sourceId:restriction.id,quote:restriction.content}]}],unknowns:[]};
  const context=profileBusinessContext({capturedAt:asOf.toISOString(),sources:[terms,restriction],brief,issues:[]},asOf);
  expect(context.sources).toEqual([terms]);
  expect(context.brief).toBeUndefined();
  expect(context.status).toBe("partial");
  expect(context.issues).toContain("Brief claims with missing or changed supporting passages were omitted.");
 });
 it("keeps a supported explanation with all original citations and refuses rewritten evidence",()=>{
  const offering={...page,content:"Reports for small teams."};
  const terms={...page,id:"terms",content:"Access requires an invitation.",url:"https://reports.example.com/pricing"};
  const fact={topic:"offering" as const,claim:"Small teams can use the reporting product after receiving an invitation.",evidence:[{sourceId:offering.id,quote:offering.content},{sourceId:terms.id,quote:terms.content}]};
  const profile={capturedAt:asOf.toISOString(),sources:[offering,terms],brief:{facts:[fact],unknowns:[]},issues:[]};
  const context=profileBusinessContext(profile,asOf);
  expect(context.brief?.facts).toEqual([fact]);
  expect(context.sources).toEqual([offering,terms]);
  const unsupported={...fact,evidence:[fact.evidence[0]!,{sourceId:terms.id,quote:"Access is self-service."}]};
  expect(profileBusinessContext({...profile,brief:{...profile.brief,facts:[unsupported]}},asOf).brief).toBeUndefined();
 });
 it("keeps decision-changing qualifications beyond a compact brief and drops expired quotations",()=>{
  const full={...page,content:"General product description. ".repeat(220)+"Includes a daily allowance; this is not a hard usage cap."};
  const profile={capturedAt:asOf.toISOString(),sources:[full],brief:{facts:[{topic:"business_model" as const,claim:"A daily allowance is included, not a hard cap.",evidence:[{sourceId:full.id,quote:"Includes a daily allowance; this is not a hard usage cap."}]}],unknowns:[]},issues:[]};
  expect(profileBusinessContext(profile,asOf).sources[0]?.content).toBe(full.content);
  const expired=profileBusinessContext({...profile,sources:[{...full,expiresAt:asOf.toISOString()}]},asOf);
  expect(expired.sources).toEqual([]);expect(expired.brief).toBeUndefined();
 });
 it("uses a recalled brief only to locate current PG evidence, ignoring provider prose and obsolete revisions",async()=>{
  const bound={...scope,startedAt:"2026-08-01T00:00:00.000Z"};
  const profile={capturedAt:asOf.toISOString(),sources:[page],brief:null,issues:[]};
  const read=spyOn(profiles,"loadBusinessProfileRecord").mockResolvedValue({...bound,revision:2,indexedRevision:null,updatedAt:asOf,refreshAfter:asOf,profile});
  try{
   const client=provider(()=>json({results:[{content:"Invented customer priority",metadata:{...bound,kind:"business_profile",revision:1}}],timing:1,total:1}));
   const result=await recallBusinessContext({scope:bound,asOf,client,query:"business offering"});
   expect(result.sources).toEqual([page]);expect(read).toHaveBeenCalledTimes(1);
   read.mockClear();
   const foreign=provider(()=>json({results:[{metadata:{...bound,organizationId:"foreign-org",kind:"business_profile",revision:2}}],timing:1,total:1}));
   expect((await recallBusinessContext({scope:bound,asOf,client:foreign,query:"business offering"})).sources).toEqual([]);
   expect(read).not.toHaveBeenCalled();
  }finally{read.mockRestore();}
 });
});
