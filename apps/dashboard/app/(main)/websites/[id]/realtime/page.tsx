"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { useDynamicQuery } from "@/hooks/use-dynamic-query";
import { Skeleton } from "@databuddy/ui";
import { Silkscreen } from "next/font/google";

const pixel = Silkscreen({ weight: ["400", "700"], subsets: ["latin"] });

const RealtimeMap = dynamic(
	() =>
		import("./_components/realtime-map").then((mod) => ({
			default: mod.RealtimeMap,
		})),
	{
		loading: () => (
			<div className="flex h-full items-center justify-center">
				<Skeleton className="h-4 w-32 rounded" />
			</div>
		),
		ssr: false,
	},
);

export default function RealtimePage() {
	const { id } = useParams();
	const websiteId = id as string;

	const dateRange = useMemo(() => {
		const now = new Date();
		const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
		return {
			start_date: fiveMinutesAgo.toISOString(),
			end_date: now.toISOString(),
		};
	}, []);

	const { data } = useDynamicQuery(
		websiteId,
		dateRange,
		{
			id: "realtime-all",
			parameters: ["realtime_countries", "active_stats", "realtime_velocity"],
		},
		{ refetchInterval: 5000, staleTime: 0, gcTime: 10_000 },
	);

	const countries = ((data as any)?.realtime_countries || []) as Array<{
		country_code: string;
		country_name: string;
		visitors: number;
	}>;

	const stats = (data as any)?.active_stats?.[0];
	const activeUsers: number = stats?.active_users || 0;

	const velocity = ((data as any)?.realtime_velocity || []) as Array<{
		minute: string;
		pageviews: number;
		events: number;
	}>;
	const lastMinute = velocity.length > 0 ? velocity.at(-1) : null;
	const viewsPerMin = lastMinute?.pageviews || 0;
	const eventsPerMin = lastMinute?.events || 0;

	return (
		<div className={`${pixel.className} flex h-full flex-col`}>
			<div className="relative min-h-0 flex-1">
				<RealtimeMap countries={countries} />

				<div className="pointer-events-none absolute top-4 left-4 flex items-center gap-2">
					<span className="relative flex size-2">
						<span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--chart-4)]/60" />
						<span className="relative inline-flex size-2 rounded-full bg-[var(--chart-4)]" />
					</span>
					<span className="text-[10px] uppercase tracking-widest text-foreground/60">
						Realtime
					</span>
				</div>

				<div className="pointer-events-none absolute top-4 right-4 flex items-baseline gap-6">
					<div className="text-right">
						<span className="font-bold text-3xl text-foreground tabular-nums">
							{activeUsers}
						</span>
						<span className="ml-1 text-[10px] text-foreground/50">users</span>
					</div>
					<div className="text-right">
						<span className="font-bold text-foreground text-xl tabular-nums">
							{viewsPerMin}
						</span>
						<span className="ml-1 text-[10px] text-foreground/50">views/m</span>
					</div>
					<div className="text-right">
						<span className="font-bold text-foreground text-xl tabular-nums">
							{eventsPerMin}
						</span>
						<span className="ml-1 text-[10px] text-foreground/50">events/m</span>
					</div>
				</div>

				{countries.length > 0 && (
					<div className="pointer-events-none absolute right-4 bottom-4 left-4 flex flex-wrap justify-end gap-x-3 gap-y-1">
						{countries.slice(0, 6).map((c) => (
							<span
								className="flex items-center gap-1.5 text-[10px] text-foreground/50"
								key={c.country_code}
							>
								<span className="size-1.5 bg-[var(--chart-4)]" />
								{c.country_name || c.country_code}
								<span className="text-foreground/80 tabular-nums">
									{c.visitors}
								</span>
							</span>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
