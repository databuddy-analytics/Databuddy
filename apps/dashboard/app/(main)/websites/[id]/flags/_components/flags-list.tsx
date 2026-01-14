"use client";

import {
	ArchiveIcon,
	CaretDownIcon,
	DotsThreeIcon,
	FlagIcon,
	FlaskIcon,
	FolderIcon,
	GaugeIcon,
	LinkIcon,
	PencilSimpleIcon,
	ShareNetworkIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

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

import { FlagKey } from "./flag-key";
import { FlagVariants } from "./flag-variants";
import { RolloutProgress } from "./rollout-progress";
import type { Flag, TargetGroup } from "./types";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface FlagsListProps {
	groupedFlags: Record<string, Flag[]>;
	groups: Map<string, TargetGroup[]>;
	onEdit: (flag: Flag) => void;
	onDelete: (flagId: string) => void;
}

/* -------------------------------------------------------------------------- */
/* Config                                                                     */
/* -------------------------------------------------------------------------- */

const TYPE_CONFIG = {
	boolean: { icon: FlagIcon, label: "Boolean", color: "text-blue-500" },
	rollout: { icon: GaugeIcon, label: "Rollout", color: "text-violet-500" },
	multivariant: {
		icon: FlaskIcon,
		label: "Multivariant",
		color: "text-pink-500",
	},
} as const;

/* -------------------------------------------------------------------------- */
/* Small Components                                                           */
/* -------------------------------------------------------------------------- */

function GroupsDisplay({ groups }: { groups: TargetGroup[] }) {
	if (groups.length === 0) return null;

	return (
		<div className="flex items-center gap-1.5">
			<div className="flex -space-x-1">
				{groups.slice(0, 3).map((group) => (
					<Tooltip key={group.id}>
						<TooltipTrigger asChild>
							<span
								className="size-4 rounded border border-background"
								style={{ backgroundColor: group.color }}
							/>
						</TooltipTrigger>
						<TooltipContent>{group.name}</TooltipContent>
					</Tooltip>
				))}
			</div>
			{groups.length > 3 && (
				<span className="text-xs text-muted-foreground">
					+{groups.length - 3}
				</span>
			)}
		</div>
	);
}

function StatusToggle({ flag }: { flag: Flag }) {
	const queryClient = useQueryClient();
	const isActive = flag.status === "active";

	const mutation = useMutation({
		...orpc.flags.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.flags.list.key({
					input: { websiteId: flag.websiteId ?? "" },
				}),
			});
		},
	});

	return (
		<div className="flex items-center gap-2">
			<Switch
				checked={isActive}
				disabled={mutation.isPending || flag.status === "archived"}
				onCheckedChange={(checked) =>
					mutation.mutate({
						id: flag.id,
						status: checked ? "active" : "inactive",
					})
				}
			/>
			<span className="text-xs">
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
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button size="icon" variant="ghost">
					<DotsThreeIcon className="size-5" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={() => onEdit(flag)}>
					<PencilSimpleIcon className="size-4 mr-2" />
					Edit
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					variant="destructive"
					onClick={() => onDelete(flag.id)}
				>
					<TrashIcon className="size-4 mr-2" />
					Delete
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/* -------------------------------------------------------------------------- */
/* Flag Row                                                                   */
/* -------------------------------------------------------------------------- */

function FlagRow({
	flag,
	groups,
	onEdit,
	onDelete,
}: {
	flag: Flag;
	groups: TargetGroup[];
	onEdit: (flag: Flag) => void;
	onDelete: (flagId: string) => void;
}) {
	const typeConfig =
		TYPE_CONFIG[flag.type as keyof typeof TYPE_CONFIG];

	const Icon = typeConfig.icon;

	return (
		<button
			type="button"
			onClick={() => onEdit(flag)}
			className="flex min-w-full items-center gap-4 border-b px-4 py-3 hover:bg-accent/50"
		>
			{/* Name */}
			<div className="flex min-w-[280px] items-center gap-3">
				<div className={cn("rounded p-1.5", typeConfig.color)}>
					<Icon className="size-4" />
				</div>
				<div className="flex flex-col">
					<span className="text-sm font-medium">
						{flag.name ?? flag.key}
					</span>
					<FlagKey flag={flag} />
				</div>
			</div>

			{/* Description */}
			<div className="flex-1 min-w-[300px] text-xs text-muted-foreground">
				{flag.description}
			</div>

			{/* Type */}
			<div className="w-[100px]">
				<Badge variant="secondary">{typeConfig.label}</Badge>
			</div>

			{/* Rollout */}
			<div className="w-20">
				{flag.type === "rollout" && (
					<RolloutProgress percentage={flag.rolloutPercentage ?? 0} />
				)}
			</div>

			{/* Groups */}
			<div className="w-[100px]">
				<GroupsDisplay groups={groups} />
			</div>

			{/* Status */}
			<div className="w-[120px]" onClick={(e) => e.stopPropagation()}>
				<StatusToggle flag={flag} />
			</div>

			{/* Actions */}
			<div className="w-[60px]" onClick={(e) => e.stopPropagation()}>
				<FlagActions flag={flag} onEdit={onEdit} onDelete={onDelete} />
			</div>
		</button>
	);
}

/* -------------------------------------------------------------------------- */
/* Flags List                                                                 */
/* -------------------------------------------------------------------------- */

export function FlagsList({
	groupedFlags,
	groups,
	onEdit,
	onDelete,
}: FlagsListProps) {
	const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

	return (
		<div className="w-full overflow-x-auto">
			{Object.entries(groupedFlags).map(([folder, flags]) => {
				const isCollapsed = collapsed[folder];

				return (
					<div key={folder}>
						<button
							type="button"
							onClick={() =>
								setCollapsed((p) => ({ ...p, [folder]: !p[folder] }))
							}
							className="flex w-full items-center gap-2 bg-accent/30 px-4 py-2"
						>
							<CaretDownIcon
								className={cn("size-3", isCollapsed && "-rotate-90")}
							/>
							<FolderIcon className="size-4" />
							<span className="text-xs font-semibold">{folder}</span>
							<Badge className="ml-auto">{flags.length}</Badge>
						</button>

						{!isCollapsed &&
							flags.map((flag) => (
								<FlagRow
									key={flag.id}
									flag={flag}
									groups={groups.get(flag.id) ?? []}
									onEdit={onEdit}
									onDelete={onDelete}
								/>
							))}
					</div>
				);
			})}
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/* Skeleton                                                                   */
/* -------------------------------------------------------------------------- */

export function FlagsListSkeleton() {
	return (
		<div className="space-y-2">
			{Array.from({ length: 5 }).map((_, i) => (
				<Skeleton key={i} className="h-12 w-full" />
			))}
		</div>
	);
}
