"use client";

import { useAtomValue } from "jotai";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";
import { useOrgNarrative } from "../hooks/use-org-narrative";
import { insightsRangeAtom } from "../lib/time-range";
import { ArrowClockwiseIcon, LightbulbIcon } from "@databuddy/ui/icons";
import { Badge, Button, Card, Skeleton, dayjs } from "@databuddy/ui";

export function CockpitNarrative() {
	const range = useAtomValue(insightsRangeAtom);
	const { data, isLoading, isError, refetch, isFetching } =
		useOrgNarrative(range);

	return (
		<Card>
			<Card.Header className="flex-row items-center justify-between gap-3">
				<div className="min-w-0 space-y-1">
					<div className="flex items-center gap-2">
						<LightbulbIcon
							aria-hidden
							className="size-4 text-primary"
							weight="duotone"
						/>
						<Card.Title className="text-sm">Brief</Card.Title>
					</div>
					<Card.Description>
						Organization-wide signals · {rangeLabel(range)}
					</Card.Description>
				</div>
				{!(isLoading || isError) &&
					data &&
					data.success &&
					data.generatedAt && (
						<Badge className="tabular-nums" variant="muted">
							Updated {dayjs(data.generatedAt).fromNow(true)} ago
						</Badge>
					)}
			</Card.Header>

			<Card.Content className="min-h-[72px]">
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
						<Button
							onClick={() => refetch()}
							size="sm"
							type="button"
							variant="secondary"
						>
							<ArrowClockwiseIcon
								aria-hidden
								className={cn("size-4", isFetching && "animate-spin")}
							/>
							Retry
						</Button>
					</div>
				)}

				{!(isLoading || isError) && data && data.success && (
					<Streamdown className="max-w-4xl text-[14px] text-foreground leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
						{data.narrative}
					</Streamdown>
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
		return "Last 7 days";
	}
	if (range === "30d") {
		return "Last 30 days";
	}
	return "Last 90 days";
}
