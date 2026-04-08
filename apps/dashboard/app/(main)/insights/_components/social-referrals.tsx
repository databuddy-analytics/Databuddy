"use client";

import { useAtomValue } from "jotai";
import { Skeleton } from "@/components/ui/skeleton";
import { useSocialReferrals } from "../hooks/use-social-referrals";
import { insightsRangeAtom } from "../lib/time-range";
import { SocialPlatformRow, type SocialPlatform } from "./social-platform-row";

export function SocialReferrals() {
	const range = useAtomValue(insightsRangeAtom);
	const { data, isLoading, isError, refetch } = useSocialReferrals(range);
	const platforms = (data?.platforms ?? []) as SocialPlatform[];

	return (
		<section
			aria-label="Social referrals"
			className="border-b px-4 py-4 sm:px-6"
		>
			<div className="mb-3 flex items-center">
				<span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
					Social referrals
				</span>
			</div>

			<div className="overflow-hidden rounded border bg-card">
				{isError && (
					<div className="flex items-center gap-3 px-3 py-4">
						<p className="text-muted-foreground text-xs">
							Couldn't load social referrals
						</p>
						<button
							className="inline-flex items-center gap-1 rounded text-primary text-xs transition-colors hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
							onClick={() => refetch()}
							type="button"
						>
							Retry
						</button>
					</div>
				)}

				{!isError &&
					isLoading &&
					Array.from({ length: 4 }, (_, i) => (
						<div
							className="flex items-center gap-3 border-b px-3 py-3 last:border-b-0"
							key={`social-skeleton-${i}`}
						>
							<Skeleton className="size-8 shrink-0 rounded" />
							<Skeleton className="h-4 flex-1 rounded" />
							<Skeleton className="h-4 w-32 rounded" />
						</div>
					))}

				{!(isError || isLoading) && platforms.length === 0 && (
					<p className="px-3 py-4 text-muted-foreground text-xs">
						No social referrals in this range.
					</p>
				)}

				{!(isError || isLoading) &&
					platforms.map((platform, index) => (
						<SocialPlatformRow
							defaultOpen={index === 0}
							key={platform.host}
							platform={platform}
						/>
					))}
			</div>
		</section>
	);
}
