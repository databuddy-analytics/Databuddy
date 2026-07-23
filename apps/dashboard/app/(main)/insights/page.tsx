"use client";

import { useCallback } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { useWebsitesLight } from "@/hooks/use-websites";
import { cn } from "@/lib/utils";
import { Button, Card, EmptyState } from "@databuddy/ui";
import {
	ArrowClockwiseIcon,
	GlobeIcon,
	LightbulbIcon,
} from "@databuddy/ui/icons";
import { InvestigationSettings } from "./_components/investigation-settings";
import {
	InvestigationRow,
	InvestigationRowSkeleton,
} from "./_components/investigation-row";
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
	const refresh = useCallback(() => {
		refetch().catch(() => undefined);
	}, [refetch]);

	return (
		<div
			aria-busy={isLoading || websitesLoading}
			className="flex h-full flex-col"
		>
			<TopBar.Title>
				<h1 className="font-semibold text-sm">Investigations</h1>
			</TopBar.Title>

			{hasNoWebsites ? (
				<EmptyOrg />
			) : (
				<div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
					<div className="mx-auto w-full max-w-3xl p-4 sm:p-5">
						<Card aria-label="Investigations">
							<Card.Header className="flex-row items-start justify-between gap-3">
								<div className="min-w-0">
									<Card.Title>Investigations</Card.Title>
									<Card.Description>
										Cases Databuddy is tracking across your organization.
									</Card.Description>
								</div>
								<div className="flex shrink-0 items-center gap-1.5">
									<Button
										aria-label="Refresh investigations"
										disabled={isLoading || websitesLoading}
										onClick={refresh}
										size="sm"
										type="button"
										variant="ghost"
									>
										<ArrowClockwiseIcon
											aria-hidden
											className={cn(
												"size-3.5 shrink-0",
												isRefreshing && "animate-spin"
											)}
										/>
									</Button>
									<InvestigationSettings organizationId={orgId} />
								</div>
							</Card.Header>
							<Card.Content className="p-0">
								<InvestigationList feed={feed} />
							</Card.Content>
						</Card>
					</div>
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
	const loadMore = useCallback(() => {
		fetchNextPage().catch(() => undefined);
	}, [fetchNextPage]);

	if (isLoading) {
		return (
			<div
				aria-label="Loading investigations"
				aria-live="polite"
				className="divide-y"
				role="status"
			>
				{Array.from({ length: 4 }, (_, index) => (
					<InvestigationRowSkeleton key={`investigation-${index + 1}`} />
				))}
			</div>
		);
	}

	if (isError) {
		return <ErrorState onRetryAction={refetch} />;
	}

	if (insights.length === 0) {
		return <EmptyList />;
	}

	return (
		<>
			<div>
				{insights.map((insight) => (
					<InvestigationRow insight={insight} key={insight.id} />
				))}
			</div>

			{hasNextPage ? (
				<div className="flex justify-center border-t px-5 py-4">
					<Button
						disabled={isFetchingNextPage}
						loading={isFetchingNextPage}
						onClick={loadMore}
						type="button"
						variant="secondary"
					>
						Load more
					</Button>
				</div>
			) : null}
		</>
	);
}

function ErrorState({ onRetryAction }: { onRetryAction: () => void }) {
	return (
		<div className="px-5 py-12">
			<EmptyState
				action={{
					label: "Try again",
					onClick: onRetryAction,
					variant: "secondary",
				}}
				description="Databuddy couldn't load the latest cases."
				icon={<LightbulbIcon weight="duotone" />}
				title="Couldn't load investigations"
				variant="error"
			/>
		</div>
	);
}

function EmptyList() {
	return (
		<div className="px-5 py-12">
			<EmptyState
				description="Databuddy opens a case when it finds something worth acting on."
				icon={<LightbulbIcon weight="duotone" />}
				title="No investigations yet"
				variant="minimal"
			/>
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
