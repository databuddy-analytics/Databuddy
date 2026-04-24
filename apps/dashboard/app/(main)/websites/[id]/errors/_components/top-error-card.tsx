import { BugIcon, UsersIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Card } from "@/components/ds/card";
import { Skeleton } from "@/components/ds/skeleton";
import type { ErrorType } from "./types";

interface TopErrorCardProps {
	isLoading?: boolean;
	topError: ErrorType | null;
}

export const TopErrorCard = ({ isLoading, topError }: TopErrorCardProps) => {
	if (isLoading) {
		return (
			<Card className="flex-1">
				<Card.Header className="py-3">
					<div className="flex items-center gap-2">
						<BugIcon className="size-4 text-muted-foreground" />
						<Card.Title className="text-sm">Most Frequent Error</Card.Title>
					</div>
				</Card.Header>
				<Card.Content className="flex-1 space-y-2">
					<Skeleton className="h-4 w-full rounded" />
					<Skeleton className="h-4 w-3/4 rounded" />
				</Card.Content>
			</Card>
		);
	}

	return (
		<Card className="flex-1">
			<Card.Header className="py-3">
				<div className="flex items-center gap-2">
					<BugIcon
						className={`size-4 ${topError ? "text-destructive" : "text-muted-foreground"}`}
					/>
					<Card.Title className="text-sm">Most Frequent Error</Card.Title>
				</div>
			</Card.Header>

			{topError ? (
				<>
					<Card.Content className="flex-1">
						<p
							className="line-clamp-2 font-mono text-foreground text-sm"
							title={topError.name}
						>
							{topError.name}
						</p>
						{topError.last_seen && (
							<p className="mt-2 text-muted-foreground text-xs">
								Last seen {topError.last_seen}
							</p>
						)}
					</Card.Content>

					<div className="grid grid-cols-2 gap-px border-border/60 border-t bg-border/60">
						<div className="flex items-center gap-2 bg-card px-4 py-3">
							<WarningCircleIcon className="size-4 shrink-0 text-destructive" />
							<div className="min-w-0">
								<div className="font-semibold text-foreground text-sm tabular-nums">
									{(topError.count || 0).toLocaleString()}
								</div>
								<div className="text-muted-foreground text-xs">occurrences</div>
							</div>
						</div>
						<div className="flex items-center gap-2 bg-card px-4 py-3">
							<UsersIcon className="size-4 shrink-0 text-muted-foreground" />
							<div className="min-w-0">
								<div className="font-semibold text-foreground text-sm tabular-nums">
									{(topError.users || 0).toLocaleString()}
								</div>
								<div className="text-muted-foreground text-xs">
									users affected
								</div>
							</div>
						</div>
					</div>
				</>
			) : (
				<Card.Content className="flex flex-1 items-center justify-center">
					<p className="text-muted-foreground text-sm">
						No errors in the selected period
					</p>
				</Card.Content>
			)}
		</Card>
	);
};
