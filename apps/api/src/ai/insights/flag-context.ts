import { and, db, desc, eq, gte, isNull, lte, or } from "@databuddy/db";
import { flagChangeEvents } from "@databuddy/db/schema";
import type { AppContext } from "../config/context";
import dayjs from "dayjs";
import timezonePlugin from "dayjs/plugin/timezone";
import utcPlugin from "dayjs/plugin/utc";

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);

function getRangeBounds(
	range: { from: string; to: string },
	timezone: string
): { start: Date; end: Date } {
	return {
		start: dayjs.tz(range.from, timezone).startOf("day").toDate(),
		end: dayjs.tz(range.to, timezone).endOf("day").toDate(),
	};
}

export async function fetchFlagChangeContext(
	appContext: AppContext,
	range: { from: string; to: string },
	limit: number
) {
	const { start, end } = getRangeBounds(range, appContext.timezone);

	const scopeCondition = appContext.organizationId
		? or(
				eq(flagChangeEvents.websiteId, appContext.websiteId),
				and(
					eq(flagChangeEvents.organizationId, appContext.organizationId),
					isNull(flagChangeEvents.websiteId)
				)
			)
		: eq(flagChangeEvents.websiteId, appContext.websiteId);

	const rows = await db
		.select({
			after: flagChangeEvents.after,
			before: flagChangeEvents.before,
			changeType: flagChangeEvents.changeType,
			changedBy: flagChangeEvents.changedBy,
			createdAt: flagChangeEvents.createdAt,
			flagId: flagChangeEvents.flagId,
		})
		.from(flagChangeEvents)
		.where(
			and(
				scopeCondition,
				gte(flagChangeEvents.createdAt, start),
				lte(flagChangeEvents.createdAt, end)
			)
		)
		.orderBy(desc(flagChangeEvents.createdAt))
		.limit(limit);

	return {
		flag_changes: rows.map((row) => {
			const before = row.before ?? null;
			const after = row.after ?? null;
			return {
				change_type: row.changeType,
				changed_at: row.createdAt.toISOString(),
				changed_by: row.changedBy,
				flag_id: row.flagId,
				flag_key: after?.key ?? before?.key ?? row.flagId,
				flag_name: after?.name ?? before?.name ?? null,
				before_status: before?.status ?? null,
				after_status: after?.status ?? null,
				before_rollout_percentage: before?.rolloutPercentage ?? null,
				after_rollout_percentage: after?.rolloutPercentage ?? null,
				environment: after?.environment ?? before?.environment ?? null,
			};
		}),
	};
}
