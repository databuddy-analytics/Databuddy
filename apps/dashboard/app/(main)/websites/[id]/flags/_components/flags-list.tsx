"use client";

import {
	ArchiveIcon,
	CaretRightIcon,
	DotsThreeIcon,
	FlagIcon,
	FlaskIcon,
	FolderIcon,
	FolderOpenIcon,
	GaugeIcon,
	LinkIcon,
	PencilSimpleIcon,
	ShareNetworkIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useAtom } from "jotai";
import { useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { collapsedFoldersAtom } from "@/stores/jotai/flagsAtoms";
import { FlagKey } from "./flag-key";
import { FlagVariants } from "./flag-variants";
import { RolloutProgress } from "./rollout-progress";
import type { Flag, TargetGroup } from "./types";

interface FlagsListProps {
	flags: Flag[];
	groups: Map<string, TargetGroup[]>;
	onEdit: (flag: Flag) => void;
	onDelete: (flagId: string) => void;
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
		<button
			className={cn(
				"group flex h-15 min-w-full cursor-pointer items-center gap-4 border-b px-4 text-left transition-colors hover:bg-accent/50",
				{ "opacity-50": flag.status === "archived" }
			)}
			onClick={() => onEdit(flag)}
			type="button"
		>
			{/* Flag name & key */}
			<div
				className="flex min-w-[280px] shrink-0 items-center gap-3"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
				role="presentation"
			>
				<div
					className={cn("shrink-0 rounded bg-accent p-1.5", typeConfig.color)}
				>
					<TypeIconComponent className="size-4" weight="duotone" />
				</div>
				<div className="flex flex-col items-start gap-0.5">
					<div className="flex items-center gap-2">
						<p className="truncate font-medium text-foreground text-sm">
							{flag.name ?? flag.key}
						</p>
						<DependencyBadges
							dependencies={dependencies}
							dependents={dependents}
							flagMap={flagMap}
						/>
					</div>
					<FlagKey className="-ms-1.5" flag={flag} />
				</div>
			</div>

			{/* Description */}
			<div className="min-w-[300px] flex-1">
				{flag.description && (
					<p className="line-clamp-2 text-muted-foreground text-xs">
						{flag.description}
					</p>
				)}
			</div>

			{/* Type */}
			<div className="w-[100px] shrink-0">
				<Badge className="font-normal" variant="secondary">
					{typeConfig.label}
				</Badge>
			</div>

			{/* Rollout */}
			<div className="w-20 shrink-0 text-center">
				{flag.type === "rollout" && rollout > 0 && (
					<RolloutProgress percentage={rollout} />
				)}
			</div>

			{/* Rules & Variants */}
			<div className="w-[100px] shrink-0">
				{(ruleCount > 0 || variantCount > 0) && (
					<div className="flex flex-col gap-0.5 text-muted-foreground text-xs">
						{ruleCount > 0 && (
							<span>
								{ruleCount} {ruleCount !== 1 ? "rules" : "rule"}
							</span>
						)}
						{variantCount > 0 && (
							<FlagVariants variants={flag.variants ?? []} />
						)}
					</div>
				)}
			</div>

			{/* Groups */}
			<div className="w-[100px] shrink-0">
				<GroupsDisplay groups={groups} />
			</div>

			{/* Status */}
			<div
				className="w-[120px] shrink-0"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
				role="presentation"
			>
				{flag.status === "archived" ? (
					<Badge className="gap-1" variant="amber">
						<ArchiveIcon className="size-3" weight="duotone" />
						Archived
					</Badge>
				) : (
					<StatusToggle flag={flag} />
				)}
			</div>

			{/* Actions */}
			<div
				className="w-[60px] shrink-0"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
				role="presentation"
			>
				<FlagActions flag={flag} onDelete={onDelete} onEdit={onEdit} />
			</div>
		</button>
	);
}

interface FolderGroup {
	folder: string;
	flags: Flag[];
}

