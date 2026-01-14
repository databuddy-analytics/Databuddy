import { BugIcon, UsersIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import type { ErrorType } from "./types";

interface TopErrorCardProps {
	topError: ErrorType | null;
}

export const TopErrorCard = ({ topError }: TopErrorCardProps) => {
	if (!topError) {
		return (
			<div className="flex flex-1 flex-col rounded border bg-card">
				<div className="flex items-center gap-3 border-b px-3 py-2.5 sm:px-4 sm:py-3">
					<div className="flex size-8 items-center justify-center rounded bg-accent">
						<BugIcon
							className="size-4 text-muted-foreground"
							weight="duotone"
						/>
					</div>
					<div className="min-w-0 flex-1">
						<h3 className="font-semibold text-foreground text-sm">
							Most Frequent Error
						</h3>
						<p className="text-muted-foreground text-xs">No errors detected</p>
					</div>
				</div>
				<div className="flex flex-1 items-center justify-center p-4">
					<p className="text-center text-muted-foreground text-sm">
						No errors in the selected period
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-1 flex-col rounded border bg-card">
			<div className="flex items-center gap-3 border-b px-3 py-2.5 sm:px-4 sm:py-3">
				<div className="flex size-8 items-center justify-center rounded bg-destructive/10">
					<BugIcon className="size-4 text-destructive" weight="duotone" />
				</div>
				<div className="min-w-0 flex-1">
					<h3 className="font-semibold text-foreground text-sm">
						Most Frequent Error
					</h3>
					<p className="text-muted-foreground text-xs">Top occurring error</p>
				</div>
				<Badge className="shrink-0" variant="destructive">
					<span className="font-mono text-[10px]">CRITICAL</span>
				</Badge>
			</div>

			<div className="flex-1 bg-muted/30 p-3 sm:p-4">
				<p
					className="line-clamp-2 font-mono text-foreground text-sm leading-relaxed"
					title={topError.name}
				>
					{topError.name}
				</p>
				{topError.last_seen && (
					<p className="mt-2 font-mono text-[10px] text-muted-foreground">
						Last seen: {topError.last_seen}
					</p>
				)}
			</div>

			<div className="grid grid-cols-2 gap-2 border-t bg-accent/30 p-3">
				<div className="flex items-center gap-2 rounded border bg-card p-2">
					<WarningCircleIcon
						className="size-4 shrink-0 text-destructive"
						weight="duotone"
					/>
					<div className="min-w-0">
						<div className="font-semibold text-foreground text-sm tabular-nums">
							{(topError.count || 0).toLocaleString()}
						</div>
						<div className="text-[10px] text-muted-foreground">occurrences</div>
					</div>
				</div>
				<div className="flex items-center gap-2 rounded border bg-card p-2">
					<UsersIcon
						className="size-4 shrink-0 text-chart-2"
						weight="duotone"
					/>
					<div className="min-w-0">
						<div className="font-semibold text-foreground text-sm tabular-nums">
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
