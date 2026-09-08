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
import { readOrganizationBusinessContext } from "@databuddy/services/organization-business-context";
import {
	formatBusinessTeamContext,
	type OrganizationBusinessProfile,
} from "@databuddy/shared/organization-business-context";

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
): Promise<BusinessScope> {
	// Native scope is required for live persistence; optional memory failures
	// are handled separately by the profile and recall boundaries below.
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

class BusinessScopeError extends Error {}

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
		const current = await sources.currentScope(input.scope).catch((error) => {
			throw new BusinessScopeError("Website scope could not be rechecked", {
				cause: error,
			});
		});
		if (
			!current?.startedAt ||
			businessContainerTag(current) !== businessContainerTag(input.scope)
		) {
			throw new BusinessScopeError("Website scope changed or was deleted");
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
		if (error instanceof BusinessScopeError) {
			throw error;
		}
		return unavailableBusinessContext(error, input.scope, input.asOf);
	}
}

export async function loadWebsiteBusinessProfile(
	input: ProfileInput,
	sources: typeof productionSources & {
		readOrganization?: typeof readOrganizationBusinessContext;
	} = {
		...productionSources,
		readOrganization: readOrganizationBusinessContext,
	}
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
		const reconciled = await reconcileReplies(
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
		if (!sources.readOrganization) {
			return reconciled;
		}
		const organization = await sources
			.readOrganization(input.scope.organizationId)
			.then((value) =>
				organizationProfileContext(
					value.profile,
					input.scope.organizationId,
					input.allowRefresh ? new Date() : input.asOf
				)
			)
			.catch((error) =>
				unavailableBusinessContext(error, input.scope, input.asOf)
			);
		const current = await sources.currentScope(input.scope);
		if (
			!current?.startedAt ||
			businessContainerTag(current) !== businessContainerTag(input.scope)
		) {
			throw new BusinessScopeError("Website scope changed or was deleted");
		}
		return mergeBusinessContext(reconciled, organization);
	} catch (error) {
		return unavailableBusinessContext(error, input.scope, input.asOf);
	}
}

export function organizationProfileContext(
	profile: OrganizationBusinessProfile | null,
	organizationId: string,
	asOf: Date
): BusinessContext {
	const sources: BusinessSource[] = [];
	if (profile && Date.parse(profile.updatedAt) <= asOf.getTime()) {
		const teamContext = formatBusinessTeamContext(profile.teamContext);
		for (let offset = 0; offset < teamContext.length; offset += 4000) {
			sources.push({
				id: `organization-team-context:${organizationId}:${offset / 4000}`,
				kind: "organization_profile",
				content: teamContext.slice(offset, offset + 4000),
				observedAt: profile.updatedAt,
				author: "Team priorities and definitions",
				origin: "team",
			});
		}
		// Keep the source contract and the complete editable document; no semantic
		// summarization between the saved text and the investigator's input.
		for (let offset = 0; offset < profile.content.length; offset += 4000) {
			sources.push({
				id: `organization-profile:${organizationId}:${offset / 4000}`,
				kind: "organization_profile",
				content: profile.content.slice(offset, offset + 4000),
				observedAt: profile.updatedAt,
				author:
					profile.origin === "mixed"
						? "Edited website background"
						: "Organization settings",
				origin: profile.origin,
				...(offset === 0 ? { references: profile.sources } : {}),
			});
		}
	}
	return {
		capturedAt: asOf.toISOString(),
		status: sources.length ? "ready" : "disabled",
		sources,
		issues: [],
	};
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
