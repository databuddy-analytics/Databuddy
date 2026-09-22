"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FLAG_STATS_WINDOW_DAYS } from "@databuddy/shared/flags";
import { useMemo } from "react";
import { List } from "@/components/ui/composables/list";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { FlagVariants } from "./flag-variants";
import { RolloutProgress } from "./rollout-progress";
import type { Flag, FlagStats, TargetGroup } from "./types";
import {
	ArchiveIcon,
	ClockIcon,
	DotsThreeIcon,
	FlagIcon,
	FlaskIcon,
	GaugeIcon,
	InfoIcon,
	LinkIcon,
	PencilSimpleIcon,
	ShareNetworkIcon,
	TrashIcon,
	UsersIcon,
	WarningCircleIcon,
} from "@databuddy/ui/icons";
import { DropdownMenu, Switch } from "@databuddy/ui/client";
import { Badge, Button, Skeleton, Tooltip, fromNow } from "@databuddy/ui";

interface FlagsListProps {
	flags: Flag[];
	groups: Map<string, TargetGroup[]>;
	onDelete: (flagId: string) => void;
	onEdit: (flag: Flag) => void;
	onRetryStats: () => Promise<unknown>;
	stats: Map<string, FlagStats>;
	statsError: boolean;
	statsLoading: boolean;
	websiteId: string;
}

const FLAG_LIST_MIN_WIDTH_CLASS = "min-w-[980px]";
const FLAG_ACTIVITY_ACCURACY_COPY = `Directional browser telemetry from the last ${FLAG_STATS_WINDOW_DAYS} days—not an exact count of people who used the feature. It may undercount when tracking is blocked, sampled, opted out, or evaluated on the server.`;

const TYPE_CONFIG = {
	boolean: { icon: FlagIcon, label: "Boolean", color: "text-blue-500" },
	rollout: { icon: GaugeIcon, label: "Rollout", color: "text-violet-500" },
	multivariant: {
		icon: FlaskIcon,
		label: "Multivariant",
		color: "text-pink-500",
	},
} as const;

function GroupsDisplay({ groups }: { groups: TargetGroup[] }) {
	if (groups.length === 0) {
		return null;
	}

	return (
		<div className="flex items-center gap-1.5">
			<div className="flex -space-x-1">
				{groups.slice(0, 3).map((group) => (
					<Tooltip content={group.name} delay={200} key={group.id} side="top">
						<span
							className="size-4 rounded border border-background"
							style={{ backgroundColor: group.color }}
						/>
					</Tooltip>
				))}
			</div>
			{groups.length > 3 && (
				<span className="text-muted-foreground text-xs">
					+{groups.length - 3}
				</span>
			)}
		</div>
	);
}

function StatusToggle({ flag, websiteId }: { flag: Flag; websiteId: string }) {
	const queryClient = useQueryClient();
	const isActive = flag.status === "active";

	const updateStatusMutation = useMutation({
		...orpc.flags.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.flags.list.key({
					input: { websiteId },
				}),
			});
		},
	});

	const handleChange = (checked: boolean) => {
		updateStatusMutation.mutate({
			id: flag.id,
			status: checked ? "active" : "inactive",
		});
	};

	return (
		<div className="flex items-center gap-2">
			<Switch
				aria-label={isActive ? "Disable flag" : "Enable flag"}
				checked={isActive}
				className={cn(
					updateStatusMutation.isPending && "pointer-events-none opacity-60"
				)}
				disabled={updateStatusMutation.isPending || flag.status === "archived"}
				onCheckedChange={handleChange}
			/>
			<span
				className={cn(
					"font-medium text-xs",
					isActive
						? "text-green-600 dark:text-green-400"
						: "text-muted-foreground"
				)}
			>
				{isActive ? "On" : "Off"}
			</span>
		</div>
	);
}

function FlagActions({
	flag,
	websiteId,
	onEdit,
	onDelete,
}: {
	flag: Flag;
	websiteId: string;
	onEdit: (flag: Flag) => void;
	onDelete: (flagId: string) => void;
}) {
	const queryClient = useQueryClient();

	const updateStatusMutation = useMutation({
		...orpc.flags.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.flags.list.key({
					input: { websiteId },
				}),
			});
		},
	});

	const handleArchive = () => {
		updateStatusMutation.mutate({
			id: flag.id,
			status: flag.status === "archived" ? "inactive" : "archived",
		});
	};

	return (
		<div>
			<DropdownMenu>
				<DropdownMenu.Trigger
					aria-label="Flag actions"
					className={cn(
						"inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-all duration-(--duration-quick) ease-(--ease-smooth) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50",
						"bg-transparent text-muted-foreground hover:bg-interactive-hover hover:text-foreground",
						"size-8 p-0",
						"opacity-50 hover:opacity-100 data-[state=open]:opacity-100"
					)}
				>
					<DotsThreeIcon className="size-5" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" className="w-44">
					<DropdownMenu.Item className="gap-2" onClick={() => onEdit(flag)}>
						<PencilSimpleIcon className="size-4" />
						Edit Flag
					</DropdownMenu.Item>
					<DropdownMenu.Item className="gap-2" onClick={handleArchive}>
						<ArchiveIcon className="size-4" />
						{flag.status === "archived" ? "Restore" : "Archive"}
					</DropdownMenu.Item>
					<DropdownMenu.Separator />
					<DropdownMenu.Item
						className="gap-2 text-destructive focus:text-destructive"
						onClick={() => onDelete(flag.id)}
						variant="destructive"
					>
						<TrashIcon className="size-4 fill-destructive" />
						Delete Flag
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu>
		</div>
	);
}

