"use client";

import { TopBar } from "@/components/layout/top-bar";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { useWebsitesLight } from "@/hooks/use-websites";
import { cn } from "@/lib/utils";
import { Button, Card, EmptyState } from "@databuddy/ui";
import {
	ArrowClockwiseIcon,
	GlobeIcon,
	WarningCircleIcon,
} from "@databuddy/ui/icons";
import { InvestigationSettings } from "./_components/investigation-settings";
import { InvestigationRow } from "./_components/investigation-row";
import { useInsightsFeed } from "./hooks/use-insights-feed";

export default function InsightsPage() {
	const { activeOrganization, activeOrganizationId } =
		useOrganizationsContext();
	const orgId = activeOrganization?.id ?? activeOrganizationId ?? undefined;
	const feed = useInsightsFeed();
	const { isLoading, isRefreshing, refetch } = feed;
	const { websites, isLoading: websitesLoading } = useWebsitesLight();
	const hasNoWebsites =
		!websitesLoading && websites !== undefined && websites.length === 0;

	return (
		<div
			aria-busy={isLoading || websitesLoading}
			className="flex h-full flex-col overflow-y-auto"
		>
			<TopBar.Title>
				<h1 className="font-semibold text-sm">Investigations</h1>
			</TopBar.Title>
			<TopBar.Actions>
				<Button
					aria-label="Refresh investigations"
					disabled={isLoading || websitesLoading}
					onClick={() => refetch()}
					size="sm"
					type="button"
					variant="secondary"
				>
					<ArrowClockwiseIcon
						aria-hidden
						className={cn("size-4 shrink-0", isRefreshing && "animate-spin")}
					/>
				</Button>
				<InvestigationSettings organizationId={orgId} />
			</TopBar.Actions>

			{hasNoWebsites ? (
				<EmptyOrg />
			) : (
				<div className="mx-auto w-full max-w-4xl p-4 sm:p-5">
					<InvestigationList feed={feed} />
				</div>
			)}
		</div>
	);
}

function InvestigationList({
	feed,
}: {
	feed: ReturnType<typeof useInsightsFeed>;
}) {
	const {
		fetchNextPage,
		hasNextPage,
		insights,
		isError,
		isFetchingNextPage,
		isLoading,
		refetch,
	} = feed;

	return (
		<Card aria-label="Investigations">
			{isLoading && <StatusRow label="Loading investigations…" />}
			{!isLoading && isError && <ErrorRow onRetryAction={refetch} />}
			{!(isLoading || isError) && insights.length === 0 && <EmptyList />}

			{!(isLoading || isError) &&
				insights.map((insight) => (
					<InvestigationRow insight={insight} key={insight.id} />
				))}

			{hasNextPage && !isError && (
				<div className="flex justify-center py-4">
					<Button
						disabled={isFetchingNextPage}
						loading={isFetchingNextPage}
						onClick={() => fetchNextPage()}
						type="button"
						variant="secondary"
					>
						Load more
					</Button>
				</div>
			)}
		</Card>
	);
}

function StatusRow({ label }: { label: string }) {
	return (
		<div
			aria-live="polite"
			className="flex items-center gap-2 px-5 py-6 text-muted-foreground text-sm"
			role="status"
		>
			<ArrowClockwiseIcon aria-hidden className="size-4 animate-spin" />
			{label}
		</div>
	);
}

function ErrorRow({ onRetryAction }: { onRetryAction: () => void }) {
	return (
		<div className="flex items-center gap-3 px-5 py-6">
			<WarningCircleIcon
				className="size-5 shrink-0 text-destructive"
				weight="duotone"
			/>
			<p className="flex-1 text-muted-foreground text-sm">
				Investigations could not be loaded.
			</p>
			<Button onClick={onRetryAction} size="sm" variant="secondary">
				Retry
			</Button>
		</div>
	);
}

function EmptyList() {
	return (
		<div className="px-5 py-10 text-center">
			<p className="font-medium text-foreground text-sm">
				No investigations yet
			</p>
			<p className="mt-1 text-muted-foreground text-xs">
				Databuddy opens a case when it finds something worth acting on.
			</p>
		</div>
	);
}

function EmptyOrg() {
	return (
		<EmptyState
			action={{
				label: "Go to websites",
				onClick: () => {
					window.location.href = "/websites";
				},
			}}
			description="Add a website to start investigations across your organization."
			icon={<GlobeIcon weight="duotone" />}
			title="No websites yet"
			variant="minimal"
		/>
	);
}
