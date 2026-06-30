"use client";

import { useSetAtom } from "jotai";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type {
	BaseComponentProps,
	DashboardActionInput,
} from "@/lib/ai-components/types";
import { buildDashboardActionHref } from "@/lib/dashboard-navigation-actions";
import { cn } from "@/lib/utils";
import { dynamicQueryFiltersAtom } from "@/stores/jotai/filterAtoms";
import { ArrowRightIcon, CompassIcon, FilterIcon } from "@databuddy/ui/icons";
import { Button, Tooltip } from "@databuddy/ui";

export interface DashboardActionsProps extends BaseComponentProps {
	actions: DashboardActionInput[];
	title?: string;
	websiteId?: string;
}

function getWebsiteIdFromParams(params: ReturnType<typeof useParams>) {
	const id = params.id;
	return typeof id === "string" ? id : null;
}

function ActionButton({
	action,
	href,
	onNavigate,
}: {
	action: DashboardActionInput;
	href: string;
	onNavigate: () => void;
}) {
	const button = (
		<Button
			className="h-7 min-w-0 max-w-full justify-start gap-1.5 px-2 text-xs"
			onClick={onNavigate}
			size="sm"
			type="button"
			variant="secondary"
		>
			<span className="truncate">{action.label}</span>
			{action.filters && action.filters.length > 0 ? (
				<span className="inline-flex shrink-0 items-center gap-1 rounded border border-border/60 bg-background/60 px-1 py-0.5 font-normal text-[10px] text-muted-foreground">
					<FilterIcon className="size-2.5" weight="duotone" />
					{action.filters.length}
				</span>
			) : null}
			<ArrowRightIcon
				aria-hidden
				className="size-3.5 shrink-0 text-muted-foreground"
			/>
		</Button>
	);

	return (
		<Tooltip content={action.description ?? href} delay={250}>
			{button}
		</Tooltip>
	);
}

export function DashboardActionsRenderer({
	actions,
	className,
	title = "Open in dashboard",
	websiteId,
}: DashboardActionsProps) {
	const router = useRouter();
	const params = useParams();
	const searchParams = useSearchParams();
	const setFilters = useSetAtom(dynamicQueryFiltersAtom);
	const currentWebsiteId = websiteId ?? getWebsiteIdFromParams(params);
	const resolvedActions = actions
		.map((action) => ({
			action,
			href: buildDashboardActionHref({
				currentSearchParams: searchParams,
				currentWebsiteId,
				eventName: action.eventName,
				filters: action.filters,
				href: action.href,
				params: action.params,
				preserveAnalyticsContext: action.preserveAnalyticsContext,
				target: action.target,
				websiteId: action.websiteId ?? websiteId,
			}),
		}))
		.filter(
			(item): item is { action: DashboardActionInput; href: string } =>
				typeof item.href === "string"
		);

	if (resolvedActions.length === 0) {
		return null;
	}

	const showTitle = title !== "Open in dashboard" || resolvedActions.length > 1;

	return (
		<div
			className={cn(
				"inline-flex min-w-0 max-w-full flex-wrap items-center gap-1 rounded-md border border-border/50 bg-background/70 p-1 shadow-xs",
				className
			)}
		>
			{showTitle ? (
				<>
					<span className="flex h-7 min-w-0 max-w-44 shrink-0 items-center gap-1.5 px-1.5 text-muted-foreground text-xs">
						<CompassIcon
							aria-hidden
							className="size-3.5 shrink-0"
							weight="duotone"
						/>
						<span className="truncate">{title}</span>
					</span>
					<span aria-hidden className="h-4 w-px bg-border/70" />
				</>
			) : null}
			{resolvedActions.map(({ action, href }) => (
				<ActionButton
					action={action}
					href={href}
					key={`${href}-${action.label}`}
					onNavigate={() => {
						if (action.filters !== undefined) {
							setFilters(action.filters);
						}
						router.push(href);
					}}
				/>
			))}
		</div>
	);
}
