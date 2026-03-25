"use client";

import {
	FolderIcon,
	PencilIcon,
	PlusIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Flag } from "./types";

interface FolderManagementDialogProps {
	isOpen: boolean;
	onClose: () => void;
	flags: Flag[];
	onUpdateFlag: (flagId: string, updates: { folder?: string }) => Promise<void>;
}

export function FolderManagementDialog({
	isOpen,
	onClose,
	flags,
	onUpdateFlag,
}: FolderManagementDialogProps) {
	const [newFolderName, setNewFolderName] = useState("");
	const [editingFolder, setEditingFolder] = useState<string | null>(null);
	const [editFolderName, setEditFolderName] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [folderToDelete, setFolderToDelete] = useState<string | null>(null);

	// Get unique folders from flags
	const folders = Array.from(
		new Set(flags.map((flag) => flag.folder).filter(Boolean))
	).sort();

	const getFolderFlagCount = (folderPath: string) => {
		return flags.filter((flag) => flag.folder === folderPath).length;
	};

	const handleCreateFolder = async () => {
		if (!newFolderName.trim()) {
			toast.error("Folder name is required");
			return;
		}

		if (folders.includes(newFolderName.trim())) {
			toast.error("Folder already exists");
			return;
		}

		// Validate folder name
		const folderRegex = /^$|^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/;
		if (!folderRegex.test(newFolderName.trim())) {
			toast.error(
				"Folder path must be empty or valid segments separated by forward slashes (e.g., 'auth/login')"
			);
			return;
		}

		// Note: Folders are created implicitly when assigned to flags
		// This just validates the name - actual folder creation happens when a flag is assigned
		setNewFolderName("");
		toast.success(`Folder name "${newFolderName.trim()}" is valid and ready to use`);
	};

	const handleRenameFolder = async (oldPath: string, newPath: string) => {
		if (!newPath.trim()) {
			toast.error("Folder name is required");
			return;
		}

		if (oldPath === newPath.trim()) {
			setEditingFolder(null);
			return;
		}

		if (folders.includes(newPath.trim())) {
			toast.error("Folder already exists");
			return;
		}

		// Validate folder name
		const folderRegex = /^$|^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/;
		if (!folderRegex.test(newPath.trim())) {
			toast.error(
				"Folder path must be empty or valid segments separated by forward slashes (e.g., 'auth/login')"
			);
			return;
		}

		setIsLoading(true);
		try {
			// Update all flags in this folder AND subfolders
			const flagsToUpdate = flags.filter((flag) => 
				flag.folder === oldPath || flag.folder?.startsWith(oldPath + "/")
			);
			
			await Promise.all(
				flagsToUpdate.map((flag) => {
					// For exact match, use new path. For subfolders, replace the prefix
					const newFolderPath = flag.folder === oldPath 
						? newPath.trim()
						: flag.folder?.replace(oldPath + "/", newPath.trim() + "/");
					
					return onUpdateFlag(flag.id, { folder: newFolderPath });
				})
			);

			toast.success(`Folder renamed to "${newPath.trim()}" (${flagsToUpdate.length} flags updated)`);
			setEditingFolder(null);
		} catch (error) {
			console.error("Failed to rename folder:", error);
			toast.error("Failed to rename folder");
		} finally {
			setIsLoading(false);
		}
	};

	const handleDeleteFolder = async (folderPath: string) => {
		// Delete folder and all subfolders
		const flagsToUpdate = flags.filter((flag) => 
			flag.folder === folderPath || flag.folder?.startsWith(folderPath + "/")
		);
		
		if (flagsToUpdate.length === 0) {
			toast.success("Folder deleted");
			return;
		}

		setIsLoading(true);
		try {
			// Move all flags to root (no folder)
			await Promise.all(
				flagsToUpdate.map((flag) =>
					onUpdateFlag(flag.id, { folder: "" })
				)
			);

			toast.success(
				`Folder deleted. ${flagsToUpdate.length} flags moved to uncategorized`
			);
			setFolderToDelete(null);
		} catch (error) {
			console.error("Failed to delete folder:", error);
			toast.error("Failed to delete folder");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<>
			<Dialog open={isOpen} onOpenChange={onClose}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Manage Folders</DialogTitle>
						<DialogDescription>
							Create, rename, or delete folders to organize your feature flags.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4">
						{/* Create new folder */}
						<div className="space-y-2">
							<Label htmlFor="new-folder">Create New Folder</Label>
							<div className="flex gap-2">
								<Input
									id="new-folder"
									placeholder="e.g., auth/login or checkout"
									value={newFolderName}
									onChange={(e) => setNewFolderName(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											handleCreateFolder();
										}
									}}
								/>
								<Button
									onClick={handleCreateFolder}
									disabled={!newFolderName.trim() || isLoading}
									size="sm"
								>
									<PlusIcon size={16} />
								</Button>
							</div>
						</div>

						{/* Existing folders */}
						{folders.length > 0 && (
							<div className="space-y-2">
								<Label>Existing Folders</Label>
								<div className="space-y-1 max-h-60 overflow-y-auto">
									{folders.map((folder) => (
										<div
											key={folder}
											className="flex items-center gap-2 rounded border p-2"
										>
											<FolderIcon size={16} weight="duotone" />
											
											{editingFolder === folder ? (
												<Input
													value={editFolderName}
													onChange={(e) => setEditFolderName(e.target.value)}
													onKeyDown={(e) => {
														if (e.key === "Enter") {
															handleRenameFolder(folder, editFolderName);
														}
														if (e.key === "Escape") {
															setEditingFolder(null);
															setEditFolderName("");
														}
													}}
													onBlur={() => {
														if (!isLoading) {
															if (editFolderName !== folder) {
																handleRenameFolder(folder, editFolderName);
															} else {
																setEditingFolder(null);
															}
														}
													}}
													className="h-6 text-sm"
													autoFocus
												/>
											) : (
												<span className="flex-1 truncate text-sm">{folder}</span>
											)}
											
											<span className="text-muted-foreground text-xs">
												{getFolderFlagCount(folder)} flags
											</span>
											
											<div className="flex gap-1">
												<Button
													variant="ghost"
													size="sm"
													onClick={() => {
														setEditingFolder(folder);
														setEditFolderName(folder);
													}}
													disabled={isLoading}
													className="size-6 p-0"
													aria-label={`Rename folder ${folder}`}
												>
													<PencilIcon size={12} />
												</Button>
												<Button
													variant="ghost"
													size="sm"
													onClick={() => setFolderToDelete(folder)}
													disabled={isLoading}
													className="size-6 p-0 text-destructive hover:text-destructive"
													aria-label={`Delete folder ${folder}`}
												>
													<TrashIcon size={12} />
												</Button>
											</div>
										</div>
									))}
								</div>
							</div>
						)}

						{folders.length === 0 && (
							<div className="text-center py-8 text-muted-foreground text-sm">
								No folders created yet. Create your first folder above.
							</div>
						)}
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={onClose}>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<DeleteDialog
				isOpen={folderToDelete !== null}
				onClose={() => setFolderToDelete(null)}
				onConfirm={() => folderToDelete && handleDeleteFolder(folderToDelete)}
				isDeleting={isLoading}
				title="Delete Folder"
				itemName={folderToDelete || ""}
			/>
		</>
	);
}