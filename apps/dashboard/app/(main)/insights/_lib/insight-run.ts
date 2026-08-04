export interface LatestRunSummary {
	analyzedSignalCount: number;
	analyzedWebsiteCount: number;
	attentionCount: number;
	completedItems: number;
	failedItems: number;
	id: string;
	insightCount: number;
	monitoringCount: number;
	publishedRecommendationCount: number;
	resolvedCount: number;
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

export interface LatestRunOutcomeItem {
	count: number;
	href?: "/insights/investigations" | "/insights/recommendations";
	label: string;
	tone?: "attention";
}

export interface LatestRunOutcomeSummary {
	headline: string;
	items: LatestRunOutcomeItem[];
}

export function isActiveRun(status: string | undefined): boolean {
	return status === "queued" || status === "running";
}

function countLabel(count: number, singular: string): string {
	return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function hasOutcomeItems(run: LatestRunSummary): boolean {
	return (
		run.attentionCount > 0 ||
		run.monitoringCount > 0 ||
		run.resolvedCount > 0 ||
		run.publishedRecommendationCount > 0
	);
}

export function latestRunDescription(
	run: LatestRunSummary | null | undefined
): string | null {
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
	if (run.status === "partially_succeeded") {
		return `${countLabel(run.failedItems, "website")} couldn't finish.`;
	}
	if (!hasOutcomeItems(run)) {
		return run.analyzedSignalCount === 0
			? "No changes were found."
			: "Latest analysis completed.";
	}
	return null;
}

export function latestRunOutcomeSummary(
	run: LatestRunSummary | null | undefined
): LatestRunOutcomeSummary | null {
	if (
		!run ||
		run.analyzedSignalCount === 0 ||
		(run.status !== "succeeded" && run.status !== "partially_succeeded")
	) {
		return null;
	}

	const items: LatestRunOutcomeItem[] = [];
	if (run.attentionCount > 0) {
		items.push({
			count: run.attentionCount,
			href: "/insights/investigations",
			label: "awaiting input",
			tone: "attention",
		});
	}
	if (run.monitoringCount > 0) {
		items.push({ count: run.monitoringCount, label: "under watch" });
	}
	if (run.resolvedCount > 0) {
		items.push({ count: run.resolvedCount, label: "no follow-up" });
	}
	if (run.publishedRecommendationCount > 0) {
		items.push({
			count: run.publishedRecommendationCount,
			label: `recommendation${run.publishedRecommendationCount === 1 ? "" : "s"} published`,
		});
	}
	if (!hasOutcomeItems(run) || items.length === 0) {
		return null;
	}

	return {
		headline: `${countLabel(run.analyzedSignalCount, "change")} analyzed · ${run.insightCount === 0 ? "none published" : `${countLabel(run.insightCount, "finding")} published`}`,
		items,
	};
}
