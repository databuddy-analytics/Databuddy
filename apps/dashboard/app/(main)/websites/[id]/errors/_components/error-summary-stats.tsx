import { cn } from "@/lib/utils";
import type { ErrorSummary } from "./types";
import { ActivityIcon } from "@phosphor-icons/react/dist/ssr";
import type { NavIcon } from "@/components/layout/navigation/types";
import { TrendUpIcon, UsersIcon, WarningCircleIcon } from "@databuddy/ui/icons";
import { Card, Skeleton } from "@databuddy/ui";

type StatVariant = "default" | "destructive" | "warning";

const VARIANT_STYLES: Record<
	StatVariant,
	{ iconBg: string; iconColor: string }
> = {
	default: { iconBg: "bg-accent", iconColor: "text-muted-foreground" },
	destructive: { iconBg: "bg-destructive/10", iconColor: "text-destructive" },
	warning: {
		iconBg: "bg-amber-500/10",
		iconColor: "text-amber-600 dark:text-amber-400",
	},
};

function ErrorStatCard({
	title,
	value,
	icon: Icon,
	variant = "default",
}: {
	title: string;
	value: string;
	icon: NavIcon;
	variant?: StatVariant;
}) {
	const styles = VARIANT_STYLES[variant];
	return (
		<Card className="gap-0 py-0">
			<div className="flex items-center gap-2.5 px-2.5 py-2.5">
				<div
					className={cn(
						"flex size-7 shrink-0 items-center justify-center rounded",
						styles.iconBg
					)}
				>
					<Icon className={cn("size-4", styles.iconColor)} />
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate font-semibold text-base tabular-nums leading-tight">
						{value}
					</p>
					<p className="truncate text-muted-foreground text-xs">{title}</p>
				</div>
			</div>
		</Card>
	);
}

function StatSkeleton() {
	return (
		<Card className="gap-0 py-0">
			<div className="flex items-center gap-2.5 px-2.5 py-2.5">
				<Skeleton className="size-7 shrink-0 rounded" />
				<div className="min-w-0 flex-1 space-y-1">
					<Skeleton className="h-5 w-14 rounded" />
					<Skeleton className="h-3 w-12 rounded" />
				</div>
			</div>
		</Card>
	);
}

interface ErrorSummaryStatsProps {
	errorSummary: ErrorSummary;
	isLoading?: boolean;
}

export const ErrorSummaryStats = ({
	errorSummary,
	isLoading,
}: ErrorSummaryStatsProps) => {
	if (isLoading) {
		return (
			<div className="grid grid-cols-2 gap-1.5 rounded-xl bg-secondary p-1.5">
				{Array.from({ length: 4 }).map((_, i) => (
					<StatSkeleton key={`stat-skel-${i}`} />
				))}
			</div>
		);
	}

	return (
		<div className="grid grid-cols-2 gap-1.5 rounded-xl bg-secondary p-1.5">
			<ErrorStatCard
				icon={WarningCircleIcon}
				title="Total Errors"
				value={(errorSummary.totalErrors || 0).toLocaleString()}
				variant="destructive"
			/>
			<ErrorStatCard
				icon={TrendUpIcon}
				title="Error Rate"
				value={`${(errorSummary.errorRate || 0).toFixed(2)}%`}
				variant="warning"
			/>
			<ErrorStatCard
				icon={UsersIcon}
				title="Affected Users"
				value={(errorSummary.affectedUsers || 0).toLocaleString()}
			/>
			<ErrorStatCard
				icon={ActivityIcon}
				title="Affected Sessions"
				value={(errorSummary.affectedSessions || 0).toLocaleString()}
			/>
		</div>
	);
};
