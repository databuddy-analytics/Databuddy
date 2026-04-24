"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { LightbulbIcon } from "@phosphor-icons/react/dist/ssr/Lightbulb";
import { useAtomValue } from "jotai";
import { Card } from "@/components/ds/card";
import { Skeleton } from "@/components/ds/skeleton";
import dayjs from "@/lib/dayjs";
import { cn } from "@/lib/utils";
import { useOrgNarrative } from "../hooks/use-org-narrative";
import { insightsRangeAtom } from "../lib/time-range";

export function CockpitNarrative() {
	const range = useAtomValue(insightsRangeAtom);
	const { data, isLoading, isError, refetch, isFetching } =
		useOrgNarrative(range);

	return (
		<Card>
			<Card.Header className="flex-row items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<LightbulbIcon
						aria-hidden
						className="size-4 text-primary"
						weight="duotone"
					/>
					<Card.Title className="text-sm">This {rangeLabel(range)}</Card.Title>
				</div>
				{!(isLoading || isError) &&
					data &&
					data.success &&
					data.generatedAt && (
						<span className="text-[11px] text-muted-foreground tabular-nums">
							Updated {dayjs(data.generatedAt).fromNow(true)} ago
						</span>
					)}
			</Card.Header>

			<Card.Content className="min-h-[44px]">
				{isLoading && (
					<div className="space-y-2">
						<Skeleton className="h-4 w-11/12 rounded" />
						<Skeleton className="h-4 w-8/12 rounded" />
					</div>
				)}

				{!isLoading && isError && (
					<div className="flex items-center gap-3">
						<p className="text-muted-foreground text-sm">
							Couldn't generate summary
						</p>
						<button
							className="inline-flex items-center gap-1 rounded text-primary text-xs transition-colors hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
							onClick={() => refetch()}
							type="button"
						>
							<ArrowClockwiseIcon
								aria-hidden
								className={cn("size-3", isFetching && "animate-spin")}
							/>
							Retry
						</button>
					</div>
				)}

				{!(isLoading || isError) && data && data.success && (
					<p className="text-pretty text-[14px] text-foreground leading-relaxed">
						{data.narrative}
					</p>
				)}

				{!(isLoading || isError) && data && !data.success && (
					<p className="text-muted-foreground text-sm">
						Couldn't generate summary
					</p>
				)}
			</Card.Content>
		</Card>
	);
}

function rangeLabel(range: "7d" | "30d" | "90d"): string {
	if (range === "7d") {
		return "week";
	}
	if (range === "30d") {
		return "month";
	}
	return "quarter";
}
