import { createHash } from "node:crypto";
import { z } from "zod";
import type Supermemory from "supermemory";
import {
	businessContainerTag,
	canonicalBusinessScope,
	getMemoryClient,
	withBusinessMemoryWrite,
	type BusinessScope,
} from "@databuddy/services/business-memory";

const PUBLIC_CONTEXT_TTL = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT = 4000;
const MAX_CONTEXT_CHARACTERS = 16_000;

export type { BusinessScope } from "@databuddy/services/business-memory";
export { businessContainerTag } from "@databuddy/services/business-memory";

const timestamp = z.iso
	.datetime({ offset: true })
	.refine((value) => Number.isFinite(Date.parse(value)));

export const businessSourceSchema = z.object({
	id: z.string().min(1).max(500),
	kind: z.enum(["website", "team_reply", "organization_profile"]),
	content: z.string().min(1).max(4000),
	observedAt: timestamp,
	url: z.url().max(2048).optional(),
	references: z
		.array(z.object({ url: z.url().max(2048), title: z.string().max(512) }))
		.max(8)
		.optional(),
	internalLinks: z.array(z.string().max(300)).max(10).optional(),
	subjectKey: z.string().max(500).optional(),
	author: z.string().max(200).optional(),
	origin: z.enum(["team", "website"]).optional(),
	expiresAt: timestamp.optional(),
});
export type BusinessSource = z.infer<typeof businessSourceSchema>;

export const businessContextSchema = z.object({
	capturedAt: timestamp,
	status: z.enum(["ready", "partial", "unavailable", "disabled"]),
	sources: z.array(businessSourceSchema).max(16),
	issues: z.array(z.string().max(200)).max(20),
});
export type BusinessContext = z.infer<typeof businessContextSchema>;

const metadataSchema = businessSourceSchema
	.omit({ id: true, content: true, references: true })
	.extend({
		version: z.literal(1),
		organizationId: z.string().min(1),
		websiteId: z.string().min(1),
		domain: z.string().min(1),
		sourceId: z.string().min(1).max(500),
		originalText: z.string().min(1).max(4000).optional(),
		startedAt: timestamp.optional(),
	});

const storedSourceSchema = z.object({
	content: z.string().nullish(),
	metadata: metadataSchema,
});

function digest(value: string): string {
	return createHash("sha256").update(value).digest("hex").slice(0, 40);
}

function filters(scope: BusinessScope) {
	return { AND: Object.entries(scope).map(([key, value]) => ({ key, value })) };
}

function context(
	asOf: Date,
	status: BusinessContext["status"],
	issue?: string
): BusinessContext {
	return {
		capturedAt: asOf.toISOString(),
		status,
		sources: [],
		issues: issue ? [issue] : [],
	};
}

function sourceFromDocument(
	document: { content?: string | null; metadata: unknown },
	scope: BusinessScope,
	asOf: Date
): BusinessSource | null {
	const parsed = storedSourceSchema.safeParse(document);
	if (!parsed.success) {
		return null;
	}
	// Organization settings come from their canonical PostgreSQL record, never
	// a recalled document that could contain an old revision or another scope.
	if (parsed.data.metadata.kind === "organization_profile") {
		return null;
	}
	const {
		version,
		organizationId,
		websiteId,
		domain,
		sourceId,
		originalText,
		startedAt,
		...source
	} = parsed.data.metadata;
	if (
		organizationId !== scope.organizationId ||
		websiteId !== scope.websiteId ||
		domain !== scope.domain ||
		startedAt !== scope.startedAt
	) {
		return null;
	}
	const content =
		source.kind === "team_reply"
			? originalText
			: parsed.data.content?.slice(0, 4000);
	if (!content) {
		return null;
	}
	const observed = Date.parse(source.observedAt);
	if (
		observed > asOf.getTime() ||
		(scope.startedAt && observed < Date.parse(scope.startedAt)) ||
		(source.expiresAt && Date.parse(source.expiresAt) <= asOf.getTime())
	) {
		return null;
	}
	if (source.kind === "website") {
		if (!source.url || observed + PUBLIC_CONTEXT_TTL <= asOf.getTime()) {
			return null;
		}
		const url = new URL(source.url);
		if (
			(url.protocol !== "https:" && url.protocol !== "http:") ||
			url.username ||
			url.password ||
			url.port ||
			canonicalBusinessScope({ ...scope, domain: url.hostname }).domain !==
				scope.domain ||
			startedAt !== scope.startedAt
		) {
			return null;
		}
	}
	return {
		...source,
		id: sourceId,
		content,
	};
}

