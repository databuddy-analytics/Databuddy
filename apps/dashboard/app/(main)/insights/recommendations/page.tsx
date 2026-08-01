"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { List } from "@/components/ui/composables/list";
import { type InsightRecommendation, insightQueries } from "@/lib/insight-api";
import { Badge, Button, Card, EmptyState, fromNow } from "@databuddy/ui";
import { ArrowRightIcon, LightbulbIcon, WrenchIcon } from "@databuddy/ui/icons";

export default function RecommendationsPage() {
	const { activeOrganization, activeOrganizationId } =
		useOrganizationsContext();
	const organizationId =
		activeOrganization?.id ?? activeOrganizationId ?? undefined;

	return (
		<div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
			<Card
				aria-label="Current recommendations"
				className="border-border/70 shadow-sm"
			>
				<Card.Header className="border-b bg-card">
					<Card.Title>Recommendations</Card.Title>
					<Card.Description className="mt-1">
						Current suggestions from published insights.
					</Card.Description>
				</Card.Header>
				<Card.Content className="p-0">
					<RecommendationList organizationId={organizationId} />
				</Card.Content>
			</Card>
		</div>
	);
}

function RecommendationList({
	organizationId,
}: {
	organizationId: string | undefined;
}) {
	const recommendations = useInfiniteQuery(
		insightQueries.recommendationsInfinite(organizationId)
	);
	const items =
		recommendations.data?.pages.flatMap((page) => page.recommendations) ?? [];

	if (recommendations.isLoading) {
		return (
			<div
				aria-label="Loading recommendations"
				aria-live="polite"
				className="divide-y"
				role="status"
			>
				{Array.from({ length: 4 }, (_, index) => (
					<RecommendationSkeleton key={`recommendation-${index + 1}`} />
				))}
			</div>
		);
	}

	if (recommendations.isError) {
		return (
			<div className="px-5 py-12">
				<EmptyState
					action={{
						label: "Try again",
						onClick: () => {
							recommendations.refetch().catch(() => undefined);
						},
						variant: "secondary",
					}}
					description="Databuddy couldn't load current recommendations."
					icon={<WrenchIcon weight="duotone" />}
					title="Couldn't load recommendations"
					variant="error"
				/>
			</div>
		);
	}

	if (items.length === 0) {
		return (
			<div className="px-5 py-12">
				<EmptyState
					description="Suggestions from published insights will appear here."
					icon={<WrenchIcon weight="duotone" />}
					title="No recommendations"
					variant="minimal"
				/>
			</div>
		);
	}

	return (
		<>
			<div>
				{items.map((insight) => (
					<RecommendationRow insight={insight} key={insight.id} />
				))}
			</div>
			{recommendations.hasNextPage ? (
				<div className="flex justify-center border-t px-5 py-4">
					<Button
						disabled={recommendations.isFetchingNextPage}
						loading={recommendations.isFetchingNextPage}
						onClick={() => {
							recommendations.fetchNextPage().catch(() => undefined);
						}}
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

function RecommendationSkeleton() {
	return (
		<div className="flex min-h-24 items-start gap-3 px-4 py-4">
			<span className="size-8 shrink-0 rounded bg-muted/60" />
			<span className="min-w-0 flex-1 space-y-2">
				<span className="block h-4 w-2/5 rounded bg-muted/60" />
				<span className="block h-3 w-full rounded bg-muted/60" />
				<span className="block h-3 w-4/5 rounded bg-muted/60" />
			</span>
		</div>
	);
}

function RecommendationRow({ insight }: { insight: InsightRecommendation }) {
	const entityType = insight.signal.entity.type.replaceAll("_", " ");
	const rowContent = (
		<>
			<span className="flex size-8 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
				<LightbulbIcon className="size-4" weight="duotone" />
			</span>
			<span className="min-w-0 flex-1">
				<span className="line-clamp-2 block font-medium text-foreground text-sm leading-snug">
					{insight.recommendation.action}
				</span>
				<span className="mt-1 line-clamp-2 block text-muted-foreground text-xs leading-relaxed">
					{insight.title}
				</span>
				<span className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
					<span className="truncate">
						{insight.websiteName ?? insight.websiteDomain}
					</span>
					<span className="text-muted-foreground/30">&middot;</span>
					<span className="capitalize">{entityType}</span>
					<span className="text-muted-foreground/30">&middot;</span>
					<span>{insight.signal.entity.label}</span>
					<span className="text-muted-foreground/30">&middot;</span>
					<span>{fromNow(insight.createdAt)}</span>
				</span>
			</span>
			{insight.investigationId ? (
				<>
					<Badge className="shrink-0" size="sm" variant="muted">
						Review
					</Badge>
					<ArrowRightIcon
						aria-hidden
						className="mt-1 size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
						weight="bold"
					/>
				</>
			) : null}
		</>
	);

	if (insight.investigationId) {
		return (
			<List.Row align="start" asChild>
				<Link href={`/insights/${insight.investigationId}`}>{rowContent}</Link>
			</List.Row>
		);
	}

	return (
		<List.Row align="start" interactive={false}>
			{rowContent}
		</List.Row>
	);
}
