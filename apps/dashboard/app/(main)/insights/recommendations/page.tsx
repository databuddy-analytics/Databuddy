"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { authClient } from "@databuddy/auth/client";
import type {
	InsightMeasurementRecommendation,
	InsightRecommendation as SharedInsightRecommendation,
} from "@databuddy/shared/insights";
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
import { Accordion } from "@databuddy/ui/client";
import {
	ArrowRightIcon,
	ArrowSquareOutIcon,
	CheckCircleIcon,
	CodeIcon,
	FilterIcon,
	IdBadge2Icon,
	PencilSimpleIcon,
	TargetIcon,
	TrashIcon,
	WrenchIcon,
} from "@databuddy/ui/icons";
import { ConversionDraftRecommendationAction } from "../_components/conversion-draft-recommendation";

type Recommendation = NonNullable<SharedInsightRecommendation>;
type DatabuddySetupRecommendation = Extract<
	Recommendation,
	{ kind: "databuddy_setup" }
>;
type DefinitionRecommendation = Extract<
	Recommendation,
	{ operation: "delete" | "edit" }
>;
type ConversionDraftRecommendation = Extract<
	InsightMeasurementRecommendation,
	{ kind: "goal_draft" | "funnel_draft" }
>;
type InstrumentationRecommendation = Extract<
	InsightMeasurementRecommendation,
	{ kind: "instrumentation" }
>;

