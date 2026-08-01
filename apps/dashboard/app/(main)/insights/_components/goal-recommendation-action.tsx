import Link from "next/link";
import { Button } from "@databuddy/ui";
import type { GoalRecommendation } from "./recommendation-guards";

export function GoalRecommendationAction({
	goalId,
	recommendation,
	websiteId,
}: {
	goalId: string;
	recommendation: GoalRecommendation;
	websiteId: string;
}) {
	const deleting = recommendation.operation === "delete";

	return (
		<Button
			asChild
			size="sm"
			tone={deleting ? "destructive" : "neutral"}
			variant={deleting ? "ghost" : "secondary"}
		>
			<Link
				href={{
					pathname: `/websites/${encodeURIComponent(websiteId)}/goals`,
					query: {
						command: `${recommendation.operation}-goal`,
						goalId,
						...(recommendation.changes?.description
							? { description: recommendation.changes.description }
							: {}),
						...(recommendation.changes?.name
							? { name: recommendation.changes.name }
							: {}),
					},
				}}
			>
				{deleting ? "Delete goal" : "Review goal changes"}
			</Link>
		</Button>
	);
}