function DependencyBadges({
	dependencies,
	dependents,
	flagMap,
}: {
	dependencies: string[];
	dependents: Flag[];
	flagMap: Map<string, Flag>;
}) {
	if (dependencies.length === 0 && dependents.length === 0) {
		return null;
	}

	return (
		<div className="flex items-center gap-1.5">
			{dependencies.length > 0 && (
				<Tooltip
					content={
						<>
							<p className="mb-1.5 font-medium text-xs">Requires:</p>
							<div className="flex flex-col gap-1">
								{dependencies.map((depKey) => {
									const dep = flagMap.get(depKey);
									const isActive = dep?.status === "active";
									return (
										<div className="flex items-center gap-1.5" key={depKey}>
											<span
												className={cn(
													"size-1.5 rounded-full",
													isActive ? "bg-green-500" : "bg-amber-500"
												)}
											/>
											<span className="font-mono text-xs">{depKey}</span>
										</div>
									);
								})}
							</div>
						</>
					}
					delay={200}
				>
					<div className="flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-600 dark:text-blue-400">
						<LinkIcon className="size-3" />
						<span className="font-medium text-xs">{dependencies.length}</span>
					</div>
				</Tooltip>
			)}
			{dependents.length > 0 && (
				<Tooltip
					content={
						<>
							<p className="mb-1.5 font-medium text-xs">Used by:</p>
							<div className="flex flex-col gap-1">
								{dependents.map((dep) => {
									const isActive = dep.status === "active";
									return (
										<div className="flex items-center gap-1.5" key={dep.id}>
											<span
												className={cn(
													"size-1.5 rounded-full",
													isActive ? "bg-green-500" : "bg-amber-500"
												)}
											/>
											<span className="font-mono text-xs">{dep.key}</span>
										</div>
									);
								})}
							</div>
						</>
					}
					delay={200}
				>
					<div className="flex items-center gap-1 rounded bg-violet-500/10 px-1.5 py-0.5 text-violet-600 dark:text-violet-400">
						<ShareNetworkIcon className="size-3" />
						<span className="font-medium text-xs">{dependents.length}</span>
					</div>
				</Tooltip>
			)}
		</div>
	);
}

function FlagActivity({
	onRetry,
	error,
	loading,
	stats,
}: {
	onRetry: () => Promise<unknown>;
	error: boolean;
	loading: boolean;
	stats?: FlagStats;
}) {
	if (loading) {
		return <Skeleton className="h-8 w-32" />;
	}

	if (error) {
		return (
			<Button
				aria-label="Flag activity unavailable. Retry loading activity."
				className="h-auto min-h-8 min-w-[132px] justify-start gap-1.5 px-0 font-normal text-destructive hover:bg-transparent"
				onClick={onRetry}
				size="sm"
				variant="ghost"
			>
				<WarningCircleIcon className="size-3.5 shrink-0" />
				<span>Activity unavailable</span>
			</Button>
		);
	}

	if (!stats?.lastEvaluatedAt) {
		return (
			<span className="text-center text-[11px] text-muted-foreground/70">
				No activity in {FLAG_STATS_WINDOW_DAYS}d
			</span>
		);
	}

	return (
		<div className="flex min-w-[150px] items-center gap-1">
			<div className="flex min-w-0 flex-1 flex-col gap-0.5 text-xs">
				<span className="flex items-center gap-1.5 whitespace-nowrap text-foreground">
					<ClockIcon className="size-3.5 shrink-0" />
					<span>Last seen {fromNow(stats.lastEvaluatedAt)}</span>
				</span>
				<span className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-muted-foreground">
					<UsersIcon className="size-3.5 shrink-0" />
					<span>
						{stats.evaluatedUsers.toLocaleString()} observed ·{" "}
						{FLAG_STATS_WINDOW_DAYS}d
					</span>
				</span>
			</div>
			<Tooltip
				content={
					<div className="max-w-64 space-y-1.5 text-xs">
						<p className="font-medium">Observed activity</p>
						<p className="text-muted-foreground">
							{FLAG_ACTIVITY_ACCURACY_COPY}
						</p>
						<p>
							{stats.identifiedUsers.toLocaleString()} identified visitors ·{" "}
							{stats.evaluationCount.toLocaleString()} evaluations
						</p>
					</div>
				}
				delay={200}
			>
				<Button
					aria-label="Learn about flag activity accuracy"
					className="size-6 shrink-0 p-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
					size="icon-sm"
					variant="ghost"
				>
					<InfoIcon className="size-3.5" />
				</Button>
			</Tooltip>
		</div>
	);
}

