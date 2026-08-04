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
import {
	CodeIcon,
	FlagIcon,
	FilterIcon,
	IdBadge2Icon,
	PencilSimpleIcon,
	TargetIcon,
	TrashIcon,
	UsersThreeIcon,
	WarningIcon,
	WrenchIcon,
} from "@databuddy/ui/icons";
import { InstrumentationRecommendationDetails } from "../_components/conversion-draft-recommendation";
import {
	hasNativeRecommendationAction,
	NativeRecommendationAction,
} from "../_components/native-recommendation-action";
import {
	getNativeRecommendationIntent,
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
					icon={<WrenchIcon aria-hidden weight="duotone" />}
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
					icon={<WrenchIcon aria-hidden weight="duotone" />}
					title="No recommendations"
					variant="minimal"
				/>
			</div>
		);
	}

	return (
		<>
			<ul>
				{items.map((insight) => (
					<RecommendationRow insight={insight} key={insight.id} />
				))}
			</ul>
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
	const presentation = getRecommendationPresentation(insight);
	const SignalIcon = presentation.icon;
	const signalStatus = getSignalStatus(insight);
	const hasAction = hasNativeRecommendationAction(insight);

	return (
		<List.Row align="start" asChild interactive={false}>
			<li>
				<span
					className={`flex size-8 shrink-0 items-center justify-center rounded ${presentation.iconClassName}`}
				>
					<SignalIcon aria-hidden className="size-4" weight="duotone" />
				</span>
				<div className="min-w-0 flex-1 sm:flex sm:items-start sm:gap-4">
					<div className="min-w-0 flex-1">
						<span className="flex flex-wrap items-center gap-2">
							<Badge
								className={
									presentation.badgeVariant === "primary"
										? "bg-brand-purple text-white"
										: undefined
								}
								size="sm"
								variant={presentation.badgeVariant}
							>
								{presentation.label}
							</Badge>
							{signalStatus ? (
								<Badge size="sm" variant={signalStatus.variant}>
									<WarningIcon aria-hidden className="size-3" weight="fill" />
									{signalStatus.label}
								</Badge>
							) : null}
							<span className="min-w-0 truncate text-[11px] text-muted-foreground">
								{insight.websiteName ?? insight.websiteDomain} ·{" "}
								{fromNow(insight.createdAt)}
							</span>
						</span>
						<p className="mt-2 break-words font-medium text-foreground text-sm leading-relaxed [overflow-wrap:anywhere]">
							{recommendation.action}
						</p>
						<p className="mt-1.5 break-words text-muted-foreground text-xs leading-relaxed [overflow-wrap:anywhere]">
							<span className="font-medium text-foreground/75">
								{insight.impact ? "Why it matters: " : "Context: "}
							</span>
							{insight.impact ?? insight.summary}
						</p>
						{isInstrumentationRecommendation(recommendation) ? (
							<InstrumentationRecommendationDetails
								events={recommendation.events}
							/>
						) : null}
						<p className="mt-2 break-words text-muted-foreground text-xs leading-relaxed [overflow-wrap:anywhere]">
							Based on{" "}
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
						</p>
					</div>
					{hasAction ? (
						<div className="mt-3 flex shrink-0 flex-wrap gap-1.5 sm:mt-0 sm:justify-end">
							<NativeRecommendationAction insight={insight} />
						</div>
					) : null}
				</div>
			</li>
		</List.Row>
	);
}

type BadgeVariant = "destructive" | "muted" | "primary" | "warning";

interface RecommendationPresentation {
	badgeVariant: BadgeVariant;
	icon: typeof WrenchIcon;
	iconClassName: string;
	label: string;
}

function getRecommendationPresentation(
	insight: InsightRecommendation
): RecommendationPresentation {
	const action = getNativeRecommendationIntent(insight);
	switch (action?.type) {
		case "databuddy_setup.guide":
			return {
				badgeVariant: "warning",
				icon: IdBadge2Icon,
				iconClassName: "bg-warning/10 text-warning",
				label: "Identify users",
			};
		case "measurement_gap.guide":
			return {
				badgeVariant: "warning",
				icon: TargetIcon,
				iconClassName: "bg-warning/10 text-warning",
				label: "Measure conversion",
			};
		case "instrumentation.guide":
			return {
				badgeVariant: "warning",
				icon: CodeIcon,
				iconClassName: "bg-warning/10 text-warning",
				label: "Add events",
			};
		case "goal.create":
			return {
				badgeVariant: "primary",
				icon: TargetIcon,
				iconClassName: "bg-brand-purple/10 text-brand-purple",
				label: "Create goal",
			};
		case "funnel.create":
			return {
				badgeVariant: "primary",
				icon: FilterIcon,
				iconClassName: "bg-brand-purple/10 text-brand-purple",
				label: "Create funnel",
			};
		case "goal.delete":
			return {
				badgeVariant: "destructive",
				icon: TrashIcon,
				iconClassName: "bg-destructive/10 text-destructive",
				label: "Delete goal",
			};
		case "goal.update":
			return {
				badgeVariant: "primary",
				icon: PencilSimpleIcon,
				iconClassName: "bg-brand-purple/10 text-brand-purple",
				label: "Edit goal",
			};
		case "feature_flag.create":
			return {
				badgeVariant: "primary",
				icon: FlagIcon,
				iconClassName: "bg-brand-purple/10 text-brand-purple",
				label: "Create feature flag",
			};
		case "target_group.create":
			return {
				badgeVariant: "primary",
				icon: UsersThreeIcon,
				iconClassName: "bg-brand-purple/10 text-brand-purple",
				label: "Create target group",
			};
		default:
			return {
				badgeVariant: "muted",
				icon: WrenchIcon,
				iconClassName: "bg-muted text-muted-foreground",
				label: "Suggestion",
			};
	}
}

function getSignalStatus(insight: InsightRecommendation): {
	label: string;
	variant: "destructive" | "warning";
} | null {
	if (insight.signal.sentiment !== "negative") {
		return null;
	}
	if (insight.signal.severity === "critical") {
		return { label: "Critical signal", variant: "destructive" };
	}
	if (insight.signal.severity === "warning") {
		return { label: "Warning signal", variant: "warning" };
	}
	return null;
}
