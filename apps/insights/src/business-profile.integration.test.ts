import { randomUUID } from "node:crypto";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from "bun:test";
import { db, eq, shutdownPostgres } from "@databuddy/db";
import { organization, websites } from "@databuddy/db/schema";
import {
	loadBusinessProfileRecord,
	saveBusinessProfileRecord,
} from "@databuddy/services/business-profile";
import * as memory from "@databuddy/services/business-memory";
import type { BusinessProfile } from "@databuddy/shared/business-context";
import type { WebsitePageResult } from "@databuddy/ai/tools/scrape-page";
import { MockLanguageModelV3 } from "ai/test";
import {
	loadDurableBusinessProfile,
 compileBusinessBrief,
	rememberBusinessPages,
} from "./business-profile";

// Dedicated opt-in: never use the repository's default DATABASE_URL.
const connection = process.env.BUSINESS_PROFILE_TEST_DATABASE_URL;
const integration = connection ? describe : describe.skip;
type Page = Extract<WebsitePageResult, { success: true }>;

function page(
	path = "/",
	content = "Reports for small teams. Invitations are required."
): Page {
	const url = new URL(path, "https://reports.example.com").href;
	return {
		success: true,
		url,
		requestedUrl: url,
		finalUrl: url,
		fetchedAt: new Date().toISOString(),
		content,
		internalLinks: ["/pricing"],
		title: null,
		description: null,
		statusCode: 200,
	};
}

function model(quote?: string) {
	return new MockLanguageModelV3({
		doGenerate: async (input) => {
			expect(input.responseFormat?.type).toBe("json");
			const user = input.prompt.find((message) => message.role === "user");
			const text = user?.content.find((part) => part.type === "text");
			if (!text) throw new Error("Expected a structured-output source prompt");
			const prompt: { sources?: BusinessProfile["sources"] } = JSON.parse(
				text.text
			);
			const source = prompt.sources?.at(-1);
			const output = source
				? {
						facts: [
							{
								topic: "offering",
								sourceId: source.id,
								quote: quote ?? source.content,
							},
						],
						unknowns: [],
					}
				: { paths: ["/pricing"] };
			return {
				content: [{ type: "text", text: JSON.stringify(output) }],
				finishReason: { unified: "stop", raw: undefined },
				usage: {
					inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
					outputTokens: { total: 1, text: 1, reasoning: 0 },
				},
				warnings: [],
			};
		},
	});
}

