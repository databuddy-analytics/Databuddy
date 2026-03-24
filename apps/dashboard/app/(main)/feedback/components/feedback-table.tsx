"use client";

import { ChatTextIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import dayjs from "@/lib/dayjs";
import { orpc } from "@/lib/orpc";
import { FeedbackStatusBadge } from "./feedback-status-badge";

const CATEGORY_LABELS: Record<string, string> = {
	bug_report: "Bug Report",
	feature_request: "Feature Request",
	ux_improvement: "UX Improvement",
	performance: "Performance",
	documentation: "Documentation",
	other: "Other",
};

export function FeedbackTable() {
	const { data: items, isLoading } = useQuery(
		orpc.feedback.list.queryOptions({ input: {} })
	);

	if (isLoading) {
		return (
			<div className="divide-y">
				{Array.from({ length: 4 }).map((_, i) => (
					<div className="flex items-center gap-4 p-4" key={`fb-skel-${i}`}>
						<div className="flex-1 space-y-2">
							<Skeleton className="h-4 w-48 rounded" />
							<Skeleton className="h-3 w-64 rounded" />
							<Skeleton className="h-3 w-24 rounded" />
						</div>
						<Skeleton className="h-5 w-16 rounded" />
					</div>
				))}
			</div>
		);
	}

	if (!items || items.length === 0) {
		return (
			<EmptyState
				className="py-16"
				description="Submit your first feedback to start earning credits"
				icon={<ChatTextIcon />}
				title="No feedback yet"
				variant="minimal"
			/>
		);
	}

	return (
		<div className="divide-y">
			{items.map((item) => (
				<div
					className="flex flex-col gap-1.5 p-4 transition-colors hover:bg-accent/30 sm:flex-row sm:items-start sm:gap-4"
					key={item.id}
				>
					<div className="min-w-0 flex-1 space-y-1">
						<div className="flex items-center gap-2">
							<p className="truncate font-medium text-sm">{item.title}</p>
							<FeedbackStatusBadge status={item.status} />
						</div>
						<p className="line-clamp-2 text-muted-foreground text-xs leading-relaxed">
							{item.description}
						</p>
						<p className="text-muted-foreground/70 text-xs">
							{CATEGORY_LABELS[item.category] ?? item.category}
							{" · "}
							{dayjs(item.createdAt).fromNow()}
						</p>
					</div>
					{item.status === "approved" && item.creditsAwarded > 0 && (
						<span className="shrink-0 self-start font-semibold text-green-600 text-sm tabular-nums dark:text-green-400">
							+{item.creditsAwarded}
						</span>
					)}
				</div>
			))}
		</div>
	);
}