export function mergeBusinessContext(
	...contexts: BusinessContext[]
): BusinessContext {
	const sources = new Map<string, BusinessSource>();
	// Later contexts contain exact/recalled context and canonical reply text.
	// Preserve that priority instead of replacing relevance with global recency.
	for (const item of [...contexts].reverse()) {
		for (const source of item.sources) {
			if (!sources.has(source.id)) {
				sources.set(source.id, source);
			}
		}
	}
	const ordered = [...sources.values()];
	const pages = ordered.filter((source) => source.kind === "website");
	const homepage =
		pages.find(
			(source) => source.url && new URL(source.url).pathname === "/"
		) ?? pages[0];
	const profiles = ordered.filter(
		(source) => source.kind === "organization_profile"
	);
	const ordinary = [
		...(homepage ? [homepage] : []),
		...ordered.filter(
			(source) =>
				source.kind !== "organization_profile" && source.id !== homepage?.id
		),
	];
	// A saved brief already supplies the overview. Preserve corrections before
	// spending its remaining budget on pages. Otherwise keep the homepage.
	const prioritized = profiles.length
		? [
				...profiles,
				...ordinary.filter((source) => source.kind === "team_reply"),
				...ordinary.filter((source) => source.kind !== "team_reply"),
			]
		: ordinary;
	const selected: BusinessSource[] = [];
	let characters = 0;
	for (const source of prioritized) {
		if (
			selected.length === 16 ||
			characters + source.content.length > MAX_CONTEXT_CHARACTERS
		) {
			continue;
		}
		selected.push(source);
		characters += source.content.length;
	}
	const issues = [...new Set(contexts.flatMap((item) => item.issues))];
	if (selected.length < sources.size) {
		issues.push("Context is bounded; additional source records were omitted.");
	}
	const available = contexts.some(
		(item) => item.status === "ready" || item.status === "partial"
	);
	return {
		capturedAt:
			contexts
				.map((item) => item.capturedAt)
				.sort()
				.at(-1) ?? new Date().toISOString(),
		status:
			available || selected.length
				? issues.length
					? "partial"
					: "ready"
				: contexts.some((item) => item.status === "unavailable")
					? "unavailable"
					: "disabled",
		sources: selected,
		issues: issues.slice(0, 20),
	};
}

interface ReadOptions {
	abortSignal?: AbortSignal;
	asOf: Date;
	client?: Supermemory;
	scope: BusinessScope;
}

async function readBusinessMemory(
	options: ReadOptions & { query?: string }
): Promise<BusinessContext> {
	const client = options.client ?? getMemoryClient();
	if (!client) {
		return context(
			options.asOf,
			"disabled",
			"Business memory is not configured."
		);
	}
	const scope = canonicalBusinessScope(options.scope);
	const request = {
		timeout: REQUEST_TIMEOUT,
		maxRetries: 0,
		signal: options.abortSignal,
	};
	try {
		const documents = options.query
			? (
					await client.search.documents(
						{
							q: options.query.slice(0, 1000),
							containerTags: [businessContainerTag(scope)],
							filters: filters(scope),
							includeFullDocs: true,
							limit: 5,
							rewriteQuery: false,
						},
						request
					)
				).results
			: (
					await client.documents.list(
						{
							containerTags: [businessContainerTag(scope)],
							filters: {
								AND: [...filters(scope).AND, { key: "kind", value: "website" }],
							},
							includeContent: true,
							limit: 5,
							sort: "createdAt",
							order: "desc",
						},
						request
					)
				).memories;
		const result = context(options.asOf, "ready");
		for (const document of documents) {
			const source = sourceFromDocument(document, scope, options.asOf);
			if (source && (options.query || source.kind === "website")) {
				result.sources.push(source);
			}
		}
		if (result.sources.length < documents.length) {
			result.issues.push(
				"Some memory records were outside this site's scope, stale, future-dated, or lacked source content."
			);
		}
		return mergeBusinessContext(result);
	} catch (error) {
		// Optional context must not prevent the agent from checking current analytics.
		return context(
			options.asOf,
			"unavailable",
			`Business memory retrieval failed (${error instanceof Error ? error.name.slice(0, 60) : "unknown error"}).`
		);
	}
}

export function recallBusinessContext(
	options: ReadOptions & { query: string }
): Promise<BusinessContext> {
	return readBusinessMemory(options);
}

