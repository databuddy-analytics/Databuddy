"use client";

import { GlobeIcon } from "@phosphor-icons/react";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { Card } from "@/components/ui/card";
import { TruncatedText } from "@/components/ui/truncated-text";
import { cn } from "@/lib/utils";
import type { BaseComponentProps } from "../types";

export interface ReferrerItem {
	domain?: string;
	name: string;
	pageviews?: number;
	percentage?: number;
	referrer?: string;
	visitors: number;
}

export interface ReferrersListProps extends BaseComponentProps {
	referrers: ReferrerItem[];
	title?: string;
}

function formatNumber(value: number): string {
	return Intl.NumberFormat(undefined, {
		notation: value > 9999 ? "compact" : "standard",
		maximumFractionDigits: 1,
	}).format(value);
}

function ReferrerRow({ referrer }: { referrer: ReferrerItem }) {
	const displayName = referrer.name || referrer.referrer || "Direct";
	const isDirect = displayName === "Direct" || !referrer.domain;

	return (
		<div className="flex items-center gap-3 border-b px-3 py-2.5 transition-colors last:border-b-0 hover:bg-muted/50">
			<div className="flex min-w-0 flex-1 items-center gap-2">
				{isDirect ? (
					<GlobeIcon
						className="size-4 shrink-0 text-muted-foreground"
						weight="duotone"
					/>
				) : (
					<FaviconImage
						altText={`${displayName} favicon`}
						className="shrink-0 rounded-sm"
						domain={referrer.domain ?? ""}
						size={16}
					/>
				)}
				{isDirect ? (
					<TruncatedText
						className="truncate font-medium text-sm"
						text={displayName}
					/>
				) : (
					<a
						className={cn(
							"flex min-w-0 cursor-pointer items-center gap-2 hover:text-foreground hover:underline"
						)}
						href={`https://${referrer.domain?.trim()}`}
						onClick={(e) => {
							e.stopPropagation();
						}}
						rel="noopener noreferrer nofollow"
						target="_blank"
					>
						<TruncatedText
							className="min-w-0 truncate font-medium text-sm"
							text={displayName}
						/>
					</a>
				)}
			</div>
			<div className="flex shrink-0 items-center gap-3 text-right">
				<span className="font-medium text-sm tabular-nums">
					{formatNumber(referrer.visitors)}
				</span>
				{referrer.percentage !== undefined && (
					<span className="w-12 text-muted-foreground text-xs tabular-nums">
						{referrer.percentage.toFixed(1)}%
					</span>
				)}
			</div>
		</div>
	);
}

export function ReferrersListRenderer({
	title,
	referrers,
	className,
}: ReferrersListProps) {
	if (referrers.length === 0) {
		return (
			<Card
				className={className ?? "gap-0 overflow-hidden border bg-card py-0"}
			>
				{title && (
					<div className="border-b px-3 py-2">
						<p className="font-medium text-sm">{title}</p>
					</div>
				)}
				<div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
					<GlobeIcon
						className="size-8 text-muted-foreground/40"
						weight="duotone"
					/>
					<p className="font-medium text-sm">No referrers found</p>
					<p className="text-muted-foreground text-xs">
						Traffic sources will appear once visitors arrive
					</p>
				</div>
			</Card>
		);
	}

	return (
		<Card className={className ?? "gap-0 overflow-hidden border bg-card py-0"}>
			{title && (
				<div className="flex items-center justify-between border-b px-3 py-2">
					<p className="font-medium text-sm">{title}</p>
					<div className="flex items-center gap-3 text-muted-foreground text-xs">
						<span>Visitors</span>
						<span className="w-12">Share</span>
					</div>
				</div>
			)}
			<div className="max-h-80 overflow-y-auto">
				{referrers.map((referrer, idx) => (
					<ReferrerRow key={`${referrer.name}-${idx}`} referrer={referrer} />
				))}
			</div>
			<div className="border-t bg-muted/30 px-3 py-1.5">
				<p className="text-muted-foreground text-xs">
					{referrers.length} {referrers.length === 1 ? "source" : "sources"}
				</p>
			</div>
		</Card>
	);
}
