export interface GoalForGrouping {
	createdAt: Date | null;
	filters: unknown;
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

	const createdDate = new Date(createdAt).toISOString().split("T")[0];
	return new Date(requestedStartDate) > new Date(createdDate)
		? requestedStartDate
		: createdDate;
};

export interface BatchChunk<TGoal extends GoalForGrouping> {
	effectiveStartDate: string;
	goals: TGoal[];
}

export interface GroupedGoalsForBulkAnalytics<
	TGoal extends GoalForGrouping,
	TFilter,
> {
	batchChunks: BatchChunk<TGoal>[];
	individualGoals: { combinedFilters: TFilter[]; goal: TGoal }[];
}

export function groupGoalsForBulkAnalytics<
	TGoal extends GoalForGrouping,
	TFilter,
>(
	goalsList: TGoal[],
	requestFilters: TFilter[],
	startDate: string,
	chunkSize: number
): GroupedGoalsForBulkAnalytics<TGoal, TFilter> {
	const batchGroups = new Map<string, TGoal[]>();
	const individualGoals: { combinedFilters: TFilter[]; goal: TGoal }[] = [];

	for (const goal of goalsList) {
		const filters = (goal.filters as TFilter[]) || [];
		const combinedFilters = [...requestFilters, ...filters];
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
