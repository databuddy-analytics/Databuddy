"use client";

import { ArchiveIcon } from "@phosphor-icons/react";
import { DotsThreeIcon } from "@phosphor-icons/react";
import { FlagIcon } from "@phosphor-icons/react";
import { FlaskIcon } from "@phosphor-icons/react";
import { GaugeIcon } from "@phosphor-icons/react";
import { LinkIcon } from "@phosphor-icons/react";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { ShareNetworkIcon } from "@phosphor-icons/react";
import { TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { List } from "@/components/ui/composables/list";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { FlagKey } from "./flag-key";
import { FlagVariants } from "./flag-variants";
import { RolloutProgress } from "./rollout-progress";
import type { Flag, TargetGroup } from "./types";

interface FlagsListProps {
	flags: Flag[];
	groups: Map<string, TargetGroup[]>;
	onDelete: (flagId: string) => void;
	onEdit: (flag: Flag) => void;
}

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
					<Tooltip delayDuration={200} key={group.id}>
						<TooltipTrigger asChild>
							<span
								className="size-4 rounded border border-background"
								style={{ backgroundColor: group.color }}
							/>
						</TooltipTrigger>
						<TooltipContent side="top">{group.name}</TooltipContent>
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

function StatusToggle({ flag }: { flag: Flag }) {
	const queryClient = useQueryClient();
	const isActive = flag.status === "active";

	const updateStatusMutation = useMutation({
		...orpc.flags.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.flags.list.key({
					input: { websiteId: flag.websiteId ?? "" },
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
	onEdit,
	onDelete,
}: {
	flag: Flag;
	onEdit: (flag: Flag) => void;
	onDelete: (flagId: string) => void;
}) {
	const queryClient = useQueryClient();

	const updateStatusMutation = useMutation({
		...orpc.flags.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.flags.list.key({
					input: { websiteId: flag.websiteId ?? "" },
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
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					aria-label="Flag actions"
					className="size-8 opacity-50 hover:opacity-100 data-[state=open]:opacity-100"
					size="icon"
					variant="ghost"
				>
					<DotsThreeIcon className="size-5" weight="bold" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-44">
				<DropdownMenuItem className="gap-2" onClick={() => onEdit(flag)}>
					<PencilSimpleIcon className="size-4" weight="duotone" />
					Edit Flag
				</DropdownMenuItem>
				<DropdownMenuItem className="gap-2" onClick={handleArchive}>
					<ArchiveIcon className="size-4" weight="duotone" />
					{flag.status === "archived" ? "Restore" : "Archive"}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					className="gap-2 text-destructive focus:text-destructive"
					onClick={() => onDelete(flag.id)}
					variant="destructive"
				>
					<TrashIcon className="size-4 fill-destructive" weight="duotone" />
					Delete Flag
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
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
				<Tooltip delayDuration={200}>
					<TooltipTrigger asChild>
						<div className="flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-600 dark:text-blue-400">
							<LinkIcon className="size-3" />
							<span className="font-medium text-xs">{dependencies.length}</span>
						</div>
					</TooltipTrigger>
					<TooltipContent>
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
					</TooltipContent>
				</Tooltip>
			)}
			{dependents.length > 0 && (
				<Tooltip delayDuration={200}>
					<TooltipTrigger asChild>
						<div className="flex items-center gap-1 rounded bg-violet-500/10 px-1.5 py-0.5 text-violet-600 dark:text-violet-400">
							<ShareNetworkIcon className="size-3" weight="fill" />
							<span className="font-medium text-xs">{dependents.length}</span>
						</div>
					</TooltipTrigger>
					<TooltipContent>
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
					</TooltipContent>
				</Tooltip>
			)}
		</div>
	);
}

function FlagRow({
	flag,
	groups,
	dependents,
	flagMap,
	onEdit,
	onDelete,
}: {
	flag: Flag;
	groups: TargetGroup[];
	dependents: Flag[];
	flagMap: Map<string, Flag>;
	onEdit: (flag: Flag) => void;
	onDelete: (flagId: string) => void;
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
			asChild
			className={cn(
				"min-w-full cursor-pointer text-left",
				flag.status === "archived" && "opacity-50"
			)}
		>
			{/* biome-ignore lint/a11y/useSemanticElements: List.Row asChild replaces this element; a real <button> would nest inside the action-cell buttons */}
			<div
				onClick={() => onEdit(flag)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onEdit(flag);
					}
				}}
				role="button"
				tabIndex={0}
			>
				<List.Cell
					className="min-w-0 max-w-[min(320px,100%)] shrink-0"
					onClick={(e) => e.stopPropagation()}
					onKeyDown={(e) => e.stopPropagation()}
				>
					<div className="flex min-w-0 items-center gap-3">
						<div
							className={cn(
								"shrink-0 rounded bg-accent p-1.5",
								typeConfig.color
							)}
						>
							<TypeIconComponent className="size-4" weight="duotone" />
						</div>
						<div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
							<div className="flex min-w-0 flex-wrap items-center gap-2">
								<p className="wrap-break-word text-pretty text-start font-medium text-foreground text-sm">
									{flag.name ?? flag.key}
								</p>
								<DependencyBadges
									dependencies={dependencies}
									dependents={dependents}
									flagMap={flagMap}
								/>
							</div>
							<FlagKey className="-ms-1.5 max-w-full" flag={flag} />
						</div>
					</div>
				</List.Cell>

				<List.Cell grow>
					{flag.description ? (
						<p className="wrap-break-word text-pretty text-muted-foreground text-xs">
							{flag.description}
						</p>
					) : null}
				</List.Cell>

				<List.Cell className="flex w-[100px] shrink-0 justify-center">
					<Badge className="font-normal" variant="secondary">
						{typeConfig.label}
					</Badge>
				</List.Cell>

				<List.Cell className="flex w-20 shrink-0 justify-center">
					{flag.type === "rollout" && rollout > 0 && (
						<RolloutProgress percentage={rollout} />
					)}
				</List.Cell>

				<List.Cell className="flex w-[100px] shrink-0 justify-center">
					{(ruleCount > 0 || variantCount > 0) && (
						<div className="flex flex-col gap-0.5 text-center text-muted-foreground text-xs">
							{ruleCount > 0 && (
								<span>
									{ruleCount} {ruleCount === 1 ? "rule" : "rules"}
								</span>
							)}
							{variantCount > 0 && (
								<FlagVariants variants={flag.variants ?? []} />
							)}
						</div>
					)}
				</List.Cell>

				<List.Cell className="flex w-[100px] shrink-0 justify-center">
					<GroupsDisplay groups={groups} />
				</List.Cell>

				<List.Cell
					className="flex w-[120px] shrink-0 justify-center"
					onClick={(e) => e.stopPropagation()}
					onKeyDown={(e) => e.stopPropagation()}
				>
					{flag.status === "archived" ? (
						<Badge className="gap-1" variant="amber">
							<ArchiveIcon className="size-3" weight="duotone" />
							Archived
						</Badge>
					) : (
						<StatusToggle flag={flag} />
					)}
				</List.Cell>

				<List.Cell action>
					<FlagActions flag={flag} onDelete={onDelete} onEdit={onEdit} />
				</List.Cell>
			</div>
		</List.Row>
	);
}

export function FlagsList({ flags, groups, onEdit, onDelete }: FlagsListProps) {
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
			{flags.map((flag) => (
				<FlagRow
					dependents={dependentsMap.get(flag.key) ?? []}
					flag={flag}
					flagMap={flagMap}
					groups={groups.get(flag.id) ?? []}
					key={flag.id}
					onDelete={onDelete}
					onEdit={onEdit}
				/>
			))}
		</List>
	);
}

export function FlagsListSkeleton() {
	return (
		<List className="rounded bg-card">
			{Array.from({ length: 5 }).map((_, i) => (
				<div
					className="flex min-h-15 items-center gap-4 border-border/80 border-b px-4 py-3 last:border-b-0"
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
