"use client";

import Link from "next/link";
import {
	InvestigationRow,
	InvestigationRowSkeleton,
} from "@/app/(main)/insights/_components/investigation-row";
import type { Insight } from "@/lib/insight-api";
import { cn } from "@/lib/utils";
import {
	ArrowClockwiseIcon,
	LightbulbIcon,
	WarningCircleIcon,
} from "@databuddy/ui/icons";
import { Button, Card } from "@databuddy/ui";

function InvestigationsLoadingState() {
	return (
		<div className="divide-y">
			<div className="flex items-center gap-3 px-5 py-4">
				<div className="flex size-7 shrink-0 items-center justify-center rounded bg-primary/10">
					<LightbulbIcon
						className="size-4 animate-pulse text-primary"
						weight="duotone"
					/>
				</div>
				<div className="min-w-0 flex-1">
					<p className="font-medium text-foreground text-sm">
						Loading investigations…
					</p>
					<p className="text-muted-foreground text-xs">
						Fetching cases from the last completed analysis
					</p>
				</div>
			</div>
			<InvestigationRowSkeleton />
			<InvestigationRowSkeleton />
		</div>
	);
}

function InvestigationsEmptyState() {
	return (
		<div className="flex items-center gap-3 px-5 py-4">
			<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
				<LightbulbIcon className="size-5 text-primary" weight="duotone" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="font-medium text-foreground text-sm">
					No investigations yet
				</p>
				<p className="text-muted-foreground text-xs">
					Databuddy has not opened a case from the latest analysis
				</p>
			</div>
		</div>
	);
}

function InvestigationsErrorState({
	onRetryAction,
}: {
	onRetryAction: () => void;
}) {
	return (
		<div className="flex items-center gap-3 px-5 py-4">
			<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-500/10">
				<WarningCircleIcon className="size-5 text-red-500" weight="duotone" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="font-medium text-foreground text-sm">
					Couldn't load investigations
				</p>
				<p className="text-muted-foreground text-xs">
					Stored investigations couldn't be loaded
				</p>
			</div>
			<Button
				className="shrink-0"
				onClick={onRetryAction}
				size="sm"
				variant="secondary"
			>
				Retry
			</Button>
		</div>
	);
}

interface InvestigationsSectionProps {
	insights: Insight[];
	isError?: boolean;
	isFetching?: boolean;
	isLoading?: boolean;
	onRefreshAction: () => void;
}

export function InvestigationsSection({
	insights,
	isLoading,
	isFetching,
	isError,
	onRefreshAction,
}: InvestigationsSectionProps) {
	const loading = isLoading === true;
	const error = isError === true;
	const showInsights = !(loading || error) && insights.length > 0;
	let content = <InvestigationsEmptyState />;
	if (loading) {
		content = <InvestigationsLoadingState />;
	} else if (error) {
		content = <InvestigationsErrorState onRetryAction={onRefreshAction} />;
	} else if (showInsights) {
		content = (
			<div>
				{insights.map((insight) => (
					<InvestigationRow insight={insight} key={insight.id} />
				))}
			</div>
		);
	}

	return (
		<Card>
			<Card.Header className="flex-row items-center justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<LightbulbIcon
							className="size-4 shrink-0 text-primary"
							weight="duotone"
						/>
						<Card.Title className="text-sm">Investigations</Card.Title>
					</div>
				</div>
				{loading || error ? null : (
					<div className="flex shrink-0 items-center gap-2">
						{showInsights ? (
							<span className="text-muted-foreground text-xs">
								{insights.length} {insights.length === 1 ? "case" : "cases"}
							</span>
						) : null}
						<Link
							className="text-muted-foreground text-xs hover:text-foreground"
							href="/insights"
						>
							View all
						</Link>
						<Button
							aria-label="Refresh investigations"
							className="size-6 text-muted-foreground"
							disabled={isFetching}
							onClick={onRefreshAction}
							size="icon-sm"
							variant="ghost"
						>
							<ArrowClockwiseIcon
								className={cn(
									"size-3.5",
									isFetching === true && "animate-spin"
								)}
							/>
						</Button>
					</div>
				)}
			</Card.Header>
			{content}
		</Card>
	);
}
