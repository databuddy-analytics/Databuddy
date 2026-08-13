"use client";

import { authClient } from "@databuddy/auth/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { InvestigationOutcome } from "@databuddy/shared/insights";
import { Button, Skeleton } from "@databuddy/ui";
import Link from "next/link";
import { toast } from "sonner";
import { List } from "@/components/ui/composables/list";
import { insightQueries, type Insight } from "@/lib/insight-api";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import {
	ArrowRightIcon,
	LightbulbIcon,
	WarningCircleIcon,
} from "@databuddy/ui/icons";

type DefinitionExecution = Extract<
	NonNullable<
		Extract<InvestigationOutcome["next"], { type: "act" }>["execution"]
	>,
	{ operation: "delete" | "edit" }
>;

export function ExecuteDefinitionAction({
	action,
	execution,
	insightId,
	definitionType,
}: {
	action: string;
	execution: DefinitionExecution;
	definitionType: "funnel" | "goal";
	insightId: string;
}) {
	const queryClient = useQueryClient();
	const memberRole = authClient.useActiveMemberRole();
	const apply = useMutation({
		...orpc.insights.applyAction.mutationOptions(),
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: `Could not apply ${definitionType} action`
			);
		},
		onSuccess: ({ reply }) => {
			queryClient.invalidateQueries({ queryKey: insightQueries.all() });
			const noun = definitionType === "funnel" ? "Funnel" : "Goal";
			toast.success(
				reply.status === "failed"
					? `${noun} change applied, but verification could not start`
					: `${noun} change applied — verifying the result`
			);
		},
	});
	const deleting = execution.operation === "delete";
	const accessReason = memberRole.isPending
		? "Checking access…"
		: memberRole.data?.role === "viewer"
			? `You have view-only access to this ${definitionType}.`
			: memberRole.data
				? null
				: `You need edit access to change this ${definitionType}.`;

	return (
		<div className="space-y-1.5">
			<Button
				disabled={Boolean(accessReason) || apply.isPending}
				loading={apply.isPending}
				onClick={() => apply.mutate({ insightId })}
				size="sm"
				tone={deleting ? "destructive" : "neutral"}
				type="button"
				variant={deleting ? "ghost" : "secondary"}
			>
				{accessReason ? "Review access" : action}
			</Button>
			{accessReason ? (
				<p className="text-muted-foreground text-xs">{accessReason}</p>
			) : null}
		</div>
	);
}

export function InvestigationRowSkeleton() {
	return (
		<div className="flex min-h-24 items-start gap-3 px-4 py-4">
			<Skeleton className="size-8 shrink-0 rounded" />
			<div className="min-w-0 flex-1 space-y-2">
				<div className="flex items-center justify-between gap-4">
					<Skeleton className="h-4 w-2/5 rounded" />
					<Skeleton className="h-3 w-14 rounded" />
				</div>
				<Skeleton className="h-3 w-full rounded" />
				<Skeleton className="h-3 w-4/5 rounded" />
				<Skeleton className="h-3 w-1/3 rounded" />
			</div>
		</div>
	);
}

function InsightStatusIcon({ insight }: { insight: Insight }) {
	const isInfo = insight.severity === "info";
	const Icon = isInfo ? LightbulbIcon : WarningCircleIcon;

	return (
		<span
			className={cn(
				"flex size-8 shrink-0 items-center justify-center rounded",
				isInfo && "bg-primary/10 text-primary",
				insight.severity === "critical" && "bg-destructive/10 text-destructive",
				insight.severity === "warning" && "bg-warning/10 text-warning"
			)}
		>
			<Icon className="size-4" weight="duotone" />
		</span>
	);
}

export function InvestigationRow({ insight }: { insight: Insight }) {
	const change = insight.changePercent;
	const severity =
		insight.severity === "critical"
			? "Critical"
			: insight.severity === "warning"
				? "Warning"
				: "Notice";

	return (
		<List.Row align="start" asChild>
			<Link href={`/insights/${insight.id}`}>
				<InsightStatusIcon insight={insight} />
				<span className="min-w-0 flex-1">
					<span className="line-clamp-2 block font-medium text-foreground text-sm leading-snug">
						{insight.title}
					</span>
					<span className="mt-1 line-clamp-2 block text-muted-foreground text-xs leading-relaxed">
						{insight.description}
					</span>
					<span className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
						<span className="truncate">
							{insight.websiteName ?? insight.websiteDomain}
						</span>
						<span className="text-muted-foreground/30">&middot;</span>
						<span
							className={cn(
								"font-medium",
								insight.severity === "critical" && "text-destructive",
								insight.severity === "warning" && "text-warning",
								insight.severity === "info" && "text-primary"
							)}
						>
							{severity}
						</span>
						{change !== undefined && change !== 0 && (
							<>
								<span className="text-muted-foreground/30">&middot;</span>
								<span
									className={cn(
										"tabular-nums",
										insight.sentiment === "positive" && "text-success",
										insight.sentiment === "negative" && "text-destructive"
									)}
								>
									{change > 0 ? "+" : ""}
									{change}%
								</span>
							</>
						)}
					</span>
				</span>
				<ArrowRightIcon
					aria-hidden
					className="mt-1 size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
					weight="bold"
				/>
			</Link>
		</List.Row>
	);
}
