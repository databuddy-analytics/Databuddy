import type { InsightBriefItem } from "@databuddy/shared/insights";
import { Button } from "@databuddy/ui";
import Link from "next/link";

export function GoalRecommendationAction({
	goalId,
	recommendation,
	websiteId,
}: {
	goalId: string;
	recommendation: NonNullable<InsightBriefItem["recommendation"]>;
	websiteId: string;
}) {
	const { changes, operation } = recommendation;
	if (!operation) {
		return null;
	}
	const params = new URLSearchParams({
		command: `${operation}-goal`,
		goalId,
	});
	if (operation === "edit") {
		if (changes?.name) {
			params.set("suggestedName", changes.name);
		}
		if (changes?.description) {
			params.set("suggestedDescription", changes.description);
		}
	}
	const deleting = operation === "delete";
	const hasChanges = operation === "edit" && changes;

	return (
		<Button
			asChild
			size="sm"
			tone={deleting ? "destructive" : "neutral"}
			variant={deleting ? "ghost" : "secondary"}
		>
			<Link
				href={`/websites/${encodeURIComponent(websiteId)}/goals?${params.toString()}`}
			>
				{deleting
					? "Delete goal"
					: hasChanges
						? "Review goal changes"
						: "Edit goal"}
			</Link>
		</Button>
	);
}
