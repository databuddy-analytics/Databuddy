"use client";

import { FolderIcon, FolderOpenIcon, PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FolderSidebarProps {
	folders: string[];
	selectedFolder: string | null;
	onSelectFolder: (folder: string | null) => void;
	onCreateFolder: () => void;
	flagCounts: Record<string, number>;
}

export function FolderSidebar({
	folders,
	selectedFolder,
	onSelectFolder,
	onCreateFolder,
	flagCounts,
}: FolderSidebarProps) {
	const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
		new Set(folders)
	);

	const toggleFolder = (folder: string) => {
		const newExpanded = new Set(expandedFolders);
		if (newExpanded.has(folder)) {
			newExpanded.delete(folder);
		} else {
			newExpanded.add(folder);
		}
		setExpandedFolders(newExpanded);
	};

	const uncategorizedCount = flagCounts[""] || 0;

	return (
		<div className="flex h-full w-64 flex-col border-r bg-background">
			<div className="flex items-center justify-between border-b p-4">
				<h3 className="font-semibold text-sm">Folders</h3>
				<Button
					onClick={onCreateFolder}
					size="sm"
					variant="ghost"
					className="size-8 p-0"
				>
					<PlusIcon className="size-4" />
				</Button>
			</div>

			<div className="flex-1 overflow-y-auto p-2">
				<button
					onClick={() => onSelectFolder(null)}
					className={cn(
						"flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
						selectedFolder === null && "bg-accent"
					)}
					type="button"
				>
					<FolderIcon className="size-4" weight="duotone" />
					<span className="flex-1">All Flags</span>
					<span className="text-muted-foreground text-xs">
						{Object.values(flagCounts).reduce((a, b) => a + b, 0)}
					</span>
				</button>

				{uncategorizedCount > 0 && (
					<button
						onClick={() => onSelectFolder("")}
						className={cn(
							"flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
							selectedFolder === "" && "bg-accent"
						)}
						type="button"
					>
						<FolderOpenIcon className="size-4" weight="duotone" />
						<span className="flex-1">Uncategorized</span>
						<span className="text-muted-foreground text-xs">
							{uncategorizedCount}
						</span>
					</button>
				)}

				{folders.map((folder) => {
					const isExpanded = expandedFolders.has(folder);
					const count = flagCounts[folder] || 0;

					return (
						<button
							key={folder}
							onClick={() => {
								toggleFolder(folder);
								onSelectFolder(folder);
							}}
							className={cn(
								"flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
								selectedFolder === folder && "bg-accent"
							)}
							type="button"
						>
							{isExpanded ? (
								<FolderOpenIcon className="size-4" weight="duotone" />
							) : (
								<FolderIcon className="size-4" weight="duotone" />
							)}
							<span className="flex-1 truncate">{folder}</span>
							<span className="text-muted-foreground text-xs">{count}</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}
