"use client";

import {
	DotsThreeIcon,
	FolderIcon,
	FolderOpenIcon,
	FolderPlusIcon,
	FlagIcon,
	PencilSimpleIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
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
import type { Flag } from "./types";

export type FolderSelection = "all" | "uncategorized" | string;

interface FolderSidebarProps {
	flags: Flag[];
	websiteId: string;
	selectedFolder: FolderSelection;
	onSelectFolder: (folder: FolderSelection) => void;
}

function CreateFolderDialog({
	isOpen,
	onClose,
	existingFolders,
	onCreateAction,
}: {
	isOpen: boolean;
	onClose: () => void;
	existingFolders: string[];
	onCreateAction: (name: string) => void;
}) {
	const [name, setName] = useState("");
	const trimmed = name.trim();
	const isValid = trimmed.length > 0 && trimmed.length <= 100;
	const isDuplicate = existingFolders.includes(trimmed);

	const handleCreate = () => {
		if (!isValid || isDuplicate) return;
		onCreateAction(trimmed);
		setName("");
		onClose();
	};

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			setName("");
			onClose();
		}
	};

	return (
		<Dialog onOpenChange={handleOpenChange} open={isOpen}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Create Folder</DialogTitle>
				</DialogHeader>
				<div className="space-y-2 py-2">
					<Input
						autoFocus
						maxLength={100}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleCreate();
						}}
						placeholder="Folder name…"
						value={name}
					/>
					{isDuplicate && (
						<p className="text-destructive text-xs">
							A folder with this name already exists.
						</p>
					)}
				</div>
				<DialogFooter>
					<Button onClick={onClose} type="button" variant="ghost">
						Cancel
					</Button>
					<Button
						disabled={!isValid || isDuplicate}
						onClick={handleCreate}
						type="button"
					>
						Create
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function RenameFolderDialog({
	isOpen,
	onClose,
	currentName,
	existingFolders,
	flagsInFolder: flagsInFolderCount,
	onRenameAction,
	isRenaming,
}: {
	isOpen: boolean;
	onClose: () => void;
	currentName: string;
	existingFolders: string[];
	flagsInFolder: number;
	onRenameAction: (newName: string) => void;
	isRenaming: boolean;
}) {
	const [name, setName] = useState(currentName);
	const trimmed = name.trim();
	const isChanged = trimmed !== currentName;
	const isValid = trimmed.length > 0 && trimmed.length <= 100;
	const isDuplicate = isChanged && existingFolders.includes(trimmed);

	const handleRename = () => {
		if (!isChanged || !isValid || isDuplicate) return;
		onRenameAction(trimmed);
	};

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			setName(currentName);
			onClose();
		}
	};

	return (
		<Dialog onOpenChange={handleOpenChange} open={isOpen}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Rename Folder</DialogTitle>
				</DialogHeader>
				<div className="space-y-2 py-2">
					<Input
						autoFocus
						maxLength={100}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleRename();
						}}
						value={name}
					/>
					{isDuplicate && (
						<p className="text-destructive text-xs">
							A folder with this name already exists.
						</p>
					)}
					{flagsInFolderCount > 0 && (
						<p className="text-muted-foreground text-xs">
							This will update {flagsInFolderCount} flag
							{flagsInFolderCount !== 1 ? "s" : ""}.
						</p>
					)}
				</div>
				<DialogFooter>
					<Button onClick={onClose} type="button" variant="ghost">
						Cancel
					</Button>
					<Button
						disabled={!isChanged || !isValid || isDuplicate || isRenaming}
						onClick={handleRename}
						type="button"
					>
						{isRenaming ? "Renaming…" : "Rename"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

interface FolderRowProps {
	name: string;
	count: number;
	isSelected: boolean;
	existingFolders: string[];
	websiteId: string;
	flagsInFolder: Flag[];
	onSelect: () => void;
	onRenamedAction: (oldName: string, newName: string) => void;
	onDeletedAction: (name: string) => void;
}

function FolderRow({
	name,
	count,
	isSelected,
	existingFolders,
	websiteId,
	flagsInFolder,
	onSelect,
	onRenamedAction,
	onDeletedAction,
}: FolderRowProps) {
	const [showRename, setShowRename] = useState(false);
	const [showDelete, setShowDelete] = useState(false);
	const queryClient = useQueryClient();

	const updateMutation = useMutation({
		...orpc.flags.update.mutationOptions(),
	});

	const isRenaming = updateMutation.isPending;

	const handleRename = async (newName: string) => {
		const results = await Promise.allSettled(
			flagsInFolder.map((flag) =>
				updateMutation.mutateAsync({ id: flag.id, folder: newName })
			)
		);
		const failed = results.filter((r) => r.status === "rejected").length;
		const succeeded = results.length - failed;
		queryClient.invalidateQueries({
			queryKey: orpc.flags.list.key({ input: { websiteId } }),
		});
		if (failed === 0) {
			toast.success(`Folder renamed to "${newName}"`);
			onRenamedAction(name, newName);
			setShowRename(false);
		} else if (succeeded > 0) {
			toast.error(
				`Partially renamed: ${succeeded} flag(s) updated, ${failed} failed`
			);
			onRenamedAction(name, newName);
			setShowRename(false);
		} else {
			toast.error("Failed to rename folder");
		}
	};

	const handleDelete = async () => {
		const results = await Promise.allSettled(
			flagsInFolder.map((flag) =>
				updateMutation.mutateAsync({ id: flag.id, folder: null })
			)
		);
		const failed = results.filter((r) => r.status === "rejected").length;
		const succeeded = results.length - failed;
		queryClient.invalidateQueries({
			queryKey: orpc.flags.list.key({ input: { websiteId } }),
		});
		if (failed === 0) {
			toast.success(`Folder "${name}" deleted`);
			onDeletedAction(name);
			setShowDelete(false);
		} else if (succeeded > 0) {
			toast.error(
				`Partially deleted: ${succeeded} flag(s) removed from folder, ${failed} failed`
			);
			onDeletedAction(name);
			setShowDelete(false);
		} else {
			toast.error("Failed to delete folder");
		}
	};

	return (
		<>
			<div
				className={cn(
					"group flex items-center gap-2 rounded px-2 py-1.5 transition-colors",
					isSelected
						? "bg-accent text-accent-foreground"
						: "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
				)}
			>
				<button
					className="flex flex-1 items-center gap-2 text-left"
					onClick={onSelect}
					type="button"
				>
					{isSelected ? (
						<FolderOpenIcon className="size-4 shrink-0" weight="duotone" />
					) : (
						<FolderIcon className="size-4 shrink-0" weight="duotone" />
					)}
					<span className="flex-1 truncate text-sm">{name}</span>
					<span className="text-muted-foreground text-xs tabular-nums">
						{count}
					</span>
				</button>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							aria-label="Folder options"
							className="size-6 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
							size="icon"
							variant="ghost"
						>
							<DotsThreeIcon className="size-4" weight="bold" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-36">
						<DropdownMenuItem
							className="gap-2"
							onClick={() => setShowRename(true)}
						>
							<PencilSimpleIcon className="size-3.5" weight="duotone" />
							Rename
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="gap-2 text-destructive focus:text-destructive"
							onClick={() => setShowDelete(true)}
							variant="destructive"
						>
							<TrashIcon className="size-3.5" weight="duotone" />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<RenameFolderDialog
				currentName={name}
				existingFolders={existingFolders}
				flagsInFolder={count}
				isOpen={showRename}
				isRenaming={isRenaming}
				onClose={() => setShowRename(false)}
				onRenameAction={handleRename}
			/>

			<DeleteDialog
				description={
					count > 0
						? `This will move ${count} flag${count !== 1 ? "s" : ""} to Uncategorized.`
						: undefined
				}
				isDeleting={updateMutation.isPending}
				isOpen={showDelete}
				itemName={`"${name}" folder`}
				onClose={() => setShowDelete(false)}
				onConfirm={handleDelete}
				title="Delete Folder"
			/>
		</>
	);
}

export function FolderSidebar({
	flags,
	websiteId,
	selectedFolder,
	onSelectFolder,
}: FolderSidebarProps) {
	const [showCreate, setShowCreate] = useState(false);
	const [localFolders, setLocalFolders] = useState<string[]>([]);

	// Derive folders from flags
	const folderCounts = new Map<string, number>();
	for (const flag of flags) {
		if (flag.folder) {
			folderCounts.set(flag.folder, (folderCounts.get(flag.folder) ?? 0) + 1);
		}
	}

	// Merge local (newly created empty) folders with flag-derived folders
	const allFolderNames = Array.from(
		new Set([...Array.from(folderCounts.keys()), ...localFolders])
	).sort();

	const uncategorizedCount = flags.filter((f) => !f.folder).length;
	const allCount = flags.length;

	const handleCreate = (name: string) => {
		if (!folderCounts.has(name) && !localFolders.includes(name)) {
			setLocalFolders((prev) => [...prev, name]);
		}
		onSelectFolder(name);
	};

	const handleRenamed = (oldName: string, newName: string) => {
		setLocalFolders((prev) =>
			prev.map((n) => (n === oldName ? newName : n)).filter(Boolean)
		);
		if (selectedFolder === oldName) {
			onSelectFolder(newName);
		}
	};

	const handleDeleted = (name: string) => {
		setLocalFolders((prev) => prev.filter((n) => n !== name));
		if (selectedFolder === name) {
			onSelectFolder("all");
		}
	};

	return (
		<>
			<div className="flex h-full w-48 shrink-0 flex-col border-r bg-background lg:w-56">
				<div className="flex items-center justify-between px-3 py-2.5">
					<span className="font-medium text-foreground text-xs uppercase tracking-wider">
						Folders
					</span>
					<Button
						aria-label="Create folder"
						className="size-6"
						onClick={() => setShowCreate(true)}
						size="icon"
						variant="ghost"
					>
						<FolderPlusIcon className="size-4" weight="duotone" />
					</Button>
				</div>

				<div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
					{/* All Flags */}
					<button
						className={cn(
							"flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors",
							selectedFolder === "all"
								? "bg-accent text-accent-foreground font-medium"
								: "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
						)}
						onClick={() => onSelectFolder("all")}
						type="button"
					>
						<FlagIcon className="size-4 shrink-0" weight="duotone" />
						<span className="flex-1">All Flags</span>
						<span className="text-muted-foreground text-xs tabular-nums">
							{allCount}
						</span>
					</button>

					{/* Uncategorized */}
					{uncategorizedCount > 0 && (
						<button
							className={cn(
								"flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors",
								selectedFolder === "uncategorized"
									? "bg-accent text-accent-foreground font-medium"
									: "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
							)}
							onClick={() => onSelectFolder("uncategorized")}
							type="button"
						>
							<FolderIcon className="size-4 shrink-0 opacity-40" weight="duotone" />
							<span className="flex-1">Uncategorized</span>
							<span className="text-muted-foreground text-xs tabular-nums">
								{uncategorizedCount}
							</span>
						</button>
					)}

					{/* Named folders */}
					{allFolderNames.length > 0 && (
						<div className="my-1 h-px bg-border" />
					)}
					{allFolderNames.map((folder) => (
						<FolderRow
							count={folderCounts.get(folder) ?? 0}
							existingFolders={allFolderNames}
							flagsInFolder={flags.filter((f) => f.folder === folder)}
							isSelected={selectedFolder === folder}
							key={folder}
							name={folder}
							onDeletedAction={handleDeleted}
							onRenamedAction={handleRenamed}
							onSelect={() => onSelectFolder(folder)}
							websiteId={websiteId}
						/>
					))}

					{allFolderNames.length === 0 && uncategorizedCount === 0 && (
						<p className="px-2 py-4 text-center text-muted-foreground text-xs">
							No folders yet
						</p>
					)}
				</div>
			</div>

			<CreateFolderDialog
				existingFolders={allFolderNames}
				isOpen={showCreate}
				onClose={() => setShowCreate(false)}
				onCreateAction={handleCreate}
			/>
		</>
	);
}
