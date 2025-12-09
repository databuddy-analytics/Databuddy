import {
	ActivityIcon,
	TrendUpIcon,
	UsersIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { ErrorSummary } from "./types";

interface ErrorSummaryStatsProps {
	errorSummary: ErrorSummary;
}

function ErrorStatCard({
	title,
	value,
	icon: Icon,
	description,
	variant = "default",
}: {
	title: string;
	value: string;
	icon: typeof WarningCircleIcon;
	description: string;
	variant?: "default" | "destructive" | "warning";
}) {
	const variantStyles = {
		default: {
			iconBg: "bg-accent",
			iconColor: "text-muted-foreground",
		},
		destructive: {
			iconBg: "bg-destructive/10",
			iconColor: "text-destructive",
		},
		warning: {
			iconBg: "bg-amber-500/10",
			iconColor: "text-amber-600 dark:text-amber-400",
		},
	};

	const styles = variantStyles[variant];

	return (
		<div className="group overflow-hidden rounded border border-border bg-card hover:border-primary/50">
			<div className="flex items-center gap-3 p-3">
				<div
					className={cn(
						"flex size-8 shrink-0 items-center justify-center rounded",
						styles.iconBg
					)}
				>
					<Icon className={cn("size-4", styles.iconColor)} weight="duotone" />
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate font-semibold text-base text-foreground tabular-nums leading-tight">
						{value}
					</p>
					<p className="truncate text-muted-foreground text-xs">{title}</p>
				</div>
			</div>
			<div className="border-border/50 border-t bg-accent/30 px-3 py-1.5">
				<p className="text-[10px] text-muted-foreground">{description}</p>
			</div>
		</div>
	);
}

export const ErrorSummaryStats = ({ errorSummary }: ErrorSummaryStatsProps) => (
	<div className="grid grid-cols-2 gap-2">
		<ErrorStatCard
			description="All error occurrences"
			icon={WarningCircleIcon}
			title="Total Errors"
			value={(errorSummary.totalErrors || 0).toLocaleString()}
			variant="destructive"
		/>
		<ErrorStatCard
			description="Sessions with errors"
			icon={TrendUpIcon}
			title="Error Rate"
			value={`${(errorSummary.errorRate || 0).toFixed(2)}%`}
			variant="warning"
		/>
		<ErrorStatCard
			description="Unique users affected"
			icon={UsersIcon}
			title="Affected Users"
			value={(errorSummary.affectedUsers || 0).toLocaleString()}
		/>
		<ErrorStatCard
			description="Sessions with errors"
			icon={ActivityIcon}
			title="Affected Sessions"
			value={(errorSummary.affectedSessions || 0).toLocaleString()}
		/>
	</div>
);
