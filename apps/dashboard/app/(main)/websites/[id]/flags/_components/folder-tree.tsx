"use client";

import {
	CaretDownIcon,
	CaretRightIcon,
	DotsThreeIcon,
	FolderIcon,
	FolderOpenIcon,
	PencilIcon,
	PlusIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import type { FolderNode } from "./folder-utils";
import { generateUniqueFolderPath, getAllFolderPaths } from "./folder-utils";

interface FolderTreeProps {
	folders: FolderNode[];
	selectedFolder: string | null;
	onFolderSelect: (folderPath: string) => void;
	websiteId: string;
}

interface FolderItemProps {
	folder: FolderNode;
	selectedFolder: string | null;
	onFolderSelect: (folderPath: string) => void;
	onCreateFolder: (parentPath: string, name: string) => void;
	onRenameFolder: (oldPath: string, newName: string) => void;
	onDeleteFolder: (folderPath: string) => void;
	level: number;
	allPaths: string[];
}

function FolderItem({
	folder,
	selectedFolder,
	onFolderSelect,
	onCreateFolder,
	onRenameFolder,
	onDeleteFolder,
	level,
	allPaths,
}: FolderItemProps) {
	const [isExpanded, setIsExpanded] = useState(folder.isExpanded ?? true);
	const [isCreating, setIsCreating] = useState(false);
	const [isRenaming, setIsRenaming] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");
	const [renameValue, setRenameValue] = useState(folder.name);

	const hasChildren = folder.children.length > 0;
	const isSelected = selectedFolder === folder.path;

	const handleToggleExpanded = () => {
		if (hasChildren) {
			setIsExpanded(!isExpanded);
		}
	};

	const handleCreateFolder = () => {
		if (!newFolderName.trim()) return;

		const uniquePath = generateUniqueFolderPath(
			newFolderName.trim(),
			folder.path,
			allPaths
		);
		onCreateFolder(folder.path, uniquePath);
		setNewFolderName("");
		setIsCreating(false);
		setIsExpanded(true);
	};

	const handleRename = () => {
		if (!renameValue.trim() || renameValue.trim() === folder.name) {
			setIsRenaming(false);
			setRenameValue(folder.name);
			return;
		}

		onRenameFolder(folder.path, renameValue.trim());
		setIsRenaming(false);
	};

	const handleDelete = () => {
		if (folder.children.length > 0) {
			toast.error("Cannot delete folder with subfolders");
			return;
		}
		if (folder.flagCount > 0) {
			toast.error("Cannot delete folder that contains flags");
			return;
		}
		onDeleteFolder(folder.path);
	};

	return (
		<div>
			<div
				className={cn(
					"group flex items-center gap-1 rounded px-2 py-1.5 text-sm transition-colors hover:bg-accent/50",
					isSelected && "bg-accent text-accent-foreground",
					level > 0 && "ml-4"
				)}
			>
				{/* Expand/collapse button */}
				<button
					className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
					onClick={handleToggleExpanded}
					type="button"
				>
					{hasChildren ? (
						isExpanded ? (
							<CaretDownIcon size={12} weight="fill" />
						) : (
							<CaretRightIcon size={12} weight="fill" />
						)
					) : (
						<div className="size-3" />
					)}
				</button>

				{/* Folder icon */}
				<div className="flex size-5 items-center justify-center text-muted-foreground">
					{isExpanded && hasChildren ? (
						<FolderOpenIcon size={16} weight="duotone" />
					) : (
						<FolderIcon size={16} weight="duotone" />
					)}
				</div>

				{/* Folder name */}
				{isRenaming ? (
					<Input
						autoFocus
						className="h-6 text-xs"
						onBlur={handleRename}
						onChange={(e) => setRenameValue(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleRename();
							if (e.key === "Escape") {
								setIsRenaming(false);
								setRenameValue(folder.name);
							}
						}}
						value={renameValue}
					/>
				) : (
					<button
						className="flex-1 text-left transition-colors hover:text-foreground"
						onClick={() => onFolderSelect(folder.path)}
						type="button"
					>
						{folder.name}
					</button>
				)}

				{/* Flag count */}
				{folder.flagCount > 0 && (
					<span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
						{folder.flagCount}
					</span>
				)}

				{/* Actions menu - only show for non-root folders */}
				{folder.path !== "" && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								className="size-6 opacity-0 group-hover:opacity-100"
								size="sm"
								variant="ghost"
							>
								<DotsThreeIcon size={14} />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" side="right">
							<DropdownMenuItem onClick={() => setIsCreating(true)}>
								<PlusIcon size={14} />
								Create Subfolder
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setIsRenaming(true)}>
								<PencilIcon size={14} />
								Rename
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className="text-destructive focus:text-destructive"
								onClick={handleDelete}
							>
								<TrashIcon size={14} />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>

			{/* Create new folder input */}
			{isCreating && (
				<div className={cn("mt-1", level > 0 && "ml-4")}>
					<div className="flex items-center gap-1 px-2">
						<div className="size-5" />
						<FolderIcon size={16} className="text-muted-foreground" weight="duotone" />
						<Input
							autoFocus
							className="h-6 text-xs"
							onBlur={() => {
								if (!newFolderName.trim()) setIsCreating(false);
							}}
							onChange={(e) => setNewFolderName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleCreateFolder();
								if (e.key === "Escape") {
									setIsCreating(false);
									setNewFolderName("");
								}
							}}
							placeholder="Folder name"
							value={newFolderName}
						/>
					</div>
				</div>
			)}

			{/* Children */}
			<AnimatePresence>
				{isExpanded && hasChildren && (
					<motion.div
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						initial={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.15 }}
					>
						{folder.children.map((child) => (
							<FolderItem
								key={child.id}
								allPaths={allPaths}
								folder={child}
								level={level + 1}
								onCreateFolder={onCreateFolder}
								onDeleteFolder={onDeleteFolder}
								onFolderSelect={onFolderSelect}
								onRenameFolder={onRenameFolder}
								selectedFolder={selectedFolder}
							/>
						))}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

export function FolderTree({
	folders,
	selectedFolder,
	onFolderSelect,
	websiteId,
}: FolderTreeProps) {
	const queryClient = useQueryClient();
	const allPaths = getAllFolderPaths(folders);

	// Mock mutations for folder operations (these would be real API calls)
	const createFolderMutation = useMutation({
		mutationFn: async ({ parentPath, name }: { parentPath: string; name: string }) => {
			// This would be a real API call to create a folder
			// For now, we'll just show success
			await new Promise((resolve) => setTimeout(resolve, 100));
		},
		onSuccess: () => {
			toast.success("Folder created");
			queryClient.invalidateQueries({
				queryKey: orpc.flags.list.key({ input: { websiteId } }),
			});
		},
	});

	const renameFolderMutation = useMutation({
		mutationFn: async ({ oldPath, newName }: { oldPath: string; newName: string }) => {
			// This would be a real API call to rename a folder
			// For now, we'll just show success
			await new Promise((resolve) => setTimeout(resolve, 100));
		},
		onSuccess: () => {
			toast.success("Folder renamed");
			queryClient.invalidateQueries({
				queryKey: orpc.flags.list.key({ input: { websiteId } }),
			});
		},
	});

	const deleteFolderMutation = useMutation({
		mutationFn: async (folderPath: string) => {
			// This would be a real API call to delete a folder
			// For now, we'll just show success
			await new Promise((resolve) => setTimeout(resolve, 100));
		},
		onSuccess: () => {
			toast.success("Folder deleted");
			queryClient.invalidateQueries({
				queryKey: orpc.flags.list.key({ input: { websiteId } }),
			});
		},
	});

	const handleCreateFolder = (parentPath: string, folderPath: string) => {
		createFolderMutation.mutate({ parentPath, name: folderPath });
	};

	const handleRenameFolder = (oldPath: string, newName: string) => {
		renameFolderMutation.mutate({ oldPath, newName });
	};

	const handleDeleteFolder = (folderPath: string) => {
		deleteFolderMutation.mutate(folderPath);
	};

	return (
		<div className="space-y-1">
			{folders.map((folder) => (
				<FolderItem
					key={folder.id}
					allPaths={allPaths}
					folder={folder}
					level={0}
					onCreateFolder={handleCreateFolder}
					onDeleteFolder={handleDeleteFolder}
					onFolderSelect={onFolderSelect}
					onRenameFolder={handleRenameFolder}
					selectedFolder={selectedFolder}
				/>
			))}
		</div>
	);
}