function FlagsListHead() {
	return (
		<List.Head className={cn(FLAG_LIST_MIN_WIDTH_CLASS, "items-center")}>
			<div className="flex min-w-0 flex-1 items-center gap-4">
				<span className="flex max-w-[min(320px,100%)] shrink-0">Flag</span>
				<span className="min-w-0 flex-1">Description</span>
				<span className="flex w-[100px] shrink-0 justify-center">Type</span>
				<span className="flex w-20 shrink-0 justify-center">Rollout</span>
				<span className="flex w-[100px] shrink-0 justify-center">Rules</span>
				<span className="flex w-[100px] shrink-0 justify-center">Groups</span>
			</div>
			<span className="flex w-[150px] shrink-0 items-center justify-center gap-1.5">
				Activity
				<Tooltip
					content={
						<div className="max-w-64 space-y-1.5 text-xs">
							<p className="font-medium">Observed activity</p>
							<p className="text-muted-foreground">
								{FLAG_ACTIVITY_ACCURACY_COPY}
							</p>
						</div>
					}
					delay={200}
				>
					<Button
						aria-label="Learn about flag activity accuracy"
						className="size-6 p-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
						size="icon-sm"
						variant="ghost"
					>
						<InfoIcon className="size-3.5" />
					</Button>
				</Tooltip>
			</span>
			<span className="flex w-[120px] shrink-0 justify-center">Status</span>
			<span aria-hidden="true" className="w-8 shrink-0" />
		</List.Head>
	);
}

