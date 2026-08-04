import {
	aliasedTable,
	and,
	db,
	eq,
	isTrustedInsightObservation,
	notExists,
	sql,
	type withTransaction,
} from "@databuddy/db";
import type { SQL } from "drizzle-orm";
import {
	goals,
	insightObservations,
	insightRecommendationApplications,
} from "@databuddy/db/schema";

type Executor =
	| typeof db
	| Parameters<Parameters<typeof withTransaction>[0]>[0];

const newerPublishedObservation = aliasedTable(
	insightObservations,
	"newer_published_recommendation_observation"
);

export type RecommendationApplicationAction =
	| { type: "feature_flag.create" }
	| { type: "funnel.create" }
	| { type: "goal.create" }
	| { goalId: string; type: "goal.delete" }
	| { goalId: string; type: "goal.update" }
	| { type: "target_group.create" };

export type RecommendationApplicationResult =
	| "already_applied"
	| "claimed"
	| "missing"
	| "not_requested";

/**
 * Claims a matching native recommendation in the same transaction as its
 * owning resource mutation. A later mutation failure rolls this insert back,
 * while the primary key makes a retried save fail before it can duplicate a
 * resource.
 */
export async function claimRecommendationApplication(
	executor: Executor,
	input: {
		action: RecommendationApplicationAction;
		appliedByUserId: string | null;
		recommendationId?: string;
		websiteId: string;
	}
): Promise<RecommendationApplicationResult> {
	if (!input.recommendationId) {
		return "not_requested";
	}

	const matchingAction = recommendationMatchesAction(input.action);
	const [observation] = await executor
		.select({ id: insightObservations.id })
		.from(insightObservations)
		.where(
			and(
				eq(insightObservations.id, input.recommendationId),
				eq(insightObservations.websiteId, input.websiteId),
				sql`${insightObservations.outcome}->>'publish' = 'true'`,
				sql`${insightObservations.outcome}->>'recommendation' is not null`,
				isTrustedInsightObservation(insightObservations),
				isLatestPublishedRecommendation(),
				matchingAction
			)
		)
		.limit(1);

	if (!observation) {
		return "missing";
	}

	const [application] = await executor
		.insert(insightRecommendationApplications)
		.values({
			appliedByUserId: input.appliedByUserId,
			observationId: observation.id,
		})
		.onConflictDoNothing()
		.returning({
			observationId: insightRecommendationApplications.observationId,
		});

	return application ? "claimed" : "already_applied";
}

/**
 * The application path accepts an observation ID from the client, so preserve
 * the recommendation inbox's latest-published projection here too. A newer
 * published observation without a recommendation intentionally withdraws the
 * older card and cannot be used to apply its stale action directly. A newer
 * quarantined row also withdraws it: never revive an older action from data we
 * now refuse to treat as current.
 */
function isLatestPublishedRecommendation(): SQL {
	return notExists(
		db
			.select({ id: newerPublishedObservation.id })
			.from(newerPublishedObservation)
			.where(
				and(
					eq(
						newerPublishedObservation.organizationId,
						insightObservations.organizationId
					),
					eq(
						newerPublishedObservation.websiteId,
						insightObservations.websiteId
					),
					eq(
						newerPublishedObservation.signalKey,
						insightObservations.signalKey
					),
					sql`${newerPublishedObservation.outcome}->>'publish' = 'true'`,
					sql`(${newerPublishedObservation.asOf}, ${newerPublishedObservation.createdAt}, ${newerPublishedObservation.id}) > (${insightObservations.asOf}, ${insightObservations.createdAt}, ${insightObservations.id})`
				)
			)
	);
}

function recommendationMatchesAction(
	action: RecommendationApplicationAction
): SQL {
	const recommendation = sql`${insightObservations.outcome}->'recommendation'`;
	const nativeAction = sql`${recommendation}->'nativeAction'`;
	const nativeActionType = sql`${nativeAction}->>'type'`;

	switch (action.type) {
		case "goal.create":
			return sql`
				(${nativeActionType} = 'goal.create'
				or ${recommendation}->>'kind' = 'goal_draft')
			`;
		case "goal.update":
			return sql`
				(
					(${nativeActionType} = 'goal.update'
						and ${nativeAction}->>'goalId' = ${action.goalId})
					or (
						${recommendation}->>'operation' = 'edit'
						and ${insightObservations.signal}->'entity'->>'type' = 'goal'
						and ${insightObservations.signal}->'entity'->>'id' = ${action.goalId}
						and exists (
							select 1
							from ${goals}
							where ${goals.id} = ${action.goalId}
								and ${goals.websiteId} = ${insightObservations.websiteId}
								and ${goals.deletedAt} is null
								and (
									(
										(${recommendation}->'changes'->>'name') is not null
										and ${goals.name} is distinct from (${recommendation}->'changes'->>'name')
									)
									or (
										(${recommendation}->'changes'->>'description') is not null
										and ${goals.description} is distinct from (${recommendation}->'changes'->>'description')
									)
								)
						)
					)
				)
			`;
		case "goal.delete":
			return sql`
				(
					(${nativeActionType} = 'goal.delete'
						and ${nativeAction}->>'goalId' = ${action.goalId})
					or (
						${recommendation}->>'operation' = 'delete'
						and ${insightObservations.signal}->'entity'->>'type' = 'goal'
						and ${insightObservations.signal}->'entity'->>'id' = ${action.goalId}
						and exists (
							select 1
							from ${goals}
							where ${goals.id} = ${action.goalId}
								and ${goals.websiteId} = ${insightObservations.websiteId}
								and ${goals.deletedAt} is null
						)
					)
				)
			`;
		case "funnel.create":
			return sql`
				(${nativeActionType} = 'funnel.create'
				or ${recommendation}->>'kind' = 'funnel_draft')
			`;
		case "feature_flag.create":
		case "target_group.create":
			return sql`${nativeActionType} = ${action.type}`;
		default:
			return sql`false`;
	}
}
