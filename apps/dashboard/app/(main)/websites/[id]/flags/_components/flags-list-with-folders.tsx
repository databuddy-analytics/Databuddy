"use client";

import {
	CaretDownIcon,
	CaretRightIcon,
	FolderIcon,
	FolderOpenIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FlagsList } from "./flags-list";
import type { Flag, TargetGroup } from "./types";

interface FolderGroup {
	path: string;
	name: string;
	flags: Flag[];
	isExpanded: boolean;
}

interface FlagsListWithFoldersProps {
	flags: Flag[];
	groups: Map<string, TargetGroup[]>;
	onEdit: (flag: Flag) => void;
	onDelete: (flagId: string) => void;
	selectedFolder?: string;
}

export function FlagsListWithFolders({
	flags,
	groups,
	onEdit,
	onDelete,
	selectedFolder,
}: FlagsListWithFoldersProps) {
	const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
		new Set([""])
	);

	// Group flags by folder
	const folderGroups = useMemo(() => {
		const folderMap = new Map<string, Flag[]>();

		// Group flags by their folder path
		for (const flag of flags) {
			const folderPath = flag.folder || "";
			if (!folderMap.has(folderPath)) {
				folderMap.set(folderPath, []);
			}
			folderMap.get(folderPath)!.push(flag);
		}

		// Convert to array and sort
		const groups: FolderGroup[] = Array.from(folderMap.entries())
			.map(([path, flags]) => ({
				path,
				name: path === "" ? "Uncategorized" : path.split("/").pop() || path,
				flags: flags.sort((a, b) => a.name?.localeCompare(b.name || "") || 0),
				isExpanded: expandedFolders.has(path),
			}))
			.sort((a, b) => {
				// Root folder first, then alphabetical
				if (a.path === "") return -1;
				if (b.path === "") return 1;
				return a.path.localeCompare(b.path);
			});

		return groups;
	}, [flags, expandedFolders]);

	// Filter by selected folder if provided
	const filteredGroups = useMemo(() => {
		if (selectedFolder === undefined || selectedFolder === "ALL") {
			return folderGroups;
		}
		if (selectedFolder === "") {
			return folderGroups.filter((group) => group.path === "");
		}
		// Show selected folder AND all subfolders
		return folderGroups.filter((group) => 
			group.path === selectedFolder || 
			group.path.startsWith(selectedFolder + "/")
		);
	}, [folderGroups, selectedFolder]);

	const toggleFolder = (folderPath: string) => {
		const newExpanded = new Set(expandedFolders);
		if (newExpanded.has(folderPath)) {
			newExpanded.delete(folderPath);
		} else {
			newExpanded.add(folderPath);
		}
		setExpandedFolders(newExpanded);
	};

	const expandAll = () => {
		setExpandedFolders(new Set(folderGroups.map((g) => g.path)));
	};

	const collapseAll = () => {
		setExpandedFolders(new Set([""])); // Keep root expanded
	};

	if (filteredGroups.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-center">
				<FolderIcon size={48} weight="duotone" className="text-muted-foreground" />
				<h3 className="mt-4 font-medium text-foreground">No flags found</h3>
				<p className="text-muted-foreground text-sm">
					{selectedFolder
						? `No flags in "${selectedFolder}" folder`
						: "Create your first feature flag to get started"}
				</p>
			</div>
		);
	}

	// If showing all folders, show expand/collapse controls
	const showControls = selectedFolder === "ALL" && folderGroups.length > 1;

	return (
		<div className="space-y-2">
			{showControls && (
				<div className="flex items-center justify-between px-4 py-2">
					<span className="text-muted-foreground text-sm">
						{folderGroups.length} folders, {flags.length} flags
					</span>
					<div className="flex gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={expandAll}
							className="h-7 text-xs"
						>
							Expand All
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={collapseAll}
							className="h-7 text-xs"
						>
							Collapse All
						</Button>
					</div>
				</div>
			)}

			{filteredGroups.map((folderGroup) => (
				<div key={folderGroup.path} className="border rounded">
					{/* Folder Header */}
					<div className="border-b bg-muted/30">
						<Button
							variant="ghost"
							onClick={() => toggleFolder(folderGroup.path)}
							className="w-full justify-start gap-3 rounded-none px-4 py-3 h-auto"
						>
							{folderGroup.isExpanded ? (
								<CaretDownIcon size={16} />
							) : (
								<CaretRightIcon size={16} />
							)}
							
							{folderGroup.isExpanded ? (
								<FolderOpenIcon size={20} weight="duotone" />
							) : (
								<FolderIcon size={20} weight="duotone" />
							)}
							
							<div className="flex flex-1 items-center justify-between">
								<span className="font-medium text-sm">
									{folderGroup.name}
								</span>
								<span className="text-muted-foreground text-xs">
									{folderGroup.flags.length} flags
								</span>
							</div>
						</Button>
					</div>

					{/* Folder Content */}
					<AnimatePresence initial={false}>
						{folderGroup.isExpanded && (
							<motion.div
								initial={{ opacity: 0, scaleY: 0 }}
								animate={{ opacity: 1, scaleY: 1 }}
								exit={{ opacity: 0, scaleY: 0 }}
								transition={{ duration: 0.2, ease: "easeInOut" }}
								className="overflow-hidden origin-top"
							>
								{folderGroup.flags.length > 0 ? (
									<FlagsList
										flags={folderGroup.flags}
										groups={groups}
										onEdit={onEdit}
										onDelete={onDelete}
									/>
								) : (
									<div className="flex flex-col items-center justify-center py-8 text-center">
										<FolderIcon
											size={32}
											weight="duotone"
											className="text-muted-foreground"
										/>
										<p className="mt-2 text-muted-foreground text-sm">
											No flags in this folder
										</p>
									</div>
								)}
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			))}
		</div>
	);
}