function FlagRow({
	flag,
	groups,
	dependents,
	flagMap,
	onRetryStats,
	stats,
	statsError,
	statsLoading,
	onEdit,
	onDelete,
	websiteId,
}: {
	flag: Flag;
	groups: TargetGroup[];
	dependents: Flag[];
	flagMap: Map<string, Flag>;
	onRetryStats: () => Promise<unknown>;
	stats?: FlagStats;
	statsError: boolean;
	statsLoading: boolean;
	onEdit: (flag: Flag) => void;
	onDelete: (flagId: string) => void;
	websiteId: string;
}) {
	const typeConfig =
		TYPE_CONFIG[flag.type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.boolean;
	const TypeIconComponent = typeConfig.icon;
	const ruleCount = flag.rules?.length ?? 0;
	const variantCount = flag.variants?.length ?? 0;
	const rollout = flag.rolloutPercentage ?? 0;
	const dependencies = flag.dependencies ?? [];

	return (
		<List.Row
			className={cn(
				FLAG_LIST_MIN_WIDTH_CLASS,
				"text-left",
				flag.status === "archived" && "opacity-50"
			)}
		>
			<Button
				className="min-w-0 flex-1 justify-start gap-4 rounded-none bg-transparent p-0 text-left font-normal text-foreground hover:bg-transparent active:scale-100"
				onClick={() => onEdit(flag)}
				variant="ghost"
			>
				<span className="flex min-w-0 max-w-[min(320px,100%)] shrink-0 items-center gap-3">
					<span
						className={cn("shrink-0 rounded bg-accent p-1.5", typeConfig.color)}
					>
						<TypeIconComponent className="size-4" />
					</span>
					<span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
						<span className="flex min-w-0 flex-wrap items-center gap-2">
							<span className="wrap-break-word text-pretty text-start font-medium text-foreground text-sm">
								{flag.name ?? flag.key}
							</span>
							<DependencyBadges
								dependencies={dependencies}
								dependents={dependents}
								flagMap={flagMap}
							/>
						</span>
						<span className="max-w-full truncate rounded px-1.5 font-mono text-muted-foreground text-xs">
							{flag.key}
						</span>
					</span>
				</span>

				<span className="flex min-w-0 flex-1 items-center">
					{flag.description ? (
						<span className="wrap-break-word text-pretty text-muted-foreground text-xs">
							{flag.description}
						</span>
					) : null}
				</span>

				<span className="flex w-[100px] shrink-0 justify-center">
					<Badge className="font-normal" variant="muted">
						{typeConfig.label}
					</Badge>
				</span>

				<span className="flex w-20 shrink-0 justify-center">
					{flag.type === "rollout" && rollout > 0 && (
						<RolloutProgress percentage={rollout} />
					)}
				</span>

				<span className="flex w-[100px] shrink-0 justify-center">
					{(ruleCount > 0 || variantCount > 0) && (
						<span className="flex flex-col gap-0.5 text-center text-muted-foreground text-xs">
							{ruleCount > 0 && (
								<span>
									{ruleCount} {ruleCount === 1 ? "rule" : "rules"}
								</span>
							)}
							{variantCount > 0 && (
								<FlagVariants variants={flag.variants ?? []} />
							)}
						</span>
					)}
				</span>

				<span className="flex w-[100px] shrink-0 justify-center">
					<GroupsDisplay groups={groups} />
				</span>
			</Button>

			<List.Cell className="w-[150px] justify-center">
				<FlagActivity
					error={statsError}
					loading={statsLoading}
					onRetry={onRetryStats}
					stats={stats}
				/>
			</List.Cell>

			<List.Cell className="flex w-[120px] shrink-0 justify-center">
				{flag.status === "archived" ? (
					<Badge className="gap-1" variant="warning">
						<ArchiveIcon className="size-3" />
						Archived
					</Badge>
				) : (
					<StatusToggle flag={flag} websiteId={websiteId} />
				)}
			</List.Cell>

			<List.Cell action>
				<FlagActions
					flag={flag}
					onDelete={onDelete}
					onEdit={onEdit}
					websiteId={websiteId}
				/>
			</List.Cell>
		</List.Row>
	);
}

export function FlagsList({
	flags,
	groups,
	websiteId,
	onRetryStats,
	stats,
	statsError,
	statsLoading,
	onEdit,
	onDelete,
}: FlagsListProps) {
	const flagMap = useMemo(() => {
		const map = new Map<string, Flag>();
		for (const f of flags) {
			map.set(f.key, f);
		}
		return map;
	}, [flags]);

	const dependentsMap = useMemo(() => {
		const map = new Map<string, Flag[]>();
		for (const f of flags) {
			if (f.dependencies) {
				for (const depKey of f.dependencies) {
					const existing = map.get(depKey) || [];
					existing.push(f);
					map.set(depKey, existing);
				}
			}
		}
		return map;
	}, [flags]);

	return (
		<List className="rounded bg-card">
			<FlagsListHead />
			{flags.map((flag) => (
				<FlagRow
					dependents={dependentsMap.get(flag.key) ?? []}
					flag={flag}
					flagMap={flagMap}
					groups={groups.get(flag.id) ?? []}
					key={flag.id}
					onRetryStats={onRetryStats}
					stats={stats.get(flag.key)}
					statsError={statsError}
					statsLoading={statsLoading}
					onDelete={onDelete}
					onEdit={onEdit}
					websiteId={websiteId}
				/>
			))}
		</List>
	);
}

export function FlagsListSkeleton() {
	return (
		<List className="rounded bg-card">
			<FlagsListHead />
			{Array.from({ length: 5 }).map((_, i) => (
				<div
					className={cn(
						FLAG_LIST_MIN_WIDTH_CLASS,
						"flex min-h-15 items-center gap-4 border-border/80 border-b px-4 py-3 last:border-b-0"
					)}
					key={`skeleton-${i + 1}`}
				>
					<div className="flex min-w-0 max-w-[min(320px,100%)] shrink-0 items-center gap-3">
						<Skeleton className="size-7 shrink-0 rounded" />
						<div className="min-w-0 flex-1 space-y-1.5">
							<Skeleton className="h-4 w-28 max-w-full" />
							<Skeleton className="h-3 w-36 max-w-full" />
						</div>
					</div>
					<div className="min-w-0 flex-1">
						<Skeleton className="h-3 w-full max-w-md" />
					</div>
					<div className="flex w-[100px] shrink-0 justify-center">
						<Skeleton className="h-5 w-16" />
					</div>
					<div className="flex w-20 shrink-0 justify-center">
						<Skeleton className="h-4 w-10" />
					</div>
					<div className="flex w-[100px] shrink-0 justify-center">
						<Skeleton className="h-3 w-12" />
					</div>
					<div className="flex w-[100px] shrink-0 justify-center">
						<Skeleton className="h-4 w-12" />
					</div>
					<div className="flex w-[150px] shrink-0 justify-center">
						<Skeleton className="h-8 w-32" />
					</div>
					<div className="flex w-[120px] shrink-0 justify-center">
						<Skeleton className="h-5 w-14" />
					</div>
					<div className="flex w-[60px] shrink-0 justify-end">
						<Skeleton className="size-8 rounded" />
					</div>
				</div>
			))}
		</List>
	);
}
