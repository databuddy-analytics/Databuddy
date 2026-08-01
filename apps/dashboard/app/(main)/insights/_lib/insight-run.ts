export interface LatestRunSummary {
	analyzedSignalCount: number;
	analyzedWebsiteCount: number;
	completedItems: number;
	failedItems: number;
	id: string;
	insightCount: number;
	skippedItems: number;
	status:
		| "failed"
		| "partially_succeeded"
		| "queued"
		| "running"
		| "skipped"
		| "succeeded";
	totalItems: number;
}

export function isActiveRun(status: string | undefined): boolean {
	return status === "queued" || status === "running";
}

function countLabel(count: number, singular: string): string {
	return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

export function latestRunDescription(
	run: LatestRunSummary | null | undefined
): string {
	if (!run) {
		return "What changed and why it matters.";
	}
	if (isActiveRun(run.status)) {
		return "Analyzing your websites…";
	}
	if (run.status === "failed") {
		if (run.analyzedSignalCount === 0) {
			return "The latest analysis couldn't finish. Try again.";
		}
		return `Latest analysis examined ${countLabel(run.analyzedSignalCount, "signal")} and found ${run.insightCount === 0 ? "nothing noteworthy" : countLabel(run.insightCount, "noteworthy insight")}, but couldn't finish.`;
	}
	if (run.status === "skipped") {
		return run.totalItems === 0
			? "No websites were available to analyze."
			: "The latest analysis finished without publishing new insights.";
	}

	const reviewed = run.completedItems + run.skippedItems;
	const findings =
		run.insightCount === 0
			? "none were noteworthy"
			: `${run.insightCount.toLocaleString("en-US")} ${run.insightCount === 1 ? "was" : "were"} noteworthy`;
	const coverage =
		run.analyzedSignalCount === 0
			? `reviewed ${countLabel(reviewed, "website")}`
			: `examined ${countLabel(run.analyzedSignalCount, "signal")} across ${countLabel(run.analyzedWebsiteCount, "website")}`;
	if (run.status === "partially_succeeded") {
		return `Latest analysis ${coverage}; ${findings}. ${countLabel(run.failedItems, "website")} couldn't finish.`;
	}
	return `Latest analysis ${coverage}; ${findings}.`;
}