async function recordSources(
	scopeInput: BusinessScope,
	sources: BusinessSource[],
	abortSignal?: AbortSignal,
	suppliedClient?: Supermemory
) {
	const client = suppliedClient ?? getMemoryClient();
	if (!client) {
		return { status: "disabled" as const, ids: [] as string[] };
	}
	const scope = canonicalBusinessScope(scopeInput);
	const containerTag = businessContainerTag(scope);
	try {
		const documents = z
			.array(businessSourceSchema)
			.max(20)
			.parse(sources)
			.map((value) => {
				// Organization references are supplied from SQL, never mirrored as memory metadata.
				const { id, content, ...source } = businessSourceSchema
					.omit({ references: true })
					.parse(value);
				return {
					content:
						source.kind === "team_reply"
							? `Team reply (verbatim):\n${content}`
							: content,
					customId: `${containerTag}_${digest(id)}`,
					metadata: {
						version: 1,
						...scope,
						...source,
						sourceId: id,
						...(source.kind === "team_reply" ? { originalText: content } : {}),
					},
				};
			});
		if (documents.length) {
			const write = () =>
				client.documents.batchAdd(
					{ containerTag, documents },
					{ timeout: REQUEST_TIMEOUT, maxRetries: 0, signal: abortSignal }
				);
			const result = await withBusinessMemoryWrite(scope, write);
			if (
				result.failed !== 0 ||
				result.success !== documents.length ||
				result.results.length !== documents.length ||
				result.results.some(
					(item) =>
						!item.id ||
						item.error ||
						item.status === "error" ||
						item.status === "failed"
				)
			) {
				return { status: "unavailable" as const, ids: [] as string[] };
			}
		}
		return {
			status: "saved" as const,
			ids: sources.map((source) => source.id),
		};
	} catch {
		// Caller keeps canonical replies in PostgreSQL and retries missing index entries.
		return { status: "unavailable" as const, ids: [] as string[] };
	}
}

export function recordBusinessReplies(options: {
	scope: BusinessScope;
	replies: BusinessSource[];
	abortSignal?: AbortSignal;
	client?: Supermemory;
}) {
	if (options.replies.some((source) => source.kind !== "team_reply")) {
		throw new Error(
			"Only authenticated team replies can enter the reply index"
		);
	}
	return recordSources(
		options.scope,
		options.replies,
		options.abortSignal,
		options.client
	);
}

export async function loadBusinessProfile(
	options: ReadOptions & { allowRefresh: boolean }
): Promise<BusinessContext> {
	const stored = await readBusinessMemory(options);
	if (stored.sources.some((source) => source.kind === "website")) {
		stored.issues.push(
			"Website context is limited to the listed page excerpts."
		);
	}
	if (
		!options.allowRefresh ||
		stored.sources.some((source) => source.kind === "website")
	) {
		return stored;
	}
	const { readWebsitePage } = await import("../ai/tools/scrape-page");
	const page = await readWebsitePage({
		domain: options.scope.domain,
		path: "/",
		freshAfter: options.scope.startedAt
			? new Date(options.scope.startedAt)
			: undefined,
		abortSignal: options.abortSignal,
	});
	if (!page.success) {
		return mergeBusinessContext(
			stored,
			context(
				new Date(),
				"unavailable",
				"Business website could not be read; coverage is incomplete."
			)
		);
	}
	const source: BusinessSource = {
		id: `page_${digest(page.finalUrl)}_${page.fetchedAt}`,
		kind: "website",
		content: [page.title, page.description, page.content]
			.filter(Boolean)
			.join("\n")
			.slice(0, 4000),
		observedAt: page.fetchedAt,
		expiresAt: new Date(
			Date.parse(page.fetchedAt) + PUBLIC_CONTEXT_TTL
		).toISOString(),
		url: page.finalUrl,
		internalLinks: page.internalLinks
			.filter((link) => link.length <= 300)
			.slice(0, 10),
	};
	const saved = await recordSources(
		options.scope,
		[source],
		options.abortSignal,
		options.client
	);
	const fresh = context(new Date(), "ready");
	fresh.sources.push(source);
	fresh.issues.push(
		"Website coverage includes the homepage only; linked pages have not been reviewed."
	);
	if (saved.status !== "saved") {
		fresh.issues.push(
			"Website context is available for this run but was not saved to business memory."
		);
	}
	return mergeBusinessContext(stored, fresh);
}
