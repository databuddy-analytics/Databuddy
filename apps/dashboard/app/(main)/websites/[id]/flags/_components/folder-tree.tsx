"use client";

import {
	CaretRightIcon,
	CheckIcon,
	FlagIcon,
	FolderIcon,
	FolderOpenIcon,
	FolderPlusIcon,
	ListIcon,
	PencilSimpleIcon,
	TrashIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Flag } from "./types";

export interface FolderTreeProps {
	flags: Flag[];
	selectedFolder: string | null; // null = all, "" = uncategorized, "path" = specific
	onSelectFolderAction: (folder: string | null) => void;
	onRenameFolderAction: (oldPath: string, newPath: string) => void;
	onDeleteFolderAction: (folderPath: string) => void;
}

interface TreeNode {
	name: string;
	path: string;
	children: Map<string, TreeNode>;
}

function buildTree(uniqueFolderPaths: string[]): Map<string, TreeNode> {
	const root = new Map<string, TreeNode>();

	for (const folder of uniqueFolderPaths) {
		const parts = folder.split("/").filter(Boolean);
		let current = root;
		let pathSoFar = "";

		for (const part of parts) {
			pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
			if (!current.has(part)) {
				current.set(part, {
					name: part,
					path: pathSoFar,
					children: new Map(),
				});
			}
			const node = current.get(part);
			if (node) {
				current = node.children;
			}
		}
	}

	return root;
}

function countFlagsInFolder(flags: Flag[], folderPath: string): number {
	return flags.filter((f) => {
		if (!f.folder) return false;
		return f.folder === folderPath || f.folder.startsWith(`${folderPath}/`);
	}).length;
}

