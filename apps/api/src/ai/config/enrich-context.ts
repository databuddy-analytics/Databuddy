import { and, count, db, desc, eq, gte, isNull } from "@databuddy/db";
import {
	analyticsInsights,
	annotations,
	funnelDefinitions,
	goals,
	links,
} from "@databuddy/db/schema";
import { getBillingOwner } from "@databuddy/rpc";
import {
	getPlanCapabilities,
	type PlanId,
} from "@databuddy/shared/types/features";

/**
 * Fetch plan/tier info and capabilities for the current user.
 * Returns an XML string describing the plan and enabled features.
 */
export async function fetchPlanContext(
	userId: string,
	organizationId: string | null
): Promise<string> {
	try {
		const { planId } = await getBillingOwner(userId, organizationId);
		const capabilities = getPlanCapabilities(planId as PlanId);

		const featureSummary = Object.entries(capabilities.features)
			.map(([key, enabled]) => `${key}: ${enabled ? "true" : "false"}`)
			.join(", ");

		const limitSummary = Object.entries(capabilities.limits)
			.filter(([, v]) => v !== false)
			.map(([key, limit]) => `${key}: ${limit}`)
			.join(", ");

		return `<plan_info>
<plan>${planId}</plan>
<features>${featureSummary}</features>
<limits>${limitSummary}</limits>
</plan_info>`;
	} catch {
		return "";
	}
}

/**
 * Fetch entity counts (goals, funnels, links, annotations) scoped to the
 * current website/organization. Returns an XML string with the counts.
 */
export async function fetchEntityCounts(
	websiteId: string,
	organizationId: string | null
): Promise<string> {
	try {
		const [goalRows, funnelRows, linkRows, annotationRows] = await Promise.all([
			db
				.select({ value: count() })
				.from(goals)
				.where(and(eq(goals.websiteId, websiteId), isNull(goals.deletedAt))),
			db
				.select({ value: count() })
				.from(funnelDefinitions)
				.where(
					and(
						eq(funnelDefinitions.websiteId, websiteId),
						isNull(funnelDefinitions.deletedAt)
					)
				),
			organizationId
				? db
						.select({ value: count() })
						.from(links)
						.where(
							and(
								eq(links.organizationId, organizationId),
								isNull(links.deletedAt)
							)
						)
				: Promise.resolve([{ value: 0 }]),
			db
				.select({ value: count() })
				.from(annotations)
				.where(
					and(
						eq(annotations.websiteId, websiteId),
						isNull(annotations.deletedAt)
					)
				),
		]);

		const goalCount = goalRows[0]?.value ?? 0;
		const funnelCount = funnelRows[0]?.value ?? 0;
		const linkCount = linkRows[0]?.value ?? 0;
		const annotationCount = annotationRows[0]?.value ?? 0;

		return `<existing_entities>
<goals>${goalCount}</goals>
<funnels>${funnelCount}</funnels>
<links>${linkCount}</links>
<annotations>${annotationCount}</annotations>
</existing_entities>`;
	} catch {
		return "";
	}
}

/**
 * Fetch recent analytics insights (last 14 days) for the given website.
 * Returns an XML string summarising the latest anomalies and insights.
 */
export async function fetchRecentInsights(
	organizationId: string | null,
	websiteId: string
): Promise<string> {
	try {
		if (!organizationId) {
			return "";
		}

		const fourteenDaysAgo = new Date();
		fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

		const rows = await db
			.select({
				title: analyticsInsights.title,
				type: analyticsInsights.type,
				severity: analyticsInsights.severity,
				changePercent: analyticsInsights.changePercent,
				createdAt: analyticsInsights.createdAt,
			})
			.from(analyticsInsights)
			.where(
				and(
					eq(analyticsInsights.organizationId, organizationId),
					eq(analyticsInsights.websiteId, websiteId),
					gte(analyticsInsights.createdAt, fourteenDaysAgo)
				)
			)
			.orderBy(desc(analyticsInsights.createdAt))
			.limit(8);

		if (rows.length === 0) {
			return "";
		}

		const lines = rows.map((row) => {
			const date = row.createdAt.toISOString().slice(0, 10);
			const pct =
				row.changePercent == null
					? ""
					: ` ${row.changePercent > 0 ? "+" : ""}${Math.round(row.changePercent)}%`;
			const severityTag =
				row.severity === "critical" || row.severity === "warning"
					? `${row.severity}:`
					: "";
			const tag = severityTag ? `${severityTag}${row.type}` : row.type;
			return `- [${tag}] ${row.title}${pct} (${date})`;
		});

		return `<recent_insights>
${lines.join("\n")}
</recent_insights>`;
	} catch {
		return "";
	}
}

/**
 * Enrich the agent context with plan info, entity counts, and recent insights.
 * Runs all enrichment queries in parallel. Each enrichment is best-effort and
 * will silently return an empty string on failure.
 */
export async function enrichAgentContext(opts: {
	userId: string;
	websiteId: string;
	organizationId: string | null;
}): Promise<string> {
	const [planCtx, entityCtx, insightsCtx] = await Promise.all([
		fetchPlanContext(opts.userId, opts.organizationId),
		fetchEntityCounts(opts.websiteId, opts.organizationId),
		fetchRecentInsights(opts.organizationId, opts.websiteId),
	]);

	return [planCtx, entityCtx, insightsCtx].filter(Boolean).join("\n");
}