function FolderSection({
	folder,
	flags,
	groups,
	flagMap,
	dependentsMap,
	onEdit,
	onDelete,
}: {
	folder: string;
	flags: Flag[];
	groups: Map<string, TargetGroup[]>;
	flagMap: Map<string, Flag>;
	dependentsMap: Map<string, Flag[]>;
	onEdit: (flag: Flag) => void;
	onDelete: (flagId: string) => void;
}) {
	const [collapsedFolders, setCollapsedFolders] = useAtom(collapsedFoldersAtom);
	const listKey = `list:${folder}`;
	const isCollapsed = collapsedFolders.has(listKey);

	const handleToggle = useCallback(() => {
		setCollapsedFolders((prev: Set<string>) => {
			const next = new Set(prev);
			if (next.has(listKey)) {
				next.delete(listKey);
			} else {
				next.add(listKey);
			}
			return next;
		});
	}, [listKey, setCollapsedFolders]);

	const displayName = folder || "Uncategorized";

	return (
		<div>
			<button
				className="flex w-full cursor-pointer items-center gap-2 border-b bg-accent/30 px-4 py-2 text-left transition-colors hover:bg-accent/50"
				onClick={handleToggle}
				type="button"
			>
				<CaretRightIcon
					className={cn(
						"size-3.5 text-muted-foreground transition-transform duration-150",
						!isCollapsed && "rotate-90"
					)}
					weight="fill"
				/>
				{folder ? (
					isCollapsed ? (
						<FolderIcon
							className="size-4 text-muted-foreground"
							weight="duotone"
						/>
					) : (
						<FolderOpenIcon
							className="size-4 text-muted-foreground"
							weight="duotone"
						/>
					)
				) : (
					<FlagIcon className="size-4 text-muted-foreground" weight="duotone" />
				)}
				<span className="font-medium text-foreground text-sm">
					{displayName}
				</span>
				<Badge className="ml-1 font-normal" variant="secondary">
					{flags.length}
				</Badge>
			</button>

			<AnimatePresence initial={false}>
				{!isCollapsed && (
					<motion.div
						animate={{ height: "auto", opacity: 1 }}
						className="overflow-hidden"
						exit={{ height: 0, opacity: 0 }}
						initial={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.15, ease: "easeOut" }}
					>
						{flags.length === 0 ? (
							<div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
								No flags in this folder
							</div>
						) : (
							flags.map((flag) => (
								<FlagRow
									dependents={dependentsMap.get(flag.key) ?? []}
									flag={flag}
									flagMap={flagMap}
									groups={groups.get(flag.id) ?? []}
									key={flag.id}
									onDelete={onDelete}
									onEdit={onEdit}
								/>
							))
						)}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
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

	const hasFolders = useMemo(
		() => flags.some((f) => f.folder?.trim()),
		[flags]
	);

	const folderGroups = useMemo<FolderGroup[]>(() => {
		if (!hasFolders) {
			return [];
		}

		const groupMap = new Map<string, Flag[]>();

		for (const flag of flags) {
			const folder = flag.folder?.trim() || "";
			const existing = groupMap.get(folder) || [];
			existing.push(flag);
			groupMap.set(folder, existing);
		}

		const sorted: FolderGroup[] = [];
		const folders = [...groupMap.keys()].sort((a, b) => {
			if (a === "") {
				return 1;
			}
			if (b === "") {
				return -1;
			}
			return a.localeCompare(b);
		});

		for (const folder of folders) {
			sorted.push({ folder, flags: groupMap.get(folder) ?? [] });
		}

		return sorted;
	}, [flags, hasFolders]);

	if (hasFolders) {
		return (
			<div className="w-full overflow-x-auto">
				{folderGroups.map((group) => (
					<FolderSection
						dependentsMap={dependentsMap}
						flagMap={flagMap}
						flags={group.flags}
						folder={group.folder}
						groups={groups}
						key={group.folder}
						onDelete={onDelete}
						onEdit={onEdit}
					/>
				))}
			</div>
		);
	}

	return (
		<div className="w-full overflow-x-auto">
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
		</div>
	);
}

export function FlagsListSkeleton() {
	return (
		<div className="w-full overflow-x-auto">
			{Array.from({ length: 5 }).map((_, i) => (
				<div
					className="flex h-15 items-center gap-4 border-b px-4"
					key={`skeleton-${i + 1}`}
				>
					<div className="flex min-w-[280px] shrink-0 items-center gap-3">
						<Skeleton className="size-7 rounded" />
						<Skeleton className="h-4 w-28" />
						<Skeleton className="h-5 w-20" />
					</div>
					<div className="min-w-[300px] flex-1">
						<Skeleton className="h-3 w-48" />
					</div>
					<div className="w-[100px] shrink-0">
						<Skeleton className="h-5 w-16" />
					</div>
					<div className="w-[100px] shrink-0">
						<Skeleton className="h-9 w-9 rounded-full" />
					</div>
					<div className="w-[100px] shrink-0">
						<Skeleton className="h-3 w-12" />
					</div>
					<div className="w-[100px] shrink-0">
						<Skeleton className="h-4 w-12" />
					</div>
					<div className="w-[120px] shrink-0">
						<Skeleton className="h-5 w-14" />
					</div>
					<div className="w-[60px] shrink-0">
						<Skeleton className="size-8 rounded" />
					</div>
				</div>
			))}
		</div>
	);
}
