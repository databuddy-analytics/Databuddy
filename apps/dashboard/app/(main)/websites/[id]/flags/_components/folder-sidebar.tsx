"use client";

import {
	CaretRightIcon,
	FlagIcon,
	FolderIcon,
	FolderOpenIcon,
	FolderPlusIcon,
	PencilSimpleIcon,
	TrashIcon,
} from "@phosphor-icons/react";

const FOLDER_NAME_REGEX = /^[a-zA-Z0-9_\-/ ]*$/;

import { AnimatePresence, motion } from "framer-motion";
import { useAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
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
import { cn } from "@/lib/utils";
import {
	collapsedFoldersAtom,
	selectedFolderAtom,
} from "@/stores/jotai/flagsAtoms";
import type { Flag } from "./types";

interface FolderNode {
	name: string;
	path: string;
	flagCount: number;
	children: FolderNode[];
}

function buildFolderTree(flags: Flag[]): FolderNode[] {
	const folderMap = new Map<string, number>();

	for (const flag of flags) {
		const folder = flag.folder?.trim();
		if (folder) {
			folderMap.set(folder, (folderMap.get(folder) ?? 0) + 1);
		}
	}

	const roots: FolderNode[] = [];
	const nodeMap = new Map<string, FolderNode>();

	const sortedPaths = [...folderMap.keys()].sort();

	for (const path of sortedPaths) {
		const parts = path.split("/");
		let currentPath = "";

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			currentPath = currentPath ? `${currentPath}/${part}` : part;

			if (!nodeMap.has(currentPath)) {
				const node: FolderNode = {
					name: part,
					path: currentPath,
					flagCount: folderMap.get(currentPath) ?? 0,
					children: [],
				};
				nodeMap.set(currentPath, node);

				if (i === 0) {
					roots.push(node);
				} else {
					const parentPath = parts.slice(0, i).join("/");
					const parent = nodeMap.get(parentPath);
					if (parent) {
						parent.children.push(node);
					}
				}
			}
		}
	}

	return roots;
}

