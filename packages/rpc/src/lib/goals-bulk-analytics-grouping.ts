import type { DataFilter } from "@databuddy/db/schema";

export interface GoalForGrouping {
	createdAt: Date | null;
	filters: DataFilter[] | null;
	id: string;
	ignoreHistoricData: boolean;
}

export const getEffectiveStartDate = (
	requestedStartDate: string,
	createdAt: Date | null,
	ignoreHistoricData: boolean
): string => {
	if (!(ignoreHistoricData && createdAt)) {
		return requestedStartDate;
	}

	const createdDate = new Date(createdAt).toISOString().slice(0, 10);
	return new Date(requestedStartDate) > new Date(createdDate)
		? requestedStartDate
		: createdDate;
};

export interface BatchChunk<TGoal extends GoalForGrouping> {
	effectiveStartDate: string;
	goals: TGoal[];
}

export interface IndividualGoal<TGoal extends GoalForGrouping> {
	combinedFilters: DataFilter[];
	goal: TGoal;
}

export interface GroupedGoalsForBulkAnalytics<TGoal extends GoalForGrouping> {
	batchChunks: BatchChunk<TGoal>[];
	individualGoals: IndividualGoal<TGoal>[];
}

export function groupGoalsForBulkAnalytics<TGoal extends GoalForGrouping>(
	goalsList: TGoal[],
	requestFilters: DataFilter[],
	startDate: string,
	chunkSize: number
): GroupedGoalsForBulkAnalytics<TGoal> {
	const batchGroups = new Map<string, TGoal[]>();
	const individualGoals: IndividualGoal<TGoal>[] = [];

	for (const goal of goalsList) {
		const combinedFilters = [...requestFilters, ...(goal.filters ?? [])];
		if (combinedFilters.length > 0) {
			individualGoals.push({ goal, combinedFilters });
			continue;
		}

		const effectiveStartDate = getEffectiveStartDate(
			startDate,
			goal.createdAt,
			goal.ignoreHistoricData
		);
		const group = batchGroups.get(effectiveStartDate) ?? [];
		group.push(goal);
		batchGroups.set(effectiveStartDate, group);
	}

	const batchChunks: BatchChunk<TGoal>[] = [];
	for (const [effectiveStartDate, groupGoals] of batchGroups) {
		for (let i = 0; i < groupGoals.length; i += chunkSize) {
			batchChunks.push({
				effectiveStartDate,
				goals: groupGoals.slice(i, i + chunkSize),
			});
		}
	}

	return { batchChunks, individualGoals };
}
