"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { GlobeIcon } from "@phosphor-icons/react/dist/ssr/Globe";
import { PlusIcon } from "@phosphor-icons/react/dist/ssr/Plus";
import { TrendUpIcon } from "@phosphor-icons/react/dist/ssr/TrendUp";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { EmptyState } from "@/components/ds/empty-state";
import { Skeleton } from "@/components/ds/skeleton";
import { useWebsites } from "@/hooks/use-websites";
import { cn } from "@/lib/utils";
import { PageHeader } from "./_components/page-header";
import { WebsiteCard } from "./_components/website-card";

const WebsiteDialog = dynamic(
	() => import("@/components/website-dialog").then((mod) => mod.WebsiteDialog),
	{ ssr: false }
);

function LoadingSkeleton() {
	return (
		<div className="grid select-none gap-6 sm:grid-cols-2 lg:grid-cols-3">
			{[1, 2, 3, 4, 5, 6].map((num) => (
				<Card
					className="animate-pulse overflow-hidden pt-0"
					key={`website-skeleton-${num}`}
				>
					<Card.Header className="dotted-bg gap-0! border-b bg-accent px-3 pt-4 pb-0!">
						<Skeleton className="mx-auto h-24 w-full rounded sm:h-28" />
					</Card.Header>
					<Card.Content className="px-4 py-3">
						<div className="flex items-center gap-3">
							<Skeleton className="size-7 shrink-0 rounded" />
							<div className="flex min-w-0 flex-1 items-center justify-between gap-2">
								<div className="flex flex-col gap-1">
									<Skeleton className="h-3.5 w-24 rounded" />
									<Skeleton className="h-3 w-32 rounded" />
								</div>
								<div className="flex flex-col items-end gap-1">
									<Skeleton className="h-3 w-12 rounded" />
									<Skeleton className="h-2.5 w-8 rounded" />
								</div>
							</div>
						</div>
					</Card.Content>
				</Card>
			))}
		</div>
	);
}

export default function WebsitesPage() {
	const [dialogOpen, setDialogOpen] = useState(false);

	const {
		websites,
		chartData,
		activeUsers,
		isLoading,
		isError,
		isFetching,
		refetch,
	} = useWebsites();

	return (
		<div className="flex h-full flex-col">
			<PageHeader
				description="Track analytics for all your websites"
				icon={<TrendUpIcon />}
				right={
					<>
						<Button
							aria-label="Refresh websites"
							disabled={isLoading || isFetching}
							onClick={() => refetch()}
							size="icon"
							variant="outline"
						>
							<ArrowClockwiseIcon
								aria-hidden
								className={cn(
									"size-4",
									isLoading || isFetching ? "animate-spin" : ""
								)}
							/>
						</Button>
						<Button
							className={cn(
								"gap-2 px-3 py-2 font-medium sm:px-4 sm:py-2",
								"bg-linear-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary",
								"group relative overflow-hidden shadow-lg transition-all duration-300 hover:shadow-xl"
							)}
							data-button-type="primary"
							data-section="header"
							data-track="websites-new-website-header"
							onClick={() => setDialogOpen(true)}
							size="default"
						>
							<div className="absolute inset-0 -translate-x-full bg-linear-to-r from-white/0 via-white/20 to-white/0 transition-transform duration-700 group-hover:translate-x-full" />
							<PlusIcon className="relative z-10 size-4 transition-transform duration-300 group-hover:rotate-90" />
							<span className="relative z-10 truncate">New Website</span>
						</Button>
					</>
				}
				title="Websites"
			/>

			<div
				aria-busy={isFetching}
				className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6"
			>
				{isLoading && <LoadingSkeleton />}

				{isError && (
					<EmptyState
						action={{
							label: "Try Again",
							onClick: () => refetch(),
						}}
						className="h-full"
						description="There was an issue fetching your websites. Please check your connection and try again."
						icon={<GlobeIcon />}
						title="Failed to load your websites"
						variant="error"
					/>
				)}

				{!(isLoading || isError) && websites && websites.length === 0 && (
					<EmptyState
						action={{
							label: "Create Your First Website",
							onClick: () => setDialogOpen(true),
						}}
						className="h-full"
						description="Start tracking your website analytics by adding your first website. Get insights into visitors, pageviews, and performance."
						icon={<GlobeIcon weight="duotone" />}
						title="No websites yet"
						variant="minimal"
					/>
				)}

				{!(isLoading || isError) && websites && websites.length > 0 && (
					<div
						aria-live="polite"
						className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
					>
						{websites.map((website) => (
							<WebsiteCard
								activeUsers={activeUsers?.[website.id]}
								chartData={chartData?.[website.id]}
								isLoadingChart={isLoading || isFetching}
								key={website.id}
								website={website}
							/>
						))}
					</div>
				)}
			</div>

			<WebsiteDialog onOpenChange={setDialogOpen} open={dialogOpen} />
		</div>
	);
}