export default function RecommendationsPage() {
	const { activeOrganization, activeOrganizationId } =
		useOrganizationsContext();
	const organizationId =
		activeOrganization?.id ?? activeOrganizationId ?? undefined;

	return (
		<div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
			<Card aria-label="Recommendations" className="border-border/70 shadow-sm">
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
	const completed = recommendations.data?.pages[0]?.completed ?? [];

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

	if (recommendations.isError && items.length === 0 && completed.length === 0) {
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

	if (items.length === 0 && completed.length === 0) {
		return (
			<div className="px-5 py-12">
				<EmptyState
					description="Suggestions from recent analysis will appear here."
					icon={<WrenchIcon aria-hidden weight="duotone" />}
					title="No recommendations"
					variant="minimal"
				/>
			</div>
		);
	}

	return (
		<>
			{items.length > 0 ? (
				<ul aria-label="Current recommendations">
					{items.map((insight) => (
						<RecommendationRow insight={insight} key={insight.id} />
					))}
				</ul>
			) : (
				<div className="flex items-center gap-2 px-4 py-3 text-muted-foreground text-sm">
					<CheckCircleIcon
						aria-hidden
						className="size-4 text-success"
						weight="fill"
					/>
					Nothing needs attention right now.
				</div>
			)}
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
			{completed.length > 0 ? (
				<CompletedRecommendations insights={completed} />
			) : null}
		</>
	);
}

function CompletedRecommendations({
	insights,
}: {
	insights: InsightRecommendation[];
}) {
	return (
		<Accordion className="border-t">
			<Accordion.Trigger className="bg-success/5 hover:bg-success/10">
				<CheckCircleIcon
					aria-hidden
					className="size-4 text-success"
					weight="fill"
				/>
				<span className="font-medium text-foreground">Completed</span>
				<Badge size="sm" variant="success">
					{insights.length}
				</Badge>
				<span className="text-muted-foreground">Latest verified</span>
			</Accordion.Trigger>
			<Accordion.Panel>
				<ul aria-label="Latest verified completed recommendations">
					{insights.map((insight) => (
						<RecommendationRow completed insight={insight} key={insight.id} />
					))}
				</ul>
			</Accordion.Panel>
		</Accordion>
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

function RecommendationRow({
	completed = false,
	insight,
}: {
	completed?: boolean;
	insight: InsightRecommendation;
}) {
	const { recommendation } = insight;
	const presentation = getRecommendationPresentation(insight);
	const SignalIcon = completed ? CheckCircleIcon : presentation.icon;
	const action = completed ? null : recommendationAction(insight);

	return (
		<List.Row align="start" asChild interactive={false}>
			<li>
				<span
					className={`flex size-8 shrink-0 items-center justify-center rounded ${
						completed
							? "bg-success/10 text-success"
							: presentation.iconClassName
					}`}
				>
					<SignalIcon
						aria-hidden
						className="size-4"
						weight={completed ? "fill" : "duotone"}
					/>
				</span>
				<div className="min-w-0 flex-1 sm:flex sm:items-start sm:gap-4">
					<div className="min-w-0 flex-1">
						<span className="flex flex-wrap items-center gap-2">
							<Badge
								className={
									!completed && presentation.badgeVariant === "primary"
										? "bg-brand-purple text-white"
										: undefined
								}
								size="sm"
								variant={completed ? "success" : presentation.badgeVariant}
							>
								{completed ? "Completed" : presentation.label}
							</Badge>
							<span className="min-w-0 truncate text-[11px] text-muted-foreground">
								{insight.websiteName ?? insight.websiteDomain}
								{completed ? null : ` · ${fromNow(insight.createdAt)}`}
							</span>
						</span>
						<p className="mt-2 break-words font-medium text-foreground text-sm leading-relaxed [overflow-wrap:anywhere]">
							{completed ? completionMessage(insight) : recommendation.action}
						</p>
						{completed ? null : (
							<p className="mt-1.5 break-words text-muted-foreground text-xs leading-relaxed [overflow-wrap:anywhere]">
								<span className="font-medium text-foreground/75">
									{insight.impact ? "Why it matters: " : "Context: "}
								</span>
								{insight.impact ?? insight.summary}
							</p>
						)}
						{!completed && isInstrumentationRecommendation(recommendation) ? (
							<ul className="mt-2 space-y-1.5 text-muted-foreground text-xs leading-relaxed">
								{recommendation.events.map((event) => (
									<li key={event.name}>
										<span className="font-medium text-foreground/85">
											{event.name}
										</span>
										<span className="mx-1">—</span>
										{event.description}
									</li>
								))}
							</ul>
						) : null}
						{insight.investigationId ? (
							<Link
								aria-label={`View insight: ${insight.title}`}
								className="mt-2 inline-flex items-center gap-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
								href={`/insights/${insight.investigationId}`}
							>
								View insight
								<ArrowRightIcon aria-hidden className="size-3" />
							</Link>
						) : null}
					</div>
					{action ? (
						<div className="mt-3 flex shrink-0 flex-wrap gap-1.5 sm:mt-0 sm:justify-end">
							{action}
						</div>
					) : null}
				</div>
			</li>
		</List.Row>
	);
}

function completionMessage(insight: InsightRecommendation) {
	const { recommendation } = insight;
	if (isConversionDraftRecommendation(recommendation)) {
		return recommendation.kind === "goal_draft"
			? "Goal is now set up."
			: "Funnel is now set up.";
	}
	if (isDefinitionRecommendation(recommendation)) {
		const noun = insight.signal.entity.type === "funnel" ? "Funnel" : "Goal";
		return recommendation.operation === "delete"
			? `${noun} is no longer present.`
			: `${noun} change is now set up.`;
	}
	return "This recommendation is complete.";
}

function recommendationAction(insight: InsightRecommendation) {
	const { recommendation } = insight;
	if (isConversionDraftRecommendation(recommendation)) {
		return (
			<ConversionDraftRecommendationAction
				recommendation={recommendation}
				websiteId={insight.websiteId}
			/>
		);
	}
	if (
		(insight.signal.entity.type === "goal" ||
			insight.signal.entity.type === "funnel") &&
		isDefinitionRecommendation(recommendation)
	) {
		return (
			<DefinitionRecommendationAction
				definitionId={insight.signal.entity.id}
				definitionType={insight.signal.entity.type}
				recommendation={recommendation}
				websiteId={insight.websiteId}
			/>
		);
	}
	if (isInstrumentationRecommendation(recommendation)) {
		return (
			<Button asChild size="sm">
				<Link
					href="https://www.databuddy.cc/docs/hooks"
					rel="noreferrer"
					target="_blank"
				>
					Event tracking guide
					<ArrowSquareOutIcon aria-hidden className="size-3.5" />
					<span className="sr-only">(opens in a new tab)</span>
				</Link>
			</Button>
		);
	}
	if (isDatabuddySetupRecommendation(recommendation)) {
		if (recommendation.feature === "user_identification") {
			return (
				<Button asChild size="sm">
					<Link
						href="https://www.databuddy.cc/docs/sdk/identify-users"
						rel="noreferrer"
						target="_blank"
					>
						Identification guide
						<ArrowSquareOutIcon aria-hidden className="size-3.5" />
						<span className="sr-only">(opens in a new tab)</span>
					</Link>
				</Button>
			);
		}
		return (
			<Button asChild size="sm">
				<Link
					href={`/websites/${encodeURIComponent(insight.websiteId)}/settings/tracking`}
				>
					Open tracking setup
					<ArrowRightIcon aria-hidden className="size-3.5" />
				</Link>
			</Button>
		);
	}
	return null;
}

function DefinitionRecommendationAction({
	definitionId,
	definitionType,
	recommendation,
	websiteId,
}: {
	definitionId: string;
	definitionType: "funnel" | "goal";
	recommendation: DefinitionRecommendation;
	websiteId: string;
}) {
	const deleting = recommendation.operation === "delete";
	const noun = definitionType === "funnel" ? "funnel" : "goal";
	const memberRole = authClient.useActiveMemberRole();
	const accessReason = memberRole.isPending
		? "Checking access…"
		: memberRole.data?.role === "viewer"
			? "You have view-only access to this website."
			: memberRole.data
				? null
				: `You need edit access to change this ${noun}.`;
	const label = deleting ? `Delete ${noun}` : `Review ${noun} changes`;

	if (accessReason) {
		return (
			<div className="space-y-1.5 sm:max-w-48">
				<Button
					disabled
					size="sm"
					tone={deleting ? "destructive" : "neutral"}
					type="button"
					variant={deleting ? "ghost" : "primary"}
				>
					{label}
				</Button>
				<p className="text-muted-foreground text-xs sm:text-right">
					{accessReason}
				</p>
			</div>
		);
	}

	return (
		<Button
			asChild
			size="sm"
			tone={deleting ? "destructive" : "neutral"}
			variant={deleting ? "ghost" : "primary"}
		>
			<Link
				href={{
					pathname: `/websites/${encodeURIComponent(websiteId)}/${noun}s`,
					query: {
						command: `${recommendation.operation}-${noun}`,
						...(definitionType === "goal"
							? { goalId: definitionId }
							: { funnelId: definitionId }),
						...(recommendation.changes?.description
							? { description: recommendation.changes.description }
							: {}),
						...(recommendation.changes?.name
							? { name: recommendation.changes.name }
							: {}),
					},
				}}
			>
				{label}
			</Link>
		</Button>
	);
}

function isDefinitionRecommendation(
	recommendation: Recommendation
): recommendation is DefinitionRecommendation {
	return (
		"operation" in recommendation &&
		(recommendation.operation === "delete" ||
			recommendation.operation === "edit")
	);
}

function isDatabuddySetupRecommendation(
	recommendation: Recommendation
): recommendation is DatabuddySetupRecommendation {
	return "kind" in recommendation && recommendation.kind === "databuddy_setup";
}

function isConversionDraftRecommendation(
	recommendation: Recommendation
): recommendation is ConversionDraftRecommendation {
	return (
		"kind" in recommendation &&
		(recommendation.kind === "goal_draft" ||
			recommendation.kind === "funnel_draft")
	);
}

function isInstrumentationRecommendation(
	recommendation: Recommendation
): recommendation is InstrumentationRecommendation {
	return "kind" in recommendation && recommendation.kind === "instrumentation";
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
	const { recommendation } = insight;
	if (isDatabuddySetupRecommendation(recommendation)) {
		const isTracking = recommendation.feature === "tracking";
		return {
			badgeVariant: "warning",
			icon: isTracking ? CodeIcon : IdBadge2Icon,
			iconClassName: "bg-warning/10 text-warning",
			label: isTracking ? "Check tracking" : "Identify users",
		};
	}
	if (isInstrumentationRecommendation(recommendation)) {
		return {
			badgeVariant: "warning",
			icon: CodeIcon,
			iconClassName: "bg-warning/10 text-warning",
			label: "Add events",
		};
	}
	if (isConversionDraftRecommendation(recommendation)) {
		return recommendation.kind === "goal_draft"
			? {
					badgeVariant: "primary",
					icon: TargetIcon,
					iconClassName: "bg-brand-purple/10 text-brand-purple",
					label: "Create goal",
				}
			: {
					badgeVariant: "primary",
					icon: FilterIcon,
					iconClassName: "bg-brand-purple/10 text-brand-purple",
					label: "Create funnel",
				};
	}
	if (
		(insight.signal.entity.type === "goal" ||
			insight.signal.entity.type === "funnel") &&
		isDefinitionRecommendation(recommendation)
	) {
		return recommendation.operation === "delete"
			? {
					badgeVariant: "destructive",
					icon: TrashIcon,
					iconClassName: "bg-destructive/10 text-destructive",
					label: `Delete ${insight.signal.entity.type}`,
				}
			: {
					badgeVariant: "primary",
					icon: PencilSimpleIcon,
					iconClassName: "bg-brand-purple/10 text-brand-purple",
					label: `Edit ${insight.signal.entity.type}`,
				};
	}
	return {
		badgeVariant: "muted",
		icon: WrenchIcon,
		iconClassName: "bg-muted text-muted-foreground",
		label: "Suggestion",
	};
}
