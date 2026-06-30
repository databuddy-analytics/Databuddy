"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { useDynamicQuery } from "@/hooks/use-dynamic-query";
import { Skeleton } from "@databuddy/ui";
import { GeistPixelSquare } from "geist/font/pixel";

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
	}
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
		{ refetchInterval: 5000, staleTime: 0, gcTime: 10_000 }
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
		<div className={`${GeistPixelSquare.className} flex h-full flex-col`}>
			<div className="relative min-h-0 flex-1">
				<RealtimeMap countries={countries} />

				<div className="pointer-events-none absolute top-4 left-4 flex items-center gap-2.5 rounded-lg bg-background/80 px-3 py-2 backdrop-blur-sm">
					<span className="relative flex size-2.5">
						<span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--chart-4)]/60" />
						<span className="relative inline-flex size-2.5 rounded-full bg-[var(--chart-4)]" />
					</span>
					<span className="text-foreground text-xs uppercase tracking-widest">
						Realtime
					</span>
				</div>

				<div className="pointer-events-none absolute top-4 right-4 flex items-stretch gap-2">
					<div className="rounded-lg bg-background/80 px-4 py-2.5 text-right backdrop-blur-sm">
						<span className="font-bold text-4xl text-foreground tabular-nums">
							{activeUsers}
						</span>
						<span className="ml-1.5 text-muted-foreground text-xs">users</span>
					</div>
					<div className="rounded-lg bg-background/80 px-3 py-2.5 text-right backdrop-blur-sm">
						<span className="font-bold text-2xl text-foreground tabular-nums">
							{viewsPerMin}
						</span>
						<span className="ml-1.5 text-muted-foreground text-xs">
							views/m
						</span>
					</div>
					<div className="rounded-lg bg-background/80 px-3 py-2.5 text-right backdrop-blur-sm">
						<span className="font-bold text-2xl text-foreground tabular-nums">
							{eventsPerMin}
						</span>
						<span className="ml-1.5 text-muted-foreground text-xs">
							events/m
						</span>
					</div>
				</div>

				{countries.length > 0 && (
					<div className="pointer-events-none absolute right-4 bottom-4 left-4 flex flex-wrap justify-end gap-1.5">
						{countries.slice(0, 6).map((c) => (
							<span
								className="flex items-center gap-2 rounded-md bg-background/80 px-2.5 py-1.5 text-xs backdrop-blur-sm"
								key={c.country_code}
							>
								<span className="size-2 rounded-sm bg-[var(--chart-4)]" />
								<span className="text-muted-foreground">
									{c.country_name || c.country_code}
								</span>
								<span className="font-bold text-foreground tabular-nums">
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
