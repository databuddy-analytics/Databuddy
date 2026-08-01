"use client";

import { authClient } from "@databuddy/auth/client";
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
	const memberRole = authClient.useActiveMemberRole();
	const accessReason = memberRole.isPending
		? "Checking access…"
		: memberRole.data?.role === "viewer"
			? "You have view-only access to this website."
			: memberRole.data
				? null
				: "You need edit access to change this goal.";
	const label = deleting ? "Delete goal" : "Review goal changes";

	if (accessReason) {
		return (
			<div className="space-y-1.5 sm:max-w-48">
				<Button
					disabled
					size="sm"
					tone={deleting ? "destructive" : "neutral"}
					type="button"
					variant={deleting ? "ghost" : "primary"}
				>
					{label}
				</Button>
				<p className="text-muted-foreground text-xs sm:text-right">
					{accessReason}
				</p>
			</div>
		);
	}

	return (
		<Button
			asChild
			size="sm"
			tone={deleting ? "destructive" : "neutral"}
			variant={deleting ? "ghost" : "primary"}
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
				{label}
			</Link>
		</Button>
	);
}
