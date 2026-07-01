import { and, count, db, desc, eq, gte, isNull } from "@databuddy/db";
import {
	analyticsInsights,
	annotations,
	funnelDefinitions,
	goals,
	links,
} from "@databuddy/db/schema";
import { getBillingOwner } from "@databuddy/rpc/billing";
import {
	getPlanCapabilities,
	type PlanId,
} from "@databuddy/shared/types/features";
import { captureError } from "../../lib/tracing";

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
	} catch (err) {
		captureError(err, { enrich_context_step: "plan", user_id: userId });
		return "";
	}
}

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

		return `<existing_entities>
<goals>${goalRows[0]?.value ?? 0}</goals>
<funnels>${funnelRows[0]?.value ?? 0}</funnels>
<links>${linkRows[0]?.value ?? 0}</links>
<annotations>${annotationRows[0]?.value ?? 0}</annotations>
</existing_entities>`;
	} catch (err) {
		captureError(err, {
			enrich_context_step: "entity_counts",
			website_id: websiteId,
		});
		return "";
	}
}

export async function fetchRecentInsights(
	organizationId: string | null,
	websiteId: string
): Promise<string> {
	if (!organizationId) {
		return "";
	}
	try {
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
					eq(analyticsInsights.status, "open"),
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
	} catch (err) {
		captureError(err, {
			enrich_context_step: "insights",
			website_id: websiteId,
		});
		return "";
	}
}

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
