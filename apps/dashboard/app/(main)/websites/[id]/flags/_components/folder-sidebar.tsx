"use client";

import { FoldersIcon, PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FolderTree } from "./folder-tree";
import type { FolderNode } from "./folder-utils";
import { generateUniqueFolderPath, getAllFolderPaths } from "./folder-utils";

interface FolderSidebarProps {
	folders: FolderNode[];
	selectedFolder: string | null;
	onFolderSelect: (folderPath: string) => void;
	websiteId: string;
	className?: string;
}

export function FolderSidebar({
	folders,
	selectedFolder,
	onFolderSelect,
	websiteId,
	className,
}: FolderSidebarProps) {
	const [isCreatingRootFolder, setIsCreatingRootFolder] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");

	const allPaths = getAllFolderPaths(folders);
	const totalFlags = folders.reduce((sum, folder) => sum + folder.flagCount, 0);

	const handleCreateRootFolder = () => {
		if (!newFolderName.trim()) return;

		const uniquePath = generateUniqueFolderPath(
			newFolderName.trim(),
			"",
			allPaths
		);

		// TODO: This would trigger a real API call to create the folder
		console.log("Creating root folder:", uniquePath);

		setNewFolderName("");
		setIsCreatingRootFolder(false);
	};

	return (
		<div className={cn("flex flex-col border-r bg-muted/20", className)}>
			{/* Header */}
			<div className="border-b p-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<FoldersIcon size={18} weight="duotone" />
						<h3 className="font-medium text-sm">Folders</h3>
						<span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
							{totalFlags}
						</span>
					</div>
					<Button
						onClick={() => setIsCreatingRootFolder(true)}
						size="sm"
						variant="ghost"
					>
						<PlusIcon size={14} />
					</Button>
				</div>
			</div>

			{/* Create root folder input */}
			{isCreatingRootFolder && (
				<div className="border-b p-4">
					<div className="flex items-center gap-2">
						<FoldersIcon size={16} className="text-muted-foreground" weight="duotone" />
						<Input
							autoFocus
							className="h-8 text-sm"
							onBlur={() => {
								if (!newFolderName.trim()) setIsCreatingRootFolder(false);
							}}
							onChange={(e) => setNewFolderName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleCreateRootFolder();
								if (e.key === "Escape") {
									setIsCreatingRootFolder(false);
									setNewFolderName("");
								}
							}}
							placeholder="Folder name"
							value={newFolderName}
						/>
					</div>
				</div>
			)}

			{/* Folder Tree */}
			<div className="flex-1 overflow-y-auto p-4">
				<FolderTree
					folders={folders}
					onFolderSelect={onFolderSelect}
					selectedFolder={selectedFolder}
					websiteId={websiteId}
				/>
			</div>
		</div>
	);
}