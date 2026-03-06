"use client";

import {
	FolderIcon,
	FolderOpenIcon,
	FlagIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Flag } from "./types";

interface FolderSidebarProps {
	flags: Flag[];
	selectedFolder: string | null;
	onSelectFolder: (folder: string | null) => void;
}

interface FolderNode {
	name: string;
	path: string;
	count: number;
	children: Map<string, FolderNode>;
}

function buildFolderTree(flags: Flag[]): FolderNode {
	const root: FolderNode = {
		name: "",
		path: "",
		count: 0,
		children: new Map(),
	};

	for (const flag of flags) {
		const folder = flag.folder;
		if (!folder) {
			continue;
		}

		const parts = folder.split("/");
		let current = root;

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			const path = parts.slice(0, i + 1).join("/");

			if (!current.children.has(part)) {
				current.children.set(part, {
					name: part,
					path,
					count: 0,
					children: new Map(),
				});
			}

			current = current.children.get(part)!;
		}

		current.count++;
	}

	return root;
}

function FolderTreeItem({
	node,
	depth,
	selectedFolder,
	onSelectFolder,
}: {
	node: FolderNode;
	depth: number;
	selectedFolder: string | null;
	onSelectFolder: (folder: string | null) => void;
}) {
	const [isOpen, setIsOpen] = useState(true);
	const hasChildren = node.children.size > 0;
	const isSelected = selectedFolder === node.path;

	const totalCount = useMemo(() => {
		let total = node.count;
		const countChildren = (n: FolderNode) => {
			for (const child of n.children.values()) {
				total += child.count;
				countChildren(child);
			}
		};
		countChildren(node);
		return total;
	}, [node]);

	return (
		<div>
			<button
				className={cn(
					"flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors",
					isSelected
						? "bg-primary/10 text-primary"
						: "text-foreground hover:bg-accent/50"
				)}
				onClick={() => {
					onSelectFolder(isSelected ? null : node.path);
					if (hasChildren) {
						setIsOpen(!isOpen);
					}
				}}
				style={{ paddingLeft: `${depth * 12 + 8}px` }}
				type="button"
			>
				{isOpen && hasChildren ? (
					<FolderOpenIcon className="size-4 shrink-0" weight="duotone" />
				) : (
					<FolderIcon className="size-4 shrink-0" weight="duotone" />
				)}
				<span className="flex-1 truncate">{node.name}</span>
				<span className="shrink-0 text-muted-foreground text-xs">
					{totalCount}
				</span>
			</button>

			{isOpen &&
				hasChildren &&
				Array.from(node.children.values())
					.sort((a, b) => a.name.localeCompare(b.name))
					.map((child) => (
						<FolderTreeItem
							depth={depth + 1}
							key={child.path}
							node={child}
							onSelectFolder={onSelectFolder}
							selectedFolder={selectedFolder}
						/>
					))}
		</div>
	);
}

export function FolderSidebar({
	flags,
	selectedFolder,
	onSelectFolder,
}: FolderSidebarProps) {
	const tree = useMemo(() => buildFolderTree(flags), [flags]);
	const uncategorizedCount = useMemo(
		() => flags.filter((f) => !f.folder).length,
		[flags]
	);
	const hasFolders = tree.children.size > 0;

	if (!hasFolders && uncategorizedCount === flags.length) {
		return null;
	}

	return (
		<div className="w-48 shrink-0 border-r py-2 pr-2">
			<p className="mb-2 px-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
				Folders
			</p>

			{/* All flags */}
			<button
				className={cn(
					"flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors",
					selectedFolder === null
						? "bg-primary/10 text-primary"
						: "text-foreground hover:bg-accent/50"
				)}
				onClick={() => onSelectFolder(null)}
				type="button"
			>
				<FlagIcon className="size-4 shrink-0" weight="duotone" />
				<span className="flex-1 truncate">All Flags</span>
				<span className="shrink-0 text-muted-foreground text-xs">
					{flags.length}
				</span>
			</button>

			{/* Folder tree */}
			{Array.from(tree.children.values())
				.sort((a, b) => a.name.localeCompare(b.name))
				.map((node) => (
					<FolderTreeItem
						depth={0}
						key={node.path}
						node={node}
						onSelectFolder={onSelectFolder}
						selectedFolder={selectedFolder}
					/>
				))}

			{/* Uncategorized */}
			{uncategorizedCount > 0 && hasFolders && (
				<button
					className={cn(
						"flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors",
						selectedFolder === ""
							? "bg-primary/10 text-primary"
							: "text-muted-foreground hover:bg-accent/50"
					)}
					onClick={() =>
						onSelectFolder(selectedFolder === "" ? null : "")
					}
					type="button"
				>
					<FlagIcon className="size-4 shrink-0" weight="duotone" />
					<span className="flex-1 truncate">Uncategorized</span>
					<span className="shrink-0 text-muted-foreground text-xs">
						{uncategorizedCount}
					</span>
				</button>
			)}
		</div>
	);
}
