"use client";

import { FlagIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { FlagRow } from "./flag-row";
import { FolderItem } from "./folder-item";
import type { Flag, FlagFolder, OrganizedFlagsListProps, TargetGroup } from "./types";

export function OrganizedFlagsList({
	folders,
	flags,
	groups,
	onEditFolder,
	onDeleteFolder,
	onEditFlag,
	onDeleteFlag,
	onMoveFlag,
}: OrganizedFlagsListProps) {
	const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
		// Start with all folders expanded
		return new Set(folders.map((f) => f.id));
	});
	const [unorganizedExpanded, setUnorganizedExpanded] = useState(true);

	// Extend Flag type to include folderId
	type FlagWithFolder = Flag & { folderId?: string | null };

	// Group flags by folder
	const { folderFlags, unorganizedFlags } = useMemo(() => {
		const folderMap = new Map<string, Flag[]>();
		const unorganized: Flag[] = [];

		for (const flag of flags) {
			const folderId = (flag as FlagWithFolder).folderId;
			if (folderId) {
				const existing = folderMap.get(folderId) || [];
				existing.push(flag);
				folderMap.set(folderId, existing);
			} else {
				unorganized.push(flag);
			}
		}

		return { folderFlags: folderMap, unorganizedFlags: unorganized };
	}, [flags]);

	const toggleFolder = (folderId: string) => {
		setExpandedFolders((prev) => {
			const next = new Set(prev);
			if (next.has(folderId)) {
				next.delete(folderId);
			} else {
				next.add(folderId);
			}
			return next;
		});
	};

	// Build flag map and dependents map for all flags
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

	const activeUnorganizedCount = unorganizedFlags.filter(
		(f) => f.status === "active"
	).length;
	const inactiveUnorganizedCount = unorganizedFlags.filter(
		(f) => f.status === "inactive"
	).length;

	return (
		<div className="w-full">
			{/* Folders */}
			{folders.map((folder) => (
				<FolderItem
					key={folder.id}
					folder={folder}
					flags={folderFlags.get(folder.id) ?? []}
					groups={groups}
					isExpanded={expandedFolders.has(folder.id)}
					onToggle={() => toggleFolder(folder.id)}
					onEdit={onEditFolder}
					onDelete={onDeleteFolder}
					onEditFlag={onEditFlag}
					onDeleteFlag={onDeleteFlag}
					onMoveFlag={onMoveFlag}
				/>
			))}

			{/* Unorganized flags section */}
			{unorganizedFlags.length > 0 && (
				<Collapsible open={unorganizedExpanded} onOpenChange={setUnorganizedExpanded}>
					<div className="border-b">
						<div className="flex items-center gap-3 bg-muted/50 px-4 py-2.5">
							<CollapsibleTrigger asChild>
								<Button
									variant="ghost"
									size="sm"
									className="h-7 w-7 p-0 hover:bg-accent"
								>
									{unorganizedExpanded ? (
										<CaretDownIcon className="size-4" weight="bold" />
									) : (
										<CaretRightIcon className="size-4" weight="bold" />
									)}
								</Button>
							</CollapsibleTrigger>

							<div className="rounded bg-muted p-1.5">
								<FlagIcon
									className="size-4 text-muted-foreground"
									weight="duotone"
								/>
							</div>

							<CollapsibleTrigger asChild>
								<button
									type="button"
									className="flex flex-1 items-center gap-3 text-left"
								>
									<span className="font-medium text-muted-foreground text-sm">
										Unorganized Flags
									</span>
								</button>
							</CollapsibleTrigger>

							<div className="flex items-center gap-1.5">
								<Badge variant="secondary" className="font-normal text-xs">
									{unorganizedFlags.length}{" "}
									{unorganizedFlags.length === 1 ? "flag" : "flags"}
								</Badge>
								{activeUnorganizedCount > 0 && (
									<Badge variant="default" className="font-normal text-xs">
										{activeUnorganizedCount} active
									</Badge>
								)}
								{inactiveUnorganizedCount > 0 && (
									<Badge variant="outline" className="font-normal text-xs">
										{inactiveUnorganizedCount} inactive
									</Badge>
								)}
							</div>
						</div>

						<CollapsibleContent>
							<div className="w-full overflow-x-auto">
								{unorganizedFlags.map((flag) => (
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
						</CollapsibleContent>
					</div>
				</Collapsible>
			)}

			{/* Empty state when no folders and no flags */}
			{folders.length === 0 && unorganizedFlags.length === 0 && (
				<div className="flex items-center justify-center py-16 text-muted-foreground">
					No feature flags yet
				</div>
			)}
		</div>
	);
}
