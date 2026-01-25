"use client";

import {
	CaretDownIcon,
	CaretRightIcon,
	DotsThreeIcon,
	FolderOpenIcon,
	FolderSimpleIcon,
	PencilSimpleIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { FlagRow } from "./flag-row";
import type { Flag, FolderItemProps, TargetGroup } from "./types";

export function FolderItem({
	folder,
	flags,
	groups,
	isExpanded,
	onToggle,
	onEdit,
	onDelete,
	onEditFlag,
	onDeleteFlag,
	onMoveFlag,
}: FolderItemProps) {
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

	const activeCount = flags.filter((f) => f.status === "active").length;
	const inactiveCount = flags.filter((f) => f.status === "inactive").length;

	return (
		<Collapsible open={isExpanded} onOpenChange={onToggle}>
			<div className="border-b">
				{/* Folder header */}
				<div className="flex items-center gap-3 bg-accent/30 px-4 py-2.5">
					<CollapsibleTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className="h-7 w-7 p-0 hover:bg-accent"
						>
							{isExpanded ? (
								<CaretDownIcon className="size-4" weight="bold" />
							) : (
								<CaretRightIcon className="size-4" weight="bold" />
							)}
						</Button>
					</CollapsibleTrigger>

					<div
						className="rounded p-1.5"
						style={{ backgroundColor: `${folder.color}20` }}
					>
						{isExpanded ? (
							<FolderOpenIcon
								className="size-4"
								weight="duotone"
								style={{ color: folder.color }}
							/>
						) : (
							<FolderSimpleIcon
								className="size-4"
								weight="duotone"
								style={{ color: folder.color }}
							/>
						)}
					</div>

					<CollapsibleTrigger asChild>
						<button
							type="button"
							className="flex flex-1 items-center gap-3 text-left"
						>
							<div className="flex flex-col">
								<span className="font-medium text-sm">{folder.name}</span>
								{folder.description && (
									<span className="text-muted-foreground text-xs line-clamp-1">
										{folder.description}
									</span>
								)}
							</div>
						</button>
					</CollapsibleTrigger>

					<div className="flex items-center gap-2">
						{flags.length > 0 && (
							<div className="flex items-center gap-1.5">
								<Badge variant="secondary" className="font-normal text-xs">
									{flags.length} {flags.length === 1 ? "flag" : "flags"}
								</Badge>
								{activeCount > 0 && (
									<Badge variant="default" className="font-normal text-xs">
										{activeCount} active
									</Badge>
								)}
								{inactiveCount > 0 && (
									<Badge variant="outline" className="font-normal text-xs">
										{inactiveCount} inactive
									</Badge>
								)}
							</div>
						)}

						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-8 opacity-50 hover:opacity-100"
								>
									<DotsThreeIcon className="size-5" weight="bold" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-44">
								<DropdownMenuItem
									className="gap-2"
									onClick={() => onEdit(folder)}
								>
									<PencilSimpleIcon className="size-4" weight="duotone" />
									Edit Folder
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									className="gap-2 text-destructive focus:text-destructive"
									onClick={() => onDelete(folder.id)}
									variant="destructive"
								>
									<TrashIcon
										className="size-4 fill-destructive"
										weight="duotone"
									/>
									Delete Folder
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>

				{/* Folder content */}
				<CollapsibleContent>
					<div className="border-l-2 ml-8" style={{ borderColor: folder.color }}>
						{flags.length === 0 ? (
							<div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
								No flags in this folder. Drag flags here or create new ones.
							</div>
						) : (
							<div className="w-full overflow-x-auto">
								{flags.map((flag) => (
									<FlagRow
										key={flag.id}
										flag={flag}
										groups={groups.get(flag.id) ?? []}
										dependents={dependentsMap.get(flag.key) ?? []}
										flagMap={flagMap}
										onEdit={onEditFlag}
										onDelete={onDeleteFlag}
										showFolderActions
										onMoveToFolder={onMoveFlag}
									/>
								))}
							</div>
						)}
					</div>
				</CollapsibleContent>
			</div>
		</Collapsible>
	);
}
