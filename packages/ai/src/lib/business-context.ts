import { loadBusinessProfileRecord } from "@databuddy/services/business-profile";
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
const MAX_CONTEXT_CHARACTERS = 64_000;
const timestamp = z.iso
	.datetime({ offset: true })
	.refine((value) => Number.isFinite(Date.parse(value)));

export type { BusinessScope } from "@databuddy/services/business-memory";
export { businessContainerTag } from "@databuddy/services/business-memory";

import {
	businessSourceSchema,
	type BusinessSource,
	type BusinessContext,
	type BusinessProfile,
} from "@databuddy/shared/business-context";
export {
	businessSourceSchema,
	businessContextSchema,
	type BusinessSource,
	type BusinessContext,
} from "@databuddy/shared/business-context";

const metadataSchema = businessSourceSchema
	.omit({ id: true, content: true })
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
	const selected: BusinessSource[] = homepage ? [homepage] : [];
	let characters = homepage?.content.length ?? 0;
	for (const source of ordered) {
		if (
			source.id === homepage?.id ||
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
	const brief = [...contexts].reverse().find((item) => item.brief)?.brief;
	const facts = brief?.facts.filter((fact) =>
		fact.evidence.every((citation) =>
			selected.some(
				(source) =>
					source.id === citation.sourceId &&
					source.content.includes(citation.quote)
			)
		)
	);
	if (brief && facts?.length !== brief.facts.length) {
		issues.push(
			"Brief claims with missing or changed supporting passages were omitted."
		);
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
		...(brief && facts?.length ? { brief: { ...brief, facts } } : {}),
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
	options: ReadOptions & { query: string }
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
		const documents = (
			await client.search.documents(
				{
					q: options.query.slice(0, 1000),
					containerTags: [businessContainerTag(scope)],
					filters: {
						AND: [
							...filters(scope).AND,
							{
								OR: [
									{ key: "kind", value: "team_reply" },
									{ key: "kind", value: "business_profile" },
								],
							},
						],
					},
					includeFullDocs: true,
					limit: 5,
					rewriteQuery: false,
				},
				request
			)
		).results;
		const result = context(options.asOf, "ready");
		for (const document of documents) {
			const profileHint = z
				.object({
					kind: z.literal("business_profile"),
					organizationId: z.string(),
					websiteId: z.string(),
					domain: z.string(),
					startedAt: z.string(),
					revision: z.number().int().positive(),
				})
				.safeParse(document.metadata);
			if (profileHint.success && scope.startedAt) {
				const hint = profileHint.data;
				if (
					hint.organizationId === scope.organizationId &&
					hint.websiteId === scope.websiteId &&
					hint.domain === scope.domain &&
					hint.startedAt === scope.startedAt
				) {
					const current = await loadBusinessProfileRecord(
						{ ...scope, startedAt: scope.startedAt },
						options.asOf
					);
					if (current) {
						const canonical = profileBusinessContext(
							current.profile,
							options.asOf
						);
						result.sources.push(...canonical.sources);
						result.brief = canonical.brief;
						result.issues.push(...canonical.issues);
					}
				}
				continue;
			}
			const source = sourceFromDocument(document, scope, options.asOf);
			if (source) {
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
				const { id, content, ...source } = businessSourceSchema.parse(value);
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

// Keep the brief alongside its sources. Compression can omit a deciding condition;
// the investigation must still be able to read the original evidence in one turn.
export function profileBusinessContext(
	profile: BusinessProfile,
	asOf: Date
): BusinessContext {
	const sources = profile.sources.filter(
		(source) =>
			Date.parse(source.observedAt) <= asOf.getTime() &&
			(!source.expiresAt || Date.parse(source.expiresAt) > asOf.getTime())
	);
	return mergeBusinessContext({
		capturedAt: profile.capturedAt,
		status: profile.issues.length
			? "partial"
			: sources.length
				? "ready"
				: "unavailable",
		sources,
		issues: profile.issues,
		...(profile.brief ? { brief: profile.brief } : {}),
	});
}
