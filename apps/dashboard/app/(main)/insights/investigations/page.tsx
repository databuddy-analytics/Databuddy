"use client";

import { useCallback } from "react";
import { Card, Button, EmptyState } from "@databuddy/ui";
import { LightbulbIcon } from "@databuddy/ui/icons";
import {
	InvestigationRow,
	InvestigationRowSkeleton,
} from "../_components/investigation-row";
import { useInsightsFeed } from "../hooks/use-insights-feed";

export default function InvestigationsPage() {
	const feed = useInsightsFeed();

	return (
		<div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
			<Card aria-label="Investigations" className="border-border/70 shadow-sm">
				<Card.Header className="border-b bg-card">
					<Card.Title>Investigations</Card.Title>
					<Card.Description className="mt-1">
						Questions and fixes waiting for your input.
					</Card.Description>
				</Card.Header>
				<Card.Content className="p-0">
					<InvestigationList feed={feed} />
				</Card.Content>
			</Card>
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
		return (
			<div className="px-5 py-12">
				<EmptyState
					action={{
						label: "Try again",
						onClick: refetch,
						variant: "secondary",
					}}
					description="Databuddy couldn't load recent investigations."
					icon={<LightbulbIcon weight="duotone" />}
					title="Couldn't load investigations"
					variant="error"
				/>
			</div>
		);
	}

	if (insights.length === 0) {
		return (
			<div className="px-5 py-12">
				<EmptyState
					description="Databuddy starts an investigation when it finds a question or fix worth following through."
					icon={<LightbulbIcon weight="duotone" />}
					title="Nothing needs your input"
					variant="minimal"
				/>
			</div>
		);
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