function FolderNode({
	node,
	flags,
	selectedFolder,
	depth,
	onSelectFolderAction,
	onRenameFolderAction,
	onDeleteFolderAction,
	expandedPaths,
	onToggleExpand,
}: {
	node: TreeNode;
	flags: Flag[];
	selectedFolder: string | null;
	depth: number;
	onSelectFolderAction: (folder: string | null) => void;
	onRenameFolderAction: (oldPath: string, newPath: string) => void;
	onDeleteFolderAction: (folderPath: string) => void;
	expandedPaths: Set<string>;
	onToggleExpand: (path: string) => void;
}) {
	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(node.name);
	const [confirmDelete, setConfirmDelete] = useState(false);

	const isExpanded = expandedPaths.has(node.path);
	const isSelected = selectedFolder === node.path;
	const hasChildren = node.children.size > 0;
	const flagCount = countFlagsInFolder(flags, node.path);

	const handleRenameSubmit = () => {
		const trimmed = renameValue.trim();
		if (!trimmed || trimmed === node.name) {
			setIsRenaming(false);
			setRenameValue(node.name);
			return;
		}
		const parentPath = node.path.includes("/")
			? node.path.substring(0, node.path.lastIndexOf("/"))
			: "";
		const newPath = parentPath ? `${parentPath}/${trimmed}` : trimmed;
		onRenameFolderAction(node.path, newPath);
		setIsRenaming(false);
	};

	const handleDeleteConfirm = () => {
		onDeleteFolderAction(node.path);
		setConfirmDelete(false);
	};

	if (isRenaming) {
		return (
			<div
				className="flex items-center gap-1 py-0.5"
				style={{ paddingLeft: `${depth * 12 + 8}px` }}
			>
				<Input
					autoFocus
					className="h-6 flex-1 text-xs"
					onBlur={handleRenameSubmit}
					onChange={(e) => setRenameValue(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") handleRenameSubmit();
						if (e.key === "Escape") {
							setIsRenaming(false);
							setRenameValue(node.name);
						}
					}}
					value={renameValue}
				/>
				<button
					className="text-green-500 hover:text-green-400"
					onClick={handleRenameSubmit}
					type="button"
				>
					<CheckIcon className="size-3.5" weight="bold" />
				</button>
				<button
					className="text-muted-foreground hover:text-foreground"
					onClick={() => {
						setIsRenaming(false);
						setRenameValue(node.name);
					}}
					type="button"
				>
					<XIcon className="size-3.5" weight="bold" />
				</button>
			</div>
		);
	}

	return (
		<div>
			<div
				className={cn(
					"group flex items-center gap-1 rounded py-1 pr-1 text-sm transition-colors",
					isSelected
						? "bg-primary/10 text-primary"
						: "text-muted-foreground hover:bg-accent hover:text-foreground"
				)}
				style={{ paddingLeft: `${depth * 12 + 4}px` }}
			>
				{/* Expand toggle */}
				<button
					className={cn(
						"flex size-4 shrink-0 items-center justify-center",
						!hasChildren && "invisible"
					)}
					onClick={(e) => {
						e.stopPropagation();
						onToggleExpand(node.path);
					}}
					type="button"
				>
					<CaretRightIcon
						className={cn(
							"size-3 transition-transform duration-150",
							isExpanded && "rotate-90"
						)}
						weight="bold"
					/>
				</button>

				{/* Folder icon + name */}
				<button
					className="flex flex-1 items-center gap-1.5 text-left"
					onDoubleClick={() => {
						setRenameValue(node.name);
						setIsRenaming(true);
					}}
					onClick={() => onSelectFolderAction(node.path)}
					type="button"
				>
					{isExpanded || isSelected ? (
						<FolderOpenIcon className="size-3.5 shrink-0" weight="duotone" />
					) : (
						<FolderIcon className="size-3.5 shrink-0" weight="duotone" />
					)}
					<span className="truncate text-xs font-medium">{node.name}</span>
				</button>

				{/* Flag count */}
				{flagCount > 0 && (
					<span className="text-[10px] text-muted-foreground tabular-nums">
						{flagCount}
					</span>
				)}

				{/* Actions */}
				<div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
					<button
						className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
						onClick={(e) => {
							e.stopPropagation();
							setRenameValue(node.name);
							setIsRenaming(true);
						}}
						title="Rename folder (or double-click)"
						type="button"
					>
						<PencilSimpleIcon className="size-3" weight="duotone" />
					</button>
					{confirmDelete ? (
						<div className="flex items-center gap-0.5">
							<button
								className="flex size-5 items-center justify-center rounded text-destructive hover:bg-destructive/10"
								onClick={(e) => {
									e.stopPropagation();
									handleDeleteConfirm();
								}}
								title="Confirm delete"
								type="button"
							>
								<CheckIcon className="size-3" weight="bold" />
							</button>
							<button
								className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent"
								onClick={(e) => {
									e.stopPropagation();
									setConfirmDelete(false);
								}}
								title="Cancel"
								type="button"
							>
								<XIcon className="size-3" weight="bold" />
							</button>
						</div>
					) : (
						<button
							className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
							onClick={(e) => {
								e.stopPropagation();
								setConfirmDelete(true);
							}}
							title="Delete folder (moves flags to Uncategorized)"
							type="button"
						>
							<TrashIcon className="size-3" weight="duotone" />
						</button>
					)}
				</div>
			</div>

			{/* Children */}
			{isExpanded && hasChildren && (
				<div>
					{Array.from(node.children.values()).map((child) => (
						<FolderNode
							depth={depth + 1}
							expandedPaths={expandedPaths}
							flags={flags}
							key={child.path}
							node={child}
							onDeleteFolderAction={onDeleteFolderAction}
							onRenameFolderAction={onRenameFolderAction}
							onSelectFolderAction={onSelectFolderAction}
							onToggleExpand={onToggleExpand}
							selectedFolder={selectedFolder}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function FolderTreeContent({
	flags,
	selectedFolder,
	onSelectFolderAction,
	onRenameFolderAction,
	onDeleteFolderAction,
}: FolderTreeProps) {
	const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
	const [isCreating, setIsCreating] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");

	const { folderTree, uncategorizedCount, totalCount } = useMemo(() => {
		const uniqueFolders = new Set<string>();
		let uncategorized = 0;

		for (const flag of flags) {
			if (flag.folder) {
				const parts = flag.folder.split("/").filter(Boolean);
				for (let i = 1; i <= parts.length; i++) {
					uniqueFolders.add(parts.slice(0, i).join("/"));
				}
			} else {
				uncategorized++;
			}
		}

		return {
			folderTree: buildTree(Array.from(uniqueFolders)),
			uncategorizedCount: uncategorized,
			totalCount: flags.length,
		};
	}, [flags]);

	const toggleExpand = (path: string) => {
		setExpandedPaths((prev) => {
			const next = new Set(prev);
			if (next.has(path)) {
				next.delete(path);
			} else {
				next.add(path);
			}
			return next;
		});
	};

	const handleCreateFolder = () => {
		const trimmed = newFolderName.trim();
		if (!trimmed) {
			setIsCreating(false);
			setNewFolderName("");
			return;
		}
		// Select the new folder; flags can be assigned to it via edit
		onSelectFolderAction(trimmed);
		setIsCreating(false);
		setNewFolderName("");
		toast.success(`Folder "${trimmed}" ready. Edit flags to move them here.`);
	};

	return (
		<div className="flex flex-col gap-0.5 p-2">
			{/* All Flags */}
			<button
				className={cn(
					"flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium transition-colors",
					selectedFolder === null
						? "bg-primary/10 text-primary"
						: "text-muted-foreground hover:bg-accent hover:text-foreground"
				)}
				onClick={() => onSelectFolderAction(null)}
				type="button"
			>
				<FlagIcon className="size-3.5 shrink-0" weight="duotone" />
				<span className="flex-1">All Flags</span>
				<span className="tabular-nums text-[10px] text-muted-foreground">
					{totalCount}
				</span>
			</button>

			{/* Uncategorized */}
			<button
				className={cn(
					"flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium transition-colors",
					selectedFolder === ""
						? "bg-primary/10 text-primary"
						: "text-muted-foreground hover:bg-accent hover:text-foreground"
				)}
				onClick={() => onSelectFolderAction("")}
				type="button"
			>
				<FolderIcon className="size-3.5 shrink-0 opacity-40" weight="duotone" />
				<span className="flex-1">Uncategorized</span>
				{uncategorizedCount > 0 && (
					<span className="tabular-nums text-[10px] text-muted-foreground">
						{uncategorizedCount}
					</span>
				)}
			</button>

			{/* Folder tree */}
			{folderTree.size > 0 && (
				<>
					<div className="my-1 h-px bg-border" />
					{Array.from(folderTree.values()).map((node) => (
						<FolderNode
							depth={0}
							expandedPaths={expandedPaths}
							flags={flags}
							key={node.path}
							node={node}
							onDeleteFolderAction={onDeleteFolderAction}
							onRenameFolderAction={onRenameFolderAction}
							onSelectFolderAction={onSelectFolderAction}
							onToggleExpand={toggleExpand}
							selectedFolder={selectedFolder}
						/>
					))}
				</>
			)}

			{/* Divider + create */}
			<div className="mt-1 border-t pt-1">
				{isCreating ? (
					<div className="flex items-center gap-1">
						<Input
							autoFocus
							className="h-6 flex-1 text-xs"
							onBlur={handleCreateFolder}
							onChange={(e) => setNewFolderName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleCreateFolder();
								if (e.key === "Escape") {
									setIsCreating(false);
									setNewFolderName("");
								}
							}}
							placeholder="folder-name or a/b"
							value={newFolderName}
						/>
						<button
							className="text-green-500 hover:text-green-400"
							onClick={handleCreateFolder}
							type="button"
						>
							<CheckIcon className="size-3.5" weight="bold" />
						</button>
						<button
							className="text-muted-foreground hover:text-foreground"
							onClick={() => {
								setIsCreating(false);
								setNewFolderName("");
							}}
							type="button"
						>
							<XIcon className="size-3.5" weight="bold" />
						</button>
					</div>
				) : (
					<button
						className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						onClick={() => setIsCreating(true)}
						type="button"
					>
						<FolderPlusIcon className="size-3.5" weight="duotone" />
						New Folder
					</button>
				)}
			</div>
		</div>
	);
}

export function FolderTree({
	flags,
	selectedFolder,
	onSelectFolderAction,
	onRenameFolderAction,
	onDeleteFolderAction,
}: FolderTreeProps) {
	const [isMobileOpen, setIsMobileOpen] = useState(false);

	const selectedLabel = useMemo(() => {
		if (selectedFolder === null) return "All Flags";
		if (selectedFolder === "") return "Uncategorized";
		return selectedFolder;
	}, [selectedFolder]);

	const treeContent = (
		<FolderTreeContent
			flags={flags}
			onDeleteFolderAction={onDeleteFolderAction}
			onRenameFolderAction={onRenameFolderAction}
			onSelectFolderAction={onSelectFolderAction}
			selectedFolder={selectedFolder}
		/>
	);

	return (
		<>
			{/* Mobile toggle bar */}
			<div className="flex items-center gap-2 border-b px-4 py-2 lg:hidden">
				<button
					className={cn(
						"flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
						isMobileOpen
							? "bg-primary/10 text-primary"
							: "text-muted-foreground hover:bg-accent hover:text-foreground"
					)}
					onClick={() => setIsMobileOpen((prev) => !prev)}
					type="button"
				>
					<ListIcon className="size-3.5" weight="duotone" />
					<span>{selectedLabel}</span>
				</button>
			</div>

			{/* Mobile dropdown */}
			{isMobileOpen && (
				<div className="border-b bg-background lg:hidden">{treeContent}</div>
			)}

			{/* Desktop sidebar */}
			<div className="hidden w-[250px] shrink-0 border-r lg:flex lg:flex-col">
				<div className="border-b px-3 py-2.5">
					<span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
						Folders
					</span>
				</div>
				<div className="flex-1 overflow-y-auto">{treeContent}</div>
			</div>
		</>
	);
}
