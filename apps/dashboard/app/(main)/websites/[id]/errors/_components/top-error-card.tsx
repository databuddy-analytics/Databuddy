import { BugIcon, UsersIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import type { ErrorType } from "./types";

interface TopErrorCardProps {
	topError: ErrorType | null;
}

export const TopErrorCard = ({ topError }: TopErrorCardProps) => {
	if (!topError) {
		return (
			<div className="flex h-full flex-col overflow-hidden rounded border border-border bg-card">
				<div className="flex items-center gap-3 border-border/50 border-b p-4">
					<div className="flex size-8 items-center justify-center rounded bg-accent">
						<BugIcon
							className="size-4 text-muted-foreground"
							weight="duotone"
						/>
					</div>
					<div className="flex flex-col gap-0.5">
						<span className="font-medium text-foreground text-sm">
							Most Frequent Error
						</span>
						<span className="text-muted-foreground text-xs">
							No errors detected
						</span>
					</div>
				</div>
				<div className="flex flex-1 items-center justify-center p-6">
					<p className="text-center text-muted-foreground text-sm">
						No errors in the selected period
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col overflow-hidden rounded border border-border bg-card">
			{/* Header */}
			<div className="flex items-center gap-3 border-border/50 border-b p-4">
				<div className="flex size-8 items-center justify-center rounded bg-destructive/10">
					<BugIcon className="size-4 text-destructive" weight="duotone" />
				</div>
				<div className="flex flex-col gap-0.5">
					<span className="font-medium text-foreground text-sm">
						Most Frequent Error
					</span>
					<span className="text-muted-foreground text-xs">
						Top occurring error
					</span>
				</div>
				<Badge className="ml-auto" variant="destructive">
					<span className="font-mono text-[10px]">CRITICAL</span>
				</Badge>
			</div>

			{/* Error Message */}
			<div className="flex-1 p-4">
				<div className="space-y-3">
					<p
						className="line-clamp-2 font-mono text-accent-foreground text-sm leading-relaxed"
						title={topError.name}
					>
						{topError.name}
					</p>
					<div className="rounded border border-border bg-accent/30 p-2">
						<p className="font-mono text-[10px] text-muted-foreground">
							Last seen: {topError.last_seen || "Recently"}
						</p>
					</div>
				</div>
			</div>

			{/* Stats Footer */}
			<div className="grid grid-cols-2 gap-2 border-border/50 border-t bg-accent/20 p-3">
				<div className="flex items-center gap-2 rounded border border-destructive/10 bg-destructive/5 p-2">
					<WarningCircleIcon
						className="size-4 shrink-0 text-destructive"
						weight="duotone"
					/>
					<div className="min-w-0">
						<div className="font-semibold text-destructive text-sm tabular-nums">
							{(topError.count || 0).toLocaleString()}
						</div>
						<div className="text-[10px] text-muted-foreground">occurrences</div>
					</div>
				</div>
				<div className="flex items-center gap-2 rounded border border-chart-2/10 bg-chart-2/5 p-2">
					<UsersIcon
						className="size-4 shrink-0 text-chart-2"
						weight="duotone"
					/>
					<div className="min-w-0">
						<div className="font-semibold text-chart-2 text-sm tabular-nums">
							{(topError.users || 0).toLocaleString()}
						</div>
						<div className="text-[10px] text-muted-foreground">
							users affected
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};
