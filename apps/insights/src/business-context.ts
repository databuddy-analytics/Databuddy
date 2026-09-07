import {
	type BusinessContext,
	type BusinessScope,
	type BusinessSource,
	loadBusinessProfile,
	mergeBusinessContext,
	recallBusinessContext,
	recordBusinessReplies,
} from "@databuddy/ai/lib/business-context";
import {
	and,
	db,
	desc,
	eq,
	gte,
	isNotNull,
	isNull,
	lte,
	ne,
	notInArray,
	or,
	sql,
} from "@databuddy/db";
import {
	analyticsInsights,
	insightReplies,
	websites,
} from "@databuddy/db/schema";
import {
	businessContainerTag,
	canonicalBusinessScope,
	getWebsiteBusinessScope,
} from "@databuddy/services/business-memory";
import { captureInsightsError, emitInsightsEvent } from "./lib/evlog-insights";

type ProfileInput = Parameters<typeof loadBusinessProfile>[0];
type RecallInput = Parameters<typeof recallBusinessContext>[0] & {
	allowWrite?: boolean;
	subjectKey: string;
};

function websiteScope(scope: BusinessScope) {
	return and(
		eq(websites.id, scope.websiteId),
		eq(websites.organizationId, scope.organizationId),
		eq(
			sql<string>`regexp_replace(rtrim(lower(${websites.domain}), '.'), '^www[.]', '')`,
			canonicalBusinessScope(scope).domain
		),
		eq(
			sql<string>`${websites.settings}->>'businessContextStartedAt'`,
			scope.startedAt ?? ""
		),
		isNull(websites.deletedAt)
	);
}

export async function readPersistedBusinessReplies(input: {
	scope: BusinessScope;
	asOf: Date;
	subjectKey?: string;
}): Promise<BusinessSource[]> {
	// Legacy rows have no original-domain binding. Only an initialized epoch
	// establishes which accepted replies belong to this business scope.
	if (!input.scope.startedAt) {
		return [];
	}
	const replies = await db
		.select({
			id: insightReplies.id,
			content: insightReplies.body,
			createdAt: insightReplies.createdAt,
			author: insightReplies.authorName,
			subjectKey: analyticsInsights.subjectKey,
		})
		.from(insightReplies)
		.innerJoin(
			analyticsInsights,
			eq(insightReplies.insightId, analyticsInsights.id)
		)
		.innerJoin(websites, eq(analyticsInsights.websiteId, websites.id))
		.where(
			and(
				websiteScope(input.scope),
				eq(analyticsInsights.organizationId, input.scope.organizationId),
				lte(insightReplies.createdAt, input.asOf),
				gte(insightReplies.createdAt, new Date(input.scope.startedAt)),
				input.subjectKey
					? eq(analyticsInsights.subjectKey, input.subjectKey)
					: undefined,
				or(
					ne(insightReplies.authorName, "Databuddy"),
					isNotNull(insightReplies.authorId)
				),
				notInArray(insightReplies.body, [
					"Databuddy applied the goal action. Recheck its verification condition against current data.",
					"Databuddy applied the funnel action. Recheck its verification condition against current data.",
				])
			)
		)
		.orderBy(desc(insightReplies.createdAt), desc(insightReplies.id))
		.limit(16);
	const supported = replies.filter(
		(reply) => reply.content.length > 0 && reply.content.length <= 4000
	);
	if (supported.length !== replies.length) {
		emitInsightsEvent("warn", "business_context.replies_omitted", {
			organization_id: input.scope.organizationId,
			website_id: input.scope.websiteId,
			omitted_count: replies.length - supported.length,
		});
	}
	return supported.map((reply) => ({
		id: reply.id,
		kind: "team_reply",
		content: reply.content,
		observedAt: reply.createdAt.toISOString(),
		author: reply.author,
		subjectKey: reply.subjectKey,
	}));
}

export async function loadCurrentBusinessScope(
	scope: BusinessScope,
	initialize = false
): Promise<BusinessScope | null> {
	try {
		const current = await getWebsiteBusinessScope(scope, { initialize });
		if (
			!current ||
			canonicalBusinessScope(scope).domain !== current.domain ||
			(scope.startedAt &&
				businessContainerTag(scope) !== businessContainerTag(current))
		) {
			throw new Error(
				"Website business scope changed, is uninitialized or was deleted"
			);
		}
		return current;
	} catch (error) {
		unavailableBusinessContext(error, scope, new Date());
		return null;
	}
}

// Call inside the outcome transaction, after the model finishes. Taking the
// website lock first coordinates with scope mutations without locking the LLM.
export async function assertBusinessScopeCurrent(
	scope: BusinessScope,
	database: Pick<typeof db, "select">
): Promise<void> {
	const [site] = await database
		.select({ domain: websites.domain, settings: websites.settings })
		.from(websites)
		.where(
			and(
				eq(websites.id, scope.websiteId),
				eq(websites.organizationId, scope.organizationId),
				isNull(websites.deletedAt)
			)
		)
		.limit(1)
		.for("update");
	if (
		!site ||
		canonicalBusinessScope({ ...scope, domain: site.domain }).domain !==
			canonicalBusinessScope(scope).domain ||
		(scope.startedAt &&
			businessContainerTag(scope) !==
				businessContainerTag({
					...scope,
					domain: site.domain,
					startedAt: site.settings?.businessContextStartedAt,
				}))
	) {
		throw new Error(
			"Website business scope changed while the investigation was running"
		);
	}
}

