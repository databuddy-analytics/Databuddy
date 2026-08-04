import { executeInsightsSetupCoverageQuery } from "@databuddy/ai/query";
import { and, count, db, eq, inArray, isNull, or, sql } from "@databuddy/db";
import {
	flags,
	funnelDefinitions,
	goals,
	revenueConfig,
	targetGroups,
} from "@databuddy/db/schema";
import type { InvestigationSignal } from "@databuddy/shared/insights";

const FLAG_TYPES = ["boolean", "rollout", "multivariant"] as const;

type FlagType = (typeof FLAG_TYPES)[number];
type SetupCoverageQuery = typeof executeInsightsSetupCoverageQuery;

export interface DatabuddySetupContext {
	configurationState: "current";
	conversionMeasurement: {
		activeFunnels: number;
		activeGoals: number;
	};
	customEvents: {
		eventTypes: number;
		sessionsWithCustomEvents: number;
	};
	identity: {
		coveragePercent: number | null;
		identifiedProfiles: number;
		identifiedSessions: number;
		trackedSessions: number;
	};
	observedPeriod: {
		from: string;
		to: string;
	};
	releases: {
		activeFlags: Record<FlagType, number>;
		inactiveFlags: number;
		targetGroups: number;
	};
	revenue: {
		paddleConfigured: boolean;
		stripeConfigured: boolean;
		websiteConfigPresent: boolean;
	};
	traffic: {
		pageviews: number;
		sessions: number;
	};
}

export interface DatabuddySetupConfiguration {
	activeFlags: Record<FlagType, number>;
	activeFunnels: number;
	activeGoals: number;
	inactiveFlags: number;
	paddleConfigured: boolean;
	stripeConfigured: boolean;
	targetGroups: number;
	websiteRevenueConfigPresent: boolean;
}

export interface DatabuddySetupContextDependencies {
	fetchConfiguration?: (params: {
		organizationId: string;
		websiteId: string;
	}) => Promise<DatabuddySetupConfiguration>;
	query?: SetupCoverageQuery;
}

function nonNegativeInteger(value: unknown, field: string): number {
	if (
		value === null ||
		value === undefined ||
		(typeof value === "string" && value.trim() === "")
	) {
		throw new Error(`Invalid ${field} in Databuddy setup coverage result`);
	}
	const number = Number(value);
	if (!Number.isSafeInteger(number) || number < 0) {
		throw new Error(`Invalid ${field} in Databuddy setup coverage result`);
	}
	return number;
}

function activeFlags(): Record<FlagType, number> {
	return { boolean: 0, multivariant: 0, rollout: 0 };
}

function isFlagType(value: string): value is FlagType {
	return FLAG_TYPES.includes(value as FlagType);
}

export function parseDatabuddySetupCoverage(
	row: Record<string, unknown> | undefined
): Omit<
	DatabuddySetupContext,
	| "configurationState"
	| "conversionMeasurement"
	| "observedPeriod"
	| "releases"
	| "revenue"
> | null {
	if (!row) {
		return null;
	}
	const traffic = {
		pageviews: nonNegativeInteger(row.pageviews, "pageviews"),
		sessions: nonNegativeInteger(row.tracked_sessions, "tracked_sessions"),
	};
	const identity = {
		identifiedProfiles: nonNegativeInteger(
			row.identified_profiles,
			"identified_profiles"
		),
		identifiedSessions: nonNegativeInteger(
			row.identified_sessions,
			"identified_sessions"
		),
		trackedSessions: traffic.sessions,
	};
	const customEvents = {
		eventTypes: nonNegativeInteger(
			row.custom_event_types,
			"custom_event_types"
		),
		sessionsWithCustomEvents: nonNegativeInteger(
			row.sessions_with_custom_events,
			"sessions_with_custom_events"
		),
	};
	if (
		traffic.pageviews < traffic.sessions ||
		identity.identifiedSessions > identity.trackedSessions ||
		identity.identifiedProfiles > identity.identifiedSessions
	) {
		throw new Error("Inconsistent Databuddy setup coverage result");
	}
	return {
		customEvents,
		identity: {
			coveragePercent:
				identity.trackedSessions === 0
					? null
					: Math.round(
							(identity.identifiedSessions / identity.trackedSessions) * 1000
						) / 10,
			...identity,
		},
		traffic,
	};
}