function FolderTreeItem({
	node,
	depth,
	selectedFolder,
	onSelectFolder,
	collapsedFolders,
	onToggleCollapse,
	onRenameFolder,
	onDeleteFolder,
}: {
	node: FolderNode;
	depth: number;
	selectedFolder: string | null;
	onSelectFolder: (folder: string | null) => void;
	collapsedFolders: Set<string>;
	onToggleCollapse: (folder: string) => void;
	onRenameFolder: (oldPath: string) => void;
	onDeleteFolder: (path: string) => void;
}) {
	const isSelected = selectedFolder === node.path;
	const isCollapsed = collapsedFolders.has(node.path);
	const hasChildren = node.children.length > 0;

	return (
		<div>
			<DropdownMenu>
				<div
					className={cn(
						"group flex cursor-pointer items-center gap-1.5 rounded px-2 py-1.5 text-sm transition-colors",
						isSelected
							? "bg-primary/10 text-primary"
							: "text-foreground hover:bg-accent/50"
					)}
					style={{ paddingLeft: `${depth * 16 + 8}px` }}
				>
					{hasChildren ? (
						<button
							className="shrink-0 rounded p-0.5 hover:bg-accent"
							onClick={(e) => {
								e.stopPropagation();
								onToggleCollapse(node.path);
							}}
							type="button"
						>
							<CaretRightIcon
								className={cn(
									"size-3 text-muted-foreground transition-transform duration-150",
									!isCollapsed && "rotate-90"
								)}
								weight="fill"
							/>
						</button>
					) : (
						<span className="w-4" />
					)}

					<button
						className="flex flex-1 items-center gap-2 truncate"
						onClick={() => onSelectFolder(isSelected ? null : node.path)}
						type="button"
					>
						{isCollapsed ? (
							<FolderIcon
								className={cn(
									"size-4 shrink-0",
									isSelected ? "text-primary" : "text-muted-foreground"
								)}
								weight="duotone"
							/>
						) : (
							<FolderOpenIcon
								className={cn(
									"size-4 shrink-0",
									isSelected ? "text-primary" : "text-muted-foreground"
								)}
								weight="duotone"
							/>
						)}
						<span className="truncate">{node.name}</span>
						<span className="ml-auto font-mono text-muted-foreground text-xs tabular-nums">
							{node.flagCount}
						</span>
					</button>

					<DropdownMenuTrigger asChild>
						<button
							className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
							onClick={(e) => e.stopPropagation()}
							type="button"
						>
							<PencilSimpleIcon
								className="size-3 text-muted-foreground"
								weight="duotone"
							/>
						</button>
					</DropdownMenuTrigger>
				</div>

				<DropdownMenuContent align="start" className="w-40">
					<DropdownMenuItem
						className="gap-2"
						onClick={() => onRenameFolder(node.path)}
					>
						<PencilSimpleIcon className="size-4" weight="duotone" />
						Rename
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className="gap-2 text-destructive focus:text-destructive"
						onClick={() => onDeleteFolder(node.path)}
						variant="destructive"
					>
						<TrashIcon className="size-4 fill-destructive" weight="duotone" />
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<AnimatePresence initial={false}>
				{!isCollapsed && hasChildren && (
					<motion.div
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						initial={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.15, ease: "easeInOut" }}
					>
						{node.children.map((child) => (
							<FolderTreeItem
								collapsedFolders={collapsedFolders}
								depth={depth + 1}
								key={child.path}
								node={child}
								onDeleteFolder={onDeleteFolder}
								onRenameFolder={onRenameFolder}
								onSelectFolder={onSelectFolder}
								onToggleCollapse={onToggleCollapse}
								selectedFolder={selectedFolder}
							/>
						))}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

interface FolderSidebarProps {
	flags: Flag[];
	onMoveFlagsToRoot: (folderPath: string) => void;
	onRenameFolderFlags: (oldPath: string, newPath: string) => void;
}

export function FolderSidebar({
	flags,
	onMoveFlagsToRoot,
	onRenameFolderFlags,
}: FolderSidebarProps) {
	const [selectedFolder, setSelectedFolder] = useAtom(selectedFolderAtom);
	const [collapsedFolders, setCollapsedFolders] = useAtom(collapsedFoldersAtom);
	const [isCreating, setIsCreating] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");
	const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
	const [renameValue, setRenameValue] = useState("");

	const folderTree = useMemo(() => buildFolderTree(flags), [flags]);

	const uncategorizedCount = useMemo(
		() => flags.filter((f) => !f.folder?.trim()).length,
		[flags]
	);

	const handleToggleCollapse = useCallback(
		(folder: string) => {
			setCollapsedFolders((prev: Set<string>) => {
				const next = new Set(prev);
				if (next.has(folder)) {
					next.delete(folder);
				} else {
					next.add(folder);
				}
				return next;
			});
		},
		[setCollapsedFolders]
	);

	const handleCreateFolder = useCallback(() => {
		const trimmed = newFolderName.trim();
		if (!trimmed) {
			toast.error("Folder name cannot be empty");
			return;
		}
		if (!FOLDER_NAME_REGEX.test(trimmed)) {
			toast.error(
				"Folder name can only contain letters, numbers, underscores, hyphens, spaces, and slashes"
			);
			return;
		}
		setIsCreating(false);
		setNewFolderName("");
		setSelectedFolder(trimmed);
		toast.success(`Folder "${trimmed}" ready — assign flags to it`);
	}, [newFolderName, setSelectedFolder]);

	const handleRenameFolder = useCallback((oldPath: string) => {
		setRenamingFolder(oldPath);
		setRenameValue(oldPath);
	}, []);

	const handleConfirmRename = useCallback(() => {
		if (!renamingFolder) {
			return;
		}
		const trimmed = renameValue.trim();
		if (!trimmed) {
			toast.error("Folder name cannot be empty");
			return;
		}
		if (!FOLDER_NAME_REGEX.test(trimmed)) {
			toast.error("Invalid folder name");
			return;
		}
		if (trimmed !== renamingFolder) {
			onRenameFolderFlags(renamingFolder, trimmed);
		}
		setRenamingFolder(null);
		setRenameValue("");
	}, [renamingFolder, renameValue, onRenameFolderFlags]);

	const handleDeleteFolder = useCallback(
		(path: string) => {
			onMoveFlagsToRoot(path);
			if (selectedFolder === path) {
				setSelectedFolder(null);
			}
			toast.success(`Folder "${path}" deleted — flags moved to root`);
		},
		[onMoveFlagsToRoot, selectedFolder, setSelectedFolder]
	);

	return (
		<div className="flex w-56 shrink-0 flex-col border-r">
			<div className="flex items-center justify-between border-b px-3 py-2">
				<span className="font-medium text-foreground text-xs">Folders</span>
				<Button
					className="size-6"
					onClick={() => setIsCreating(true)}
					size="icon"
					variant="ghost"
				>
					<FolderPlusIcon className="size-3.5" weight="duotone" />
				</Button>
			</div>

			<div className="flex-1 overflow-y-auto py-1">
				{/* All Flags */}
				<button
					className={cn(
						"flex w-full cursor-pointer items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors",
						selectedFolder === null
							? "bg-primary/10 text-primary"
							: "text-foreground hover:bg-accent/50"
					)}
					onClick={() => setSelectedFolder(null)}
					type="button"
				>
					<FlagIcon className="size-4 shrink-0" weight="duotone" />
					<span>All Flags</span>
					<span className="ml-auto font-mono text-muted-foreground text-xs tabular-nums">
						{flags.length}
					</span>
				</button>

				{/* Uncategorized */}
				{uncategorizedCount > 0 && uncategorizedCount !== flags.length && (
					<button
						className={cn(
							"flex w-full cursor-pointer items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors",
							selectedFolder === ""
								? "bg-primary/10 text-primary"
								: "text-muted-foreground hover:bg-accent/50"
						)}
						onClick={() => setSelectedFolder(selectedFolder === "" ? null : "")}
						type="button"
					>
						<FlagIcon className="size-4 shrink-0" weight="duotone" />
						<span>Uncategorized</span>
						<span className="ml-auto font-mono text-muted-foreground text-xs tabular-nums">
							{uncategorizedCount}
						</span>
					</button>
				)}

				{/* Folder Tree */}
				{folderTree.map((node) => (
					<FolderTreeItem
						collapsedFolders={collapsedFolders}
						depth={0}
						key={node.path}
						node={node}
						onDeleteFolder={handleDeleteFolder}
						onRenameFolder={handleRenameFolder}
						onSelectFolder={setSelectedFolder}
						onToggleCollapse={handleToggleCollapse}
						selectedFolder={selectedFolder}
					/>
				))}

				{/* Create folder input */}
				<AnimatePresence>
					{isCreating && (
						<motion.div
							animate={{ height: "auto", opacity: 1 }}
							className="overflow-hidden px-2 pt-1"
							exit={{ height: 0, opacity: 0 }}
							initial={{ height: 0, opacity: 0 }}
							transition={{ duration: 0.15 }}
						>
							<div className="flex items-center gap-1">
								<FolderPlusIcon
									className="size-4 shrink-0 text-muted-foreground"
									weight="duotone"
								/>
								<Input
									autoFocus
									className="h-7 text-sm"
									onBlur={() => {
										if (!newFolderName.trim()) {
											setIsCreating(false);
										}
									}}
									onChange={(e) => setNewFolderName(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											handleCreateFolder();
										}
										if (e.key === "Escape") {
											setIsCreating(false);
											setNewFolderName("");
										}
									}}
									placeholder="Folder name…"
									value={newFolderName}
								/>
							</div>
						</motion.div>
					)}
				</AnimatePresence>

				{/* Rename folder input */}
				<AnimatePresence>
					{renamingFolder && (
						<motion.div
							animate={{ opacity: 1 }}
							className="border-t px-2 pt-2"
							exit={{ opacity: 0 }}
							initial={{ opacity: 0 }}
							transition={{ duration: 0.15 }}
						>
							<p className="mb-1 text-muted-foreground text-xs">
								Rename folder
							</p>
							<div className="flex items-center gap-1">
								<Input
									autoFocus
									className="h-7 text-sm"
									onChange={(e) => setRenameValue(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											handleConfirmRename();
										}
										if (e.key === "Escape") {
											setRenamingFolder(null);
											setRenameValue("");
										}
									}}
									value={renameValue}
								/>
								<Button
									className="h-7"
									onClick={handleConfirmRename}
									size="sm"
									variant="ghost"
								>
									Save
								</Button>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}
