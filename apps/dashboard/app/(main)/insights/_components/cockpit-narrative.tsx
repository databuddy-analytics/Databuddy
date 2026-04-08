"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { SparkleIcon } from "@phosphor-icons/react/dist/ssr/Sparkle";
import { useAtomValue } from "jotai";
import dayjs from "@/lib/dayjs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useOrgNarrative } from "../hooks/use-org-narrative";
import { insightsRangeAtom } from "../lib/time-range";

export function CockpitNarrative() {
	const range = useAtomValue(insightsRangeAtom);
	const { data, isLoading, isError, refetch, isFetching } =
		useOrgNarrative(range);

	return (
		<section
			aria-label="Weekly summary"
			className="border-b bg-linear-to-b from-primary/[0.04] to-transparent px-4 py-5 sm:px-6"
		>
			<div className="flex items-center gap-2">
				<div className="flex size-6 items-center justify-center rounded bg-primary/10 text-primary">
					<SparkleIcon aria-hidden className="size-3.5" weight="duotone" />
				</div>
				<span className="font-medium text-[11px] text-primary uppercase tracking-wide">
					This {rangeLabel(range)}
				</span>
			</div>

			<div className="mt-3 min-h-[42px]">
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
							className="inline-flex items-center gap-1 text-primary text-xs transition-colors hover:underline"
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
			</div>

			{!(isLoading || isError) && data && data.success && data.generatedAt && (
				<p className="mt-2 text-[11px] text-muted-foreground">
					Updated {dayjs(data.generatedAt).fromNow(true)} ago
				</p>
			)}
		</section>
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