async function currentScope(
	scope: BusinessScope
): Promise<BusinessScope | null> {
	return scope.startedAt ? await loadCurrentBusinessScope(scope) : null;
}

const productionSources = {
	currentScope,
	readReplies: readPersistedBusinessReplies,
	loadProfile: loadBusinessProfile,
	recall: recallBusinessContext,
	record: recordBusinessReplies,
};

export function unavailableBusinessContext(
	error: unknown,
	scope: BusinessScope,
	asOf: Date
): BusinessContext {
	captureInsightsError(error, "business_context.failed", {
		organization_id: scope.organizationId,
		website_id: scope.websiteId,
	});
	return {
		capturedAt: asOf.toISOString(),
		status: "unavailable",
		sources: [],
		issues: ["Business context could not be loaded."],
	};
}

async function reconcileReplies(
	input: {
		scope: BusinessScope;
		asOf: Date;
		abortSignal?: AbortSignal;
		subjectKey?: string;
		allowWrite: boolean;
	},
	context: BusinessContext,
	sources: typeof productionSources
): Promise<BusinessContext> {
	try {
		if (
			context.status === "unavailable" ||
			context.status === "partial" ||
			context.issues.length > 0
		) {
			emitInsightsEvent("warn", "business_context.incomplete", {
				organization_id: input.scope.organizationId,
				website_id: input.scope.websiteId,
				status: context.status,
				issue_count: context.issues.length,
			});
		}
		const replies = await sources.readReplies(input);
		// Reauthorize immediately before any external reply write. A refresh
		// or concurrent transfer must not move old replies into a new scope.
		const current = await sources.currentScope(input.scope);
		if (
			!current?.startedAt ||
			businessContainerTag(current) !== businessContainerTag(input.scope)
		) {
			return unavailableBusinessContext(
				new Error("Website scope changed or was deleted"),
				input.scope,
				input.asOf
			);
		}
		const scopeStartedAt = Date.parse(current.startedAt);
		const eligible = replies.filter(
			(reply) =>
				Date.parse(reply.observedAt) >= scopeStartedAt &&
				Date.parse(reply.observedAt) <= input.asOf.getTime()
		);
		const known = new Set(context.sources.map((source) => source.id));
		const missing = eligible.filter((reply) => !known.has(reply.id));
		let issue: string | undefined;
		if (input.allowWrite && missing.length > 0) {
			try {
				const saved = await sources.record({
					scope: input.scope,
					replies: missing,
					abortSignal: input.abortSignal,
				});
				if (
					saved.status !== "saved" ||
					missing.some((reply) => !saved.ids.includes(reply.id))
				) {
					issue =
						saved.status === "disabled"
							? "Shared memory is disabled; persisted team replies are included directly."
							: "Team replies are included directly; shared memory has not acknowledged all of them.";
					emitInsightsEvent("warn", "business_context.replies_unacknowledged", {
						organization_id: input.scope.organizationId,
						website_id: input.scope.websiteId,
						status: saved.status,
						requested_count: missing.length,
						acknowledged_count: saved.ids.length,
					});
				}
			} catch (error) {
				unavailableBusinessContext(error, input.scope, input.asOf);
				issue =
					"Team replies are included directly; shared memory did not acknowledge them.";
			}
		}
		const raw: BusinessContext = {
			capturedAt: input.asOf.toISOString(),
			status: issue ? "partial" : eligible.length ? "ready" : context.status,
			sources: eligible,
			issues: issue ? [issue] : [],
		};
		const canonical = new Map(eligible.map((reply) => [reply.id, reply]));
		return mergeBusinessContext(raw, {
			...context,
			sources: context.sources.map(
				(source) => canonical.get(source.id) ?? source
			),
		});
	} catch (error) {
		return unavailableBusinessContext(error, input.scope, input.asOf);
	}
}

export async function loadWebsiteBusinessProfile(
	input: ProfileInput,
	sources = productionSources
): Promise<BusinessContext> {
	try {
		if (!(await sources.currentScope(input.scope))) {
			throw new Error("Website scope changed or was deleted");
		}
		const context = await sources
			.loadProfile(input)
			.catch((error) =>
				unavailableBusinessContext(error, input.scope, input.asOf)
			);
		return await reconcileReplies(
			{
				...input,
				// Shared profile lists only public records. Repair team indexing
				// from exact-subject recall, never from every recent shared reply.
				allowWrite: false,
				asOf: input.allowRefresh ? new Date() : input.asOf,
			},
			context,
			sources
		);
	} catch (error) {
		return unavailableBusinessContext(error, input.scope, input.asOf);
	}
}

export async function recallWebsiteBusinessContext(
	input: RecallInput,
	sources = productionSources
): Promise<BusinessContext> {
	try {
		if (!(await sources.currentScope(input.scope))) {
			throw new Error("Website scope changed or was deleted");
		}
		const context = await sources
			.recall(input)
			.catch((error) =>
				unavailableBusinessContext(error, input.scope, input.asOf)
			);
		return await reconcileReplies(
			{ ...input, allowWrite: input.allowWrite ?? false },
			context,
			sources
		);
	} catch (error) {
		return unavailableBusinessContext(error, input.scope, input.asOf);
	}
}
