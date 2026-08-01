"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { List } from "@/components/ui/composables/list";
import { type InsightRecommendation, insightQueries } from "@/lib/insight-api";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	fromNow,
	Skeleton,
} from "@databuddy/ui";
import { WrenchIcon } from "@databuddy/ui/icons";
import {
	ConversionDraftRecommendationAction,
	InstrumentationRecommendationDetails,
} from "../_components/conversion-draft-recommendation";
import { GoalRecommendationAction } from "../_components/goal-recommendation-action";
import {
	isConversionDraftRecommendation,
	isDatabuddySetupRecommendation,
	isGoalRecommendation,
	isInstrumentationRecommendation,
} from "../_components/recommendation-guards";

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
						Concrete improvements found while analyzing your data.
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
			<Skeleton className="size-8 shrink-0 rounded" />
			<div className="min-w-0 flex-1 space-y-2">
				<Skeleton className="h-4 w-2/5 rounded" />
				<Skeleton className="h-3 w-full rounded" />
				<Skeleton className="h-3 w-4/5 rounded" />
			</div>
		</div>
	);
}

function RecommendationRow({ insight }: { insight: InsightRecommendation }) {
	const { recommendation } = insight;

	return (
		<List.Row align="start" interactive={false}>
			<span className="flex size-8 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
				<WrenchIcon className="size-4" weight="duotone" />
			</span>
			<div className="min-w-0 flex-1">
				<span className="flex flex-wrap items-center gap-2">
					<Badge size="sm" variant="muted">
						{recommendationLabel(recommendation)}
					</Badge>
					<span className="text-[11px] text-muted-foreground">
						{insight.websiteName ?? insight.websiteDomain} ·{" "}
						{fromNow(insight.createdAt)}
					</span>
				</span>
				<span className="mt-2 block font-medium text-foreground text-sm leading-relaxed">
					{recommendation.action}
				</span>
				{isInstrumentationRecommendation(recommendation) ? (
					<InstrumentationRecommendationDetails
						recommendation={recommendation}
					/>
				) : null}
				<span className="mt-2 block text-muted-foreground text-xs leading-relaxed">
					From{" "}
					{insight.investigationId ? (
						<Link
							className="font-medium text-foreground/80 transition-colors hover:text-foreground"
							href={`/insights/${insight.investigationId}`}
						>
							{insight.title}
						</Link>
					) : (
						<span className="text-foreground/80">{insight.title}</span>
					)}
				</span>
				<RecommendationAction insight={insight} />
			</div>
		</List.Row>
	);
}

function RecommendationAction({ insight }: { insight: InsightRecommendation }) {
	const { recommendation } = insight;
	if (isConversionDraftRecommendation(recommendation)) {
		return (
			<div className="mt-3 flex flex-wrap gap-1.5">
				<ConversionDraftRecommendationAction
					recommendation={recommendation}
					websiteId={insight.websiteId}
				/>
			</div>
		);
	}
	if (
		insight.signal.entity.type === "goal" &&
		isGoalRecommendation(recommendation)
	) {
		return (
			<div className="mt-3 flex flex-wrap gap-1.5">
				<GoalRecommendationAction
					goalId={insight.signal.entity.id}
					recommendation={recommendation}
					websiteId={insight.websiteId}
				/>
			</div>
		);
	}
	return null;
}

function recommendationLabel(
	recommendation: InsightRecommendation["recommendation"]
): string {
	if (isDatabuddySetupRecommendation(recommendation)) {
		return "Databuddy setup";
	}
	if (isInstrumentationRecommendation(recommendation)) {
		return "Tracking";
	}
	if (isConversionDraftRecommendation(recommendation)) {
		return recommendation.kind === "goal_draft" ? "Goal draft" : "Funnel draft";
	}
	if (isGoalRecommendation(recommendation)) {
		return "Goal change";
	}
	return "Recommendation";
}
