"use client";

import {
	CaretDownIcon,
	FolderIcon,
	FolderOpenIcon,
	PencilIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface FolderSidebarProps {
	folders: { name: string; count: number }[];
	selectedFolder: string | null;
	onSelectFolder: (folder: string | null) => void;
	onRenameFolder?: (oldName: string, newName: string) => void;
	onDeleteFolder?: (folder: string) => void;
}

interface FolderTreeNode {
	name: string;
	fullPath: string;
	count: number;
	children: Map<string, FolderTreeNode>;
	isExpanded?: boolean;
}

function buildFolderTree(
	folders: { name: string; count: number }[]
): FolderTreeNode {
	const root: FolderTreeNode = {
		name: "",
		fullPath: "",
		count: 0,
		children: new Map(),
	};

	for (const folder of folders) {
		if (!folder.name) continue;

		const parts = folder.name.split("/").filter(Boolean);
		let current = root;

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			const fullPath = parts.slice(0, i + 1).join("/");

			if (!current.children.has(part)) {
				current.children.set(part, {
					name: part,
					fullPath,
					count: 0,
					children: new Map(),
					isExpanded: false,
				});
			}

			current = current.children.get(part)!;

			// Add count only to leaf nodes
			if (i === parts.length - 1) {
				current.count = folder.count;
			}
		}
	}

	return root;
}

function FolderTreeItem({
	node,
	level = 0,
	selectedFolder,
	onSelectFolder,
	onRenameFolder,
	onDeleteFolder,
}: {
	node: FolderTreeNode;
	level?: number;
	selectedFolder: string | null;
	onSelectFolder: (folder: string | null) => void;
	onRenameFolder?: (oldName: string, newName: string) => void;
	onDeleteFolder?: (folder: string) => void;
}) {
	const [isExpanded, setIsExpanded] = useState(true);
	const hasChildren = node.children.size > 0;
	const isSelected = selectedFolder === node.fullPath;

	return (
		<div>
			<div
				className={cn(
					"group flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors hover:bg-accent",
					isSelected && "bg-accent font-medium"
				)}
				style={{ paddingLeft: `${level * 12 + 8}px` }}
			>
				{hasChildren && (
					<button
						onClick={() => setIsExpanded(!isExpanded)}
						className="flex items-center justify-center transition-transform"
						type="button"
					>
						<CaretDownIcon
							className={cn(
								"size-3 text-muted-foreground transition-transform",
								!isExpanded && "-rotate-90"
							)}
							weight="fill"
						/>
					</button>
				)}

				<button
					onClick={() => onSelectFolder(node.fullPath)}
					className="flex flex-1 items-center gap-2 overflow-hidden"
					type="button"
				>
					{isExpanded || !hasChildren ? (
						<FolderOpenIcon className="size-4 shrink-0" weight="duotone" />
					) : (
						<FolderIcon className="size-4 shrink-0" weight="duotone" />
					)}
					<span className="truncate">{node.name}</span>
					{node.count > 0 && (
						<span className="shrink-0 text-muted-foreground text-xs">
							{node.count}
						</span>
					)}
				</button>

				{(onRenameFolder || onDeleteFolder) && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="size-6 p-0 opacity-0 group-hover:opacity-100"
							>
								<span className="sr-only">Folder actions</span>
								<CaretDownIcon className="size-3" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							{onRenameFolder && (
								<DropdownMenuItem
									onClick={() => {
										const newName = prompt(
											"Enter new folder name:",
											node.fullPath
										);
										if (newName && newName !== node.fullPath) {
											onRenameFolder(node.fullPath, newName);
										}
									}}
								>
									<PencilIcon className="mr-2 size-4" />
									Rename
								</DropdownMenuItem>
							)}
							{onDeleteFolder && (
								<DropdownMenuItem
									onClick={() => {
										if (
											confirm(
												`Delete folder "${node.fullPath}"? Flags will be moved to root.`
											)
										) {
											onDeleteFolder(node.fullPath);
										}
									}}
									className="text-destructive"
								>
									<TrashIcon className="mr-2 size-4" />
									Delete
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>

			{isExpanded &&
				hasChildren &&
				Array.from(node.children.values()).map((child) => (
					<FolderTreeItem
						key={child.fullPath}
						node={child}
						level={level + 1}
						selectedFolder={selectedFolder}
						onSelectFolder={onSelectFolder}
						onRenameFolder={onRenameFolder}
						onDeleteFolder={onDeleteFolder}
					/>
				))}
		</div>
	);
}

export function FolderSidebar({
	folders,
	selectedFolder,
	onSelectFolder,
	onRenameFolder,
	onDeleteFolder,
}: FolderSidebarProps) {
	const rootCount = folders.find((f) => !f.name)?.count || 0;
	const tree = buildFolderTree(folders.filter((f) => f.name));

	return (
		<div className="flex h-full flex-col border-border border-r bg-background">
			<div className="border-border border-b p-4">
				<h3 className="font-semibold text-sm">Folders</h3>
			</div>
			<div className="flex-1 overflow-y-auto p-2">
				<div
					className={cn(
						"flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors hover:bg-accent",
						selectedFolder === null && "bg-accent font-medium"
					)}
				>
					<button
						onClick={() => onSelectFolder(null)}
						className="flex flex-1 items-center gap-2"
						type="button"
					>
						<FolderIcon className="size-4" weight="duotone" />
						<span>All Flags</span>
						{rootCount > 0 && (
							<span className="text-muted-foreground text-xs">{rootCount}</span>
						)}
					</button>
				</div>

				{Array.from(tree.children.values()).map((child) => (
					<FolderTreeItem
						key={child.fullPath}
						node={child}
						selectedFolder={selectedFolder}
						onSelectFolder={onSelectFolder}
						onRenameFolder={onRenameFolder}
						onDeleteFolder={onDeleteFolder}
					/>
				))}
			</div>
		</div>
	);
}
