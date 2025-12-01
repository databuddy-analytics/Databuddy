"use client";

import {
	ArrowClockwiseIcon,
	GlobeIcon,
	PlusIcon,
	TrendUpIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WebsiteDialog } from "@/components/website-dialog";
import { useWebsites } from "@/hooks/use-websites";

import { cn } from "@/lib/utils";
import { PageHeader } from "./_components/page-header";
import { WebsiteCard } from "./_components/website-card";

function LoadingSkeleton() {
	return (
			<div className="grid select-none gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{[1, 2, 3, 4, 5, 6].map((num) => (
					<Card
						className="animate-pulse overflow-hidden pt-0"
						key={`website-skeleton-${num}`}
					>
						<CardHeader className="dotted-bg gap-0! border-b bg-accent px-3 pt-4 pb-0!">
							<Skeleton className="mx-auto h-24 w-full rounded sm:h-28" />
						</CardHeader>
						<CardContent className="px-4 py-3">
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
						</CardContent>
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
			{/* Enhanced header */}
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
							variant="secondary"
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
							<div className="-translate-x-full absolute inset-0 bg-linear-to-r from-white/0 via-white/20 to-white/0 transition-transform duration-700 group-hover:translate-x-full" />
							<PlusIcon className="relative z-10 h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
							<span className="relative z-10 truncate">New Website</span>
						</Button>
					</>
				}
				title="Websites"
			/>

			{/* Content area */}
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

				{/* Show empty state */}
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

				{/* Show website grid */}
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

			{/* Website Dialog */}
			<WebsiteDialog onOpenChange={setDialogOpen} open={dialogOpen} />
		</div>
	);
}
