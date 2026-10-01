"use client";

import { Button, Skeleton } from "@databuddy/ui";
import { ArrowRightIcon, RobotIcon } from "@databuddy/ui/icons";
import Link from "next/link";
import { AiProductIcon } from "@/components/icon";
import { formatCount, formatNumber } from "@/lib/formatters";

export interface AIProductRow {
	product: string;
	requests: number;
	visitors: number;
}

interface ReferrerRow {
	domain?: string;
	name: string;
	referrer_type?: string;
	visitors: number;
}

interface AITrafficSectionProps {
	agentsHref?: string;
	isLoading: boolean;
	products?: AIProductRow[];
	referrers: ReferrerRow[];
	totalVisitors?: number;
}

export function AITrafficSection({
	agentsHref,
	isLoading,
	products,
	referrers,
	totalVisitors,
}: AITrafficSectionProps) {
	const hasAgentAnalytics = products !== undefined;
	const rows =
		products?.map((row) => ({ ...row, key: row.product })) ??
		referrers
			.filter((row) => row.referrer_type === "ai")
			.map((row) => ({
				key: row.domain ? `${row.name}-${row.domain}` : row.name,
				product: row.name,
				requests: 0,
				visitors: row.visitors,
			}));
	const visitors =
		totalVisitors ?? rows.reduce((sum, row) => sum + row.visitors, 0);
	const requests = rows.reduce((sum, row) => sum + row.requests, 0);
	const topProducts = rows
		.toSorted((a, b) => b.visitors - a.visitors || b.requests - a.requests)
		.slice(0, 6);

	if (!isLoading && rows.length === 0) {
		return null;
	}

	return (
		<div className="flex flex-col gap-1.5 rounded-xl bg-secondary p-1.5 sm:flex-row sm:items-center">
			<div className="flex shrink-0 items-center gap-3 rounded-lg bg-background px-3 py-2">
				<div className="flex size-7 items-center justify-center rounded bg-accent">
					<RobotIcon className="size-4 text-muted-foreground" />
				</div>
				{isLoading ? (
					<Skeleton className="h-8 w-36" />
				) : (
					<>
						<div>
							<p className="font-semibold text-base tabular-nums leading-tight">
								{formatNumber(visitors)}
							</p>
							<p className="text-muted-foreground text-xs">
								{hasAgentAnalytics ? "AI visitors" : "AI referrals"}
							</p>
						</div>
						{hasAgentAnalytics && (
							<div className="border-border border-l pl-3">
								<p className="font-semibold text-base tabular-nums leading-tight">
									{formatNumber(requests)}
								</p>
								<p className="text-muted-foreground text-xs">Agent requests</p>
							</div>
						)}
					</>
				)}
			</div>

			<div className="flex min-w-0 flex-1 items-center gap-5 overflow-x-auto px-2 py-1">
				{isLoading ? (
					<Skeleton className="h-8 w-full min-w-48" />
				) : (
					topProducts.map((row) => (
						<div className="flex shrink-0 items-center gap-2" key={row.key}>
							<AiProductIcon name={row.product} size={18} />
							<div>
								<p className="font-medium text-foreground text-sm">
									{row.product}
								</p>
								<p className="text-muted-foreground text-xs tabular-nums">
									{formatCount(row.visitors, "visitor")}
									{hasAgentAnalytics &&
										` · ${formatCount(row.requests, "request")}`}
								</p>
							</div>
						</div>
					))
				)}
			</div>

			{agentsHref && (
				<Button
					asChild
					className="shrink-0 self-end sm:self-auto"
					size="sm"
					variant="ghost"
				>
					<Link href={agentsHref}>
						View agents <ArrowRightIcon className="size-3.5" />
					</Link>
				</Button>
			)}
		</div>
	);
}