integration(
	"business profile flow with native PostgreSQL and SDK structured output",
	() => {
		let scope: Parameters<typeof loadBusinessProfileRecord>[0];
		let previousUrl: string | undefined;
		let previousKey: string | undefined;
		let previousPoolMax: string | undefined;
		let native: ReturnType<typeof memory.getMemoryClient>;
		let provider: ReturnType<typeof spyOn<typeof memory, "getMemoryClient">>;
		let transport: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
		const readPage = mock(async (input: { path?: string }) => page(input.path));

		beforeAll(() => {
			const url = new URL(connection ?? "");
			if (
				!["127.0.0.1", "localhost"].includes(url.hostname) || !["/business_profile_eval", "/databuddy_test"].includes(url.pathname)
			) {
				throw new Error(
					"Use an explicitly isolated loopback business_profile_eval or databuddy_test database"
				);
			}
			previousUrl = process.env.DATABASE_URL;
			previousKey = process.env.SUPERMEMORY_API_KEY;
			previousPoolMax = process.env.DB_POOL_MAX;
			process.env.DATABASE_URL = url.toString();
			// Projection reads must reuse the transaction's one available connection.
			process.env.DB_POOL_MAX = "1";
			process.env.SUPERMEMORY_API_KEY = "synthetic-transport-only";
			transport = spyOn(globalThis, "fetch").mockRejectedValue(
				new Error("Unexpected external request")
			);
			native =
				memory.getMemoryClient()?.withOptions({
					apiKey: "synthetic-transport-only",
					fetch: transport,
				}) ?? null;
			provider = spyOn(memory, "getMemoryClient").mockReturnValue(null);
		});
		beforeEach(async () => {
			scope = {
				organizationId: `synthetic-flow-${randomUUID()}`,
				websiteId: `synthetic-flow-${randomUUID()}`,
				domain: "reports.example.com",
				startedAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
			};
			await db.insert(organization).values({
				id: scope.organizationId,
				name: "Synthetic profile flow",
				createdAt: new Date(),
			});
			await db.insert(websites).values({
				id: scope.websiteId,
				organizationId: scope.organizationId,
				domain: scope.domain,
				settings: { businessContextStartedAt: scope.startedAt },
			});
			readPage.mockReset();
			readPage.mockImplementation(async (input) => page(input.path));
			provider.mockReturnValue(null);
			transport.mockClear();
			transport.mockRejectedValue(new Error("Unexpected external request"));
		});
		afterEach(async () => {
			await db
				.delete(organization)
				.where(eq(organization.id, scope.organizationId));
		});
		afterAll(async () => {
			provider?.mockRestore();
			transport?.mockRestore();
			await shutdownPostgres();
			if (previousUrl === undefined)
				Reflect.deleteProperty(process.env, "DATABASE_URL");
			else process.env.DATABASE_URL = previousUrl;
			if (previousKey === undefined)
				Reflect.deleteProperty(process.env, "SUPERMEMORY_API_KEY");
			else process.env.SUPERMEMORY_API_KEY = previousKey;
			if (previousPoolMax === undefined)
				Reflect.deleteProperty(process.env, "DB_POOL_MAX");
			else process.env.DB_POOL_MAX = previousPoolMax;
		});

		function load(injected = model()) {
			return loadDurableBusinessProfile(
				{ scope, asOf: new Date(), allowRefresh: true },
				{
					model: injected,
					readPage,
					discoverPages: async () => ({ paths: [] }),
				}
			);
		}
		async function stored() {
			const record = await loadBusinessProfileRecord(scope, new Date());
			if (!record) throw new Error("Expected a durable profile");
			return record;
		}

		it("cold selection and compilation take two model calls; warm reads use only PostgreSQL", async () => {
			const coldModel = model();
			const cold = await load(coldModel);
			expect(coldModel.doGenerateCalls).toHaveLength(2);
			expect(readPage).toHaveBeenCalledTimes(2);
			expect(cold.sources.map((source) => source.url).sort()).toEqual([
				"https://reports.example.com/",
				"https://reports.example.com/pricing",
			]);
			expect(
				cold.sources.every((source) => source.content === page().content)
			).toBe(true);
			const before = await stored();
			expect(before.profile.brief).not.toBeNull();
			readPage.mockClear();
			const warmModel = model();
			const warm = await load(warmModel);
			expect(warm.sources).toEqual(cold.sources);
			expect(warmModel.doGenerateCalls).toHaveLength(0);
			expect(readPage).not.toHaveBeenCalled();
			expect(transport).not.toHaveBeenCalled();
			expect((await stored()).revision).toBe(before.revision);
		});
        it("serves the previous usable brief while another worker recompiles",async()=>{
            await load();const original=await stored();
            await saveBusinessProfileRecord(scope,original.profile,{expectedRevision:original.revision,refreshAfter:new Date(0)});
            let release=()=>{};let entered=()=>{};
            const gate=new Promise<void>(resolve=>{release=resolve;});
            const started=new Promise<void>(resolve=>{entered=resolve;});
            const refreshModel=model();const generate=refreshModel.doGenerate;
            refreshModel.doGenerate=async(input)=>{entered();await gate;return generate(input);};
            const pending=load(refreshModel);
            try{await started;const concurrent=await load();expect(concurrent.brief).toEqual(original.profile.brief);expect(concurrent.sources).toEqual(original.profile.sources);}
            finally{release();await pending;}
        });
        it("bounds the compiler's original source input without truncating individual qualifications",async()=>{
            const sources=Array.from({length:8},(_,i)=>({id:`large-${i}`,kind:"website" as const,url:`https://reports.example.com/${i}`,content:"Original business context. ".repeat(500).slice(0,12000),observedAt:new Date().toISOString()}));
            const compiled=model("Original business context.");await compileBusinessBrief(sources,{model:compiled});
            const user=compiled.doGenerateCalls[0]?.prompt.find(message=>message.role==="user");
            const part=user?.content.find(part=>part.type==="text");if(!part)throw new Error("Missing compiler input");
            const input: {sources:BusinessProfile["sources"]}=JSON.parse(part.text);
            expect(input.sources.reduce((n,source)=>n+source.content.length,0)).toBeLessThanOrEqual(64000);
            expect(input.sources.length).toBeLessThan(sources.length);
            expect(input.sources.every(source=>source.content.length===12000)).toBe(true);
        });
		it("preserves newer saved corrections when a caller prefetched stale replies", async () => {
			await load();
			const original = await stored();
			const older = {
				id: "reply-older", kind: "team_reply" as const,
				content: "We count report requests.",
				observedAt: new Date(Date.now() - 2000).toISOString(),
			};
			const correction = {
				...older, id: "reply-newer",
				content: "Correction: this measures preparation, before download.",
				observedAt: new Date(Date.now() - 1000).toISOString(),
			};
			const profile: BusinessProfile = {
				...original.profile, capturedAt: new Date().toISOString(),
				sources: [...original.profile.sources, correction, older],
				brief: { facts: [{ topic: "event_semantics", sourceId: correction.id, quote: correction.content }], unknowns: [] },
			};
			const saved = await saveBusinessProfileRecord(scope, profile, {
				expectedRevision: original.revision, refreshAfter: original.refreshAfter,
			});
			for (const replies of [[older], [], [{ ...correction, content: "Stale text must not replace the persisted original." }]]) {
				const warmModel = model();
				const context = await loadDurableBusinessProfile(
					{ scope, asOf: new Date(), allowRefresh: true, replies },
					{ model: warmModel, readPage },
				);
				expect(context.sources).toContainEqual(correction);
				expect(context.brief).toEqual(profile.brief);
				expect(warmModel.doGenerateCalls).toHaveLength(0);
				expect((await stored()).revision).toBe(saved?.revision);
			}
		});
		it("keeps PostgreSQL sources available when native Supermemory rejects indexing", async () => {
			provider.mockReturnValue(native);
			transport.mockResolvedValue(
				Response.json({ error: "Synthetic outage" }, { status: 503 })
			);
			const cold = await load();
			expect(cold.sources).toHaveLength(2);
			expect(transport).toHaveBeenCalledTimes(1);
			expect((await stored()).indexedRevision).toBeNull();
			const call = transport.mock.calls[0];
			if (!call) throw new Error("Expected a native SDK transport request");
			const request = new Request(call[0], call[1]);
			expect(new URL(request.url).hostname).toBe("api.supermemory.ai");
			expect((await request.json()).metadata.websiteId).toBe(scope.websiteId);
			readPage.mockClear();
			const warmModel = model();
			let submitted: { content: string } | undefined;
			transport.mockImplementation(async (input, init) => {
				const request = new Request(input, init);
				if (request.method === "POST") {
					submitted = await request.json();
					return Response.json({ id: "synthetic-document", status: "queued" });
				}
				return Response.json({ content: submitted?.content, status: "done" });
			});
			expect((await load(warmModel)).sources).toEqual(cold.sources);
			const indexed = await stored();
			expect(indexed.indexedRevision).toBe(indexed.revision);
			expect(readPage).not.toHaveBeenCalled();
			expect(warmModel.doGenerateCalls).toHaveLength(0);
		});
		it.each(["stale", "failed", "processing"])("does not acknowledge a %s Supermemory read and retries without model work", async (failure) => {
			const original = await load();
			const record = await stored();
			provider.mockReturnValue(native);
			let storedContent: string | undefined;
			let recovered = false;
			transport.mockImplementation(async (input, init) => {
				const request = new Request(input, init);
				if (request.method === "POST") {
					storedContent = (await request.json()).content;
					return Response.json({ id: "synthetic-document", status: "queued" });
				}
				return Response.json({
					content: !recovered && failure === "stale" ? "Previous business brief" : storedContent,
					status: !recovered && failure === "failed" ? "failed" : !recovered && failure === "processing" ? "extracting" : "done",
					// Native de-duplication can retain old metadata for identical content.
					metadata: { revision: record.revision - 1 },
				});
			});
			const warm = model();
			expect((await load(warm)).sources).toEqual(original.sources);
			expect((await stored()).indexedRevision).toBeNull();
			expect(transport).toHaveBeenCalledTimes(2);
			recovered = true;
			await load(warm);
			expect((await stored()).indexedRevision).toBe(record.revision);
			expect(transport).toHaveBeenCalledTimes(4);
			await load(warm);
			expect(transport).toHaveBeenCalledTimes(4);
			expect(warm.doGenerateCalls).toHaveLength(0);
		});
		it("rejects an invalid model quotation while retaining the complete original pages", async () => {
			const result = await load(model("A promise absent from every source."));
			const record = await stored();
			expect(record.profile.brief).toBeNull();
			expect(record.profile.sources).toHaveLength(2);
			expect(
				record.profile.sources.every(
					(source) => source.content === page().content
				)
			).toBe(true);
			expect(result.sources.map((source) => source.content)).toEqual(
				record.profile.sources.map((source) => source.content)
			);
			expect(record.profile.issues.length).toBeGreaterThan(0);
		});
		it("retains an investigation's deeper page and recompiles without crawling again", async () => {
			await load();
			const deeper = page(
				"/docs/setup",
				"Connect the project, then verify the first report before inviting teammates."
			);
			await rememberBusinessPages(scope, [deeper]);
			const retained = await stored();
			expect(
				retained.profile.sources.find(
					(source) => source.url === deeper.finalUrl
				)?.content
			).toBe(deeper.content);
			expect(retained.profile.brief).toBeNull();
			readPage.mockClear();
			const compile = model();
			const result = await load(compile);
			expect(compile.doGenerateCalls).toHaveLength(1);
			expect(JSON.stringify(compile.doGenerateCalls[0]?.prompt)).toContain(
				deeper.content
			);
			expect(readPage).not.toHaveBeenCalled();
			expect(
				result.sources.some((source) => source.content === deeper.content)
			).toBe(true);
			expect((await stored()).profile.brief).not.toBeNull();
		});
		it("permits only the refresh claim winner to crawl and compile", async () => {
			let resume = () => {};
			let entered = () => {};
			const gate = new Promise<void>((resolve) => {
				resume = resolve;
			});
			const reading = new Promise<void>((resolve) => {
				entered = resolve;
			});
			readPage.mockImplementationOnce(async () => {
				entered();
				await gate;
				return page();
			});
			const firstModel = model();
			const first = load(firstModel);
			try {
				await reading;
				const claim = await stored();
				const secondModel = model();
				await load(secondModel);
				expect(secondModel.doGenerateCalls).toHaveLength(0);
				expect(readPage).toHaveBeenCalledTimes(1);
				expect((await stored()).revision).toBe(claim.revision);
				resume();
				await first;
				expect(firstModel.doGenerateCalls).toHaveLength(2);
				expect((await stored()).revision).toBe(claim.revision + 1);
			} finally {
				resume();
				await first;
			}
		});
		it("does not let a refresh overwrite pages saved after its claim", async () => {
			let resume = () => {};
			let entered = () => {};
			const gate = new Promise<void>((resolve) => {
				resume = resolve;
			});
			const reading = new Promise<void>((resolve) => {
				entered = resolve;
			});
			readPage.mockImplementationOnce(async () => {
				entered();
				await gate;
				return page();
			});
			const first = load();
			try {
				await reading;
				const deeper = page(
					"/docs/restrictions",
					"Private projects cannot enable public sharing."
				);
				await rememberBusinessPages(scope, [deeper]);
				const winner = await stored();
				resume();
				const result = await first;
				expect((await stored()).revision).toBeGreaterThan(winner.revision);
                expect(result.sources.map(source=>source.url).sort()).toEqual([page().finalUrl,page("/pricing").finalUrl,deeper.finalUrl].sort());
                readPage.mockClear();
                const warm=await load();
                expect(warm.sources.map(source=>source.url).sort()).toEqual(result.sources.map(source=>source.url).sort());
                expect(readPage).not.toHaveBeenCalled();
				expect(
					result.sources.some((source) => source.content === deeper.content)
				).toBe(true);
			} finally {
				resume();
				await first;
			}
		});
		it("rejects prior-epoch, foreign-domain and future pages without changing the record", async () => {
			await load();
			const before = await stored();
			await rememberBusinessPages(scope, [
				{
					...page("/old"),
					fetchedAt: new Date(Date.parse(scope.startedAt) - 1).toISOString(),
				},
				page("https://foreign.example.com/"),
				{
					...page("/future"),
					fetchedAt: new Date(Date.now() + 86_400_000).toISOString(),
				},
			]);
			expect(await stored()).toEqual(before);
		});
		it("refreshes expired public sources even when the stored refresh deadline is in the future", async () => {
			await load();
			const before = await stored();
			const expired = {
				...before.profile,
				sources: before.profile.sources.map((source) => ({
					...source,
					observedAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
					expiresAt: new Date(Date.now() - 1000).toISOString(),
				})),
			};
			expect(
				await saveBusinessProfileRecord(scope, expired, {
					expectedRevision: before.revision,
					refreshAfter: new Date(Date.now() + 86_400_000),
				})
			).not.toBeNull();
			readPage.mockClear();
			const refreshed = model();
			const result = await load(refreshed);
			expect(readPage).toHaveBeenCalledTimes(2);
			expect(refreshed.doGenerateCalls).toHaveLength(2);
			expect(result.sources).toHaveLength(2);
			expect(
				(await stored()).profile.sources.every(
					(source) => Date.parse(source.expiresAt ?? "") > Date.now()
				)
			).toBe(true);
		});
		it("caps publication refresh time at the earliest retained source expiry", async () => {
			readPage.mockImplementation(async (input) => ({
				...page(input.path),
				fetchedAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
			}));
			await load();
			const record = await stored();
			for (const source of record.profile.sources) {
				expect(record.refreshAfter.getTime()).toBeLessThanOrEqual(
					Date.parse(source.expiresAt ?? "")
				);
			}
			expect(record.refreshAfter.getTime()).toBeGreaterThan(Date.now());
		});
		it("persists the fetched homepage when optional page selection fails", async () => {
			const unavailable = new MockLanguageModelV3({
				doGenerate: async () => {
					throw new Error("Synthetic selector outage");
				},
			});
			const result = await load(unavailable);
			const record = await stored();
			expect(unavailable.doGenerateCalls).toHaveLength(1);
			expect(readPage).toHaveBeenCalledTimes(1);
			expect(record.profile.sources).toHaveLength(1);
			expect(record.profile.sources[0]?.content).toBe(page().content);
			expect(result.sources[0]?.content).toBe(page().content);
			expect(record.profile.brief).toBeNull();
			expect(record.profile.issues.length).toBeGreaterThan(0);
		});
		it("updates identical page observation dates while preserving the compiled brief", async () => {
			readPage.mockImplementation(async (input) => ({
				...page(input.path),
				fetchedAt: new Date(Date.now() - 10_000).toISOString(),
			}));
			await load();
			const before = await stored();
			const fresh = page();
			await rememberBusinessPages(scope, [fresh]);
			const after = await stored();
			const source = after.profile.sources.find(
				(item) => item.url === fresh.finalUrl
			);
			expect(source?.observedAt).toBe(fresh.fetchedAt);
			expect(Date.parse(source?.expiresAt ?? "")).toBeGreaterThan(
				Date.parse(before.profile.sources[0]?.expiresAt ?? "")
			);
			expect(after.profile.brief).toEqual(before.profile.brief);
			readPage.mockClear();
			const warm = model();
			await load(warm);
			expect(warm.doGenerateCalls).toHaveLength(0);
			expect(readPage).not.toHaveBeenCalled();
		});
        it("keeps a newly fetched homepage when a later redirect alias returns older cached content", async()=>{
            const fresh=page();
            const old={...page("/pricing","Old product terms."),finalUrl:fresh.finalUrl,fetchedAt:new Date(Date.now()-86400000).toISOString()};
            readPage.mockImplementation(async(input)=>input.path==="/"?fresh:old);
            const result=await load();
            expect(result.sources).toHaveLength(1);
            expect(result.sources[0]?.content).toBe(fresh.content);
            expect(result.sources[0]?.observedAt).toBe(fresh.fetchedAt);
        });
        it.each([false,true])("retains the newest same-URL observation regardless of flush order: %s",async(reverse)=>{
            readPage.mockImplementation(async(input)=>({...page(input.path),fetchedAt:new Date(Date.now()-86400000).toISOString()}));
            await load();
            const fresh={...page("/pricing","Current pricing terms."),fetchedAt:new Date(Date.now()-100).toISOString()};
            const old={...fresh,content:"Old pricing terms.",fetchedAt:new Date(Date.now()-200).toISOString()};
            await rememberBusinessPages(scope,reverse?[old,fresh]:[fresh,old]);
            const record=await stored();
            expect(record.profile.sources.find(source=>source.url===fresh.finalUrl)?.content).toBe(fresh.content);
        });
		it("deduplicates redirect aliases before compiling and saving original sources", async () => {
			readPage.mockImplementation(async (input) => ({
				...page(input.path),
				finalUrl: page().finalUrl,
			}));
			const compiled = model();
			const result = await load(compiled);
			expect(compiled.doGenerateCalls).toHaveLength(2);
			expect(readPage).toHaveBeenCalledTimes(2);
			const record = await stored();
			expect(record.profile.sources).toHaveLength(1);
			expect(record.profile.sources[0]?.url).toBe(page().finalUrl);
			expect(record.profile.brief).not.toBeNull();
			expect(result.sources).toHaveLength(1);
		});
	}
);
