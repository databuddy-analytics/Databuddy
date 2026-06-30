"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { useWebsites } from "@/hooks/use-websites";
import { cn } from "@/lib/utils";
import { WebsiteCard } from "./_components/website-card";
import { ArrowClockwiseIcon, GlobeIcon, PlusIcon } from "@databuddy/ui/icons";
import { Button, Card, EmptyState, Skeleton } from "@databuddy/ui";

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
	const { activeOrganization, isSwitchingOrganization } =
		useOrganizationsContext();
	const workspaceName = activeOrganization?.name ?? "this workspace";

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
			<TopBar.Title>
				<h1 className="font-semibold text-sm">Websites</h1>
			</TopBar.Title>
			<TopBar.Actions>
				<Button
					aria-label="Refresh websites"
					disabled={isLoading || isFetching || isSwitchingOrganization}
					onClick={() => refetch()}
					size="sm"
					variant="secondary"
				>
					<ArrowClockwiseIcon
						aria-hidden
						className={cn("size-4 shrink-0", isFetching ? "animate-spin" : "")}
					/>
				</Button>
				<Button
					data-track="websites-new-website-header"
					disabled={isSwitchingOrganization}
					onClick={() => setDialogOpen(true)}
					size="sm"
				>
					<PlusIcon className="size-4" />
					New Website
				</Button>
			</TopBar.Actions>

			<div
				aria-busy={isFetching}
				className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6"
			>
				{(isLoading || isSwitchingOrganization) && <LoadingSkeleton />}

				{isSwitchingOrganization && (
					<p className="sr-only" role="status">
						Switching workspace…
					</p>
				)}

				{!isSwitchingOrganization && isError && (
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

				{!(isLoading || isSwitchingOrganization || isError) &&
					websites &&
					websites.length === 0 && (
						<EmptyState
							action={{
								label: "Create Your First Website",
								onClick: () => setDialogOpen(true),
							}}
							className="h-full"
							description={`${workspaceName} does not have any websites yet. Add one to start collecting analytics for this workspace.`}
							icon={<GlobeIcon weight="duotone" />}
							title="No websites in this workspace"
							variant="minimal"
						/>
					)}

				{!(isLoading || isSwitchingOrganization || isError) &&
					websites &&
					websites.length > 0 && (
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

			<WebsiteDialog
				onOpenChange={setDialogOpen}
				open={dialogOpen && !isSwitchingOrganization}
			/>
		</div>
	);
}