export async function defaultDatabuddySetupConfiguration(params: {
	organizationId: string;
	websiteId: string;
}): Promise<DatabuddySetupConfiguration> {
	const [goalRows, funnelRows, flagRows, targetGroupRows, revenueRows] =
		await Promise.all([
			db
				.select({ value: count() })
				.from(goals)
				.where(
					and(
						eq(goals.websiteId, params.websiteId),
						eq(goals.isActive, true),
						isNull(goals.deletedAt)
					)
				),
			db
				.select({ value: count() })
				.from(funnelDefinitions)
				.where(
					and(
						eq(funnelDefinitions.websiteId, params.websiteId),
						eq(funnelDefinitions.isActive, true),
						isNull(funnelDefinitions.deletedAt)
					)
				),
			db
				.select({ status: flags.status, type: flags.type, value: count() })
				.from(flags)
				.where(
					and(
						or(
							eq(flags.websiteId, params.websiteId),
							eq(flags.organizationId, params.organizationId)
						),
						isNull(flags.userId),
						isNull(flags.deletedAt),
						inArray(flags.status, ["active", "inactive"])
					)
				)
				.groupBy(flags.status, flags.type),
			db
				.select({ value: count() })
				.from(targetGroups)
				.where(
					and(
						eq(targetGroups.websiteId, params.websiteId),
						isNull(targetGroups.deletedAt)
					)
				),
			db
				.select({
					paddleConfigured: sql<boolean>`${revenueConfig.paddleWebhookSecret} IS NOT NULL`,
					stripeConfigured: sql<boolean>`${revenueConfig.stripeWebhookSecret} IS NOT NULL`,
				})
				.from(revenueConfig)
				.where(
					and(
						eq(revenueConfig.ownerId, params.organizationId),
						eq(revenueConfig.websiteId, params.websiteId)
					)
				)
				.limit(1),
		]);
	const configuredFlags = activeFlags();
	let inactiveFlags = 0;
	for (const row of flagRows) {
		const value = nonNegativeInteger(row.value, "flag count");
		if (row.status === "active" && isFlagType(row.type)) {
			configuredFlags[row.type] += value;
		} else if (row.status === "inactive") {
			inactiveFlags += value;
		}
	}
	const revenue = revenueRows[0];
	return {
		activeFlags: configuredFlags,
		activeFunnels: nonNegativeInteger(funnelRows[0]?.value, "active_funnels"),
		activeGoals: nonNegativeInteger(goalRows[0]?.value, "active_goals"),
		inactiveFlags,
		paddleConfigured: revenue?.paddleConfigured ?? false,
		stripeConfigured: revenue?.stripeConfigured ?? false,
		targetGroups: nonNegativeInteger(
			targetGroupRows[0]?.value,
			"target_groups"
		),
		websiteRevenueConfigPresent: revenue !== undefined,
	};
}

/**
 * Loads a private, aggregate snapshot of configured Databuddy surfaces and
 * current-period coverage. It is context for an investigation, not evidence
 * of product intent and never enables mutations.
 */
export async function loadDatabuddySetupContext(
	params: {
		abortSignal?: AbortSignal;
		organizationId: string;
		signal: InvestigationSignal;
		timezone: string;
		websiteId: string;
	},
	dependencies: DatabuddySetupContextDependencies = {}
): Promise<DatabuddySetupContext | null> {
	const query = dependencies.query ?? executeInsightsSetupCoverageQuery;
	const fetchConfiguration =
		dependencies.fetchConfiguration ?? defaultDatabuddySetupConfiguration;
	const [coverageRows, configuration] = await Promise.all([
		query(
			{
				from: params.signal.period.current.from,
				projectId: params.websiteId,
				to: params.signal.period.current.to,
				timezone: params.timezone,
			},
			undefined,
			params.timezone,
			params.abortSignal
		),
		fetchConfiguration({
			organizationId: params.organizationId,
			websiteId: params.websiteId,
		}),
	]);
	const coverage = parseDatabuddySetupCoverage(coverageRows[0]);
	if (!coverage) {
		return null;
	}
	return {
		...coverage,
		configurationState: "current",
		conversionMeasurement: {
			activeFunnels: configuration.activeFunnels,
			activeGoals: configuration.activeGoals,
		},
		observedPeriod: params.signal.period.current,
		releases: {
			activeFlags: configuration.activeFlags,
			inactiveFlags: configuration.inactiveFlags,
			targetGroups: configuration.targetGroups,
		},
		revenue: {
			paddleConfigured: configuration.paddleConfigured,
			stripeConfigured: configuration.stripeConfigured,
			websiteConfigPresent: configuration.websiteRevenueConfigPresent,
		},
	};
}
