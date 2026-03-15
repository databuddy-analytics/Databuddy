"use client";

import {
	CaretDownIcon,
	CaretRightIcon,
	FolderIcon,
	FolderOpenIcon,
	FolderPlusIcon,
	HouseIcon,
} from "@phosphor-icons/react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

interface FolderTreeProps {
	folders: string[];
	selectedFolder: string | null;
	onSelectFolder: (folder: string | null) => void;
	onCreateFolder: (name: string) => void;
}

interface FolderNode {
	name: string;
	path: string;
	children: Map<string, FolderNode>;
}

function buildFolderTree(folders: string[]): FolderNode {
	const root: FolderNode = { name: "All Flags", path: "", children: new Map() };
	for (const folder of folders) {
		const parts = folder.split("/");
		let current = root;
		let currentPath = "";
		for (const part of parts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			if (!current.children.has(part)) {
				current.children.set(part, {
					name: part,
					path: currentPath,
					children: new Map(),
				});
			}
			current = current.children.get(part)!;
		}
	}
	return root;
}

function FolderNodeItem({
	node,
	selectedFolder,
	onSelectFolder,
	depth = 0,
}: {
	node: FolderNode;
	selectedFolder: string | null;
	onSelectFolder: (folder: string | null) => void;
	depth?: number;
}) {
	const [expanded, setExpanded] = useState(true);
	const hasChildren = node.children.size > 0;
	const isSelected = selectedFolder === node.path || (selectedFolder === null && node.path === "");
	const isRoot = node.path === "";

	return (
		<div>
			<button
				type="button"
				onClick={() => {
					onSelectFolder(isRoot ? null : node.path);
				}}
				className={cn(
					"flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
					isSelected && "bg-accent font-medium"
				)}
				style={{ paddingLeft: `${depth * 16 + 8}px` }}
			>
				{hasChildren ? (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							setExpanded(!expanded);
						}}
						className="shrink-0"
					>
						{expanded ? (
							<CaretDownIcon className="h-3.5 w-3.5 text-muted-foreground" />
						) : (
							<CaretRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
						)}
					</button>
				) : (
					<span className="w-3.5" />
				)}
				{isRoot ? (
					<HouseIcon className="h-4 w-4 text-muted-foreground" />
				) : expanded && hasChildren ? (
					<FolderOpenIcon className="h-4 w-4 text-amber-500" />
				) : (
					<FolderIcon className="h-4 w-4 text-amber-500" />
				)}
				<span className="truncate">{node.name}</span>
			</button>
			{expanded && hasChildren && (
				<div>
					{Array.from(node.children.values()).map((child) => (
						<FolderNodeItem
							key={child.path}
							node={child}
							selectedFolder={selectedFolder}
							onSelectFolder={onSelectFolder}
							depth={depth + 1}
						/>
					))}
				</div>
			)}
		</div>
	);
}

export function FolderTree({
	folders,
	selectedFolder,
	onSelectFolder,
	onCreateFolder,
}: FolderTreeProps) {
	const [isCreating, setIsCreating] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");

	const tree = useMemo(() => buildFolderTree(folders), [folders]);

	const handleCreate = () => {
		const name = newFolderName.trim();
		if (name) {
			const fullPath = selectedFolder ? `${selectedFolder}/${name}` : name;
			onCreateFolder(fullPath);
			setNewFolderName("");
			setIsCreating(false);
		}
	};

	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center justify-between px-2 py-1">
				<span className="text-xs font-medium uppercase text-muted-foreground">
					Folders
				</span>
				<Popover open={isCreating} onOpenChange={setIsCreating}>
					<PopoverTrigger asChild>
						<Button variant="ghost" size="icon" className="h-6 w-6">
							<FolderPlusIcon className="h-3.5 w-3.5" />
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-60 p-3" align="end">
						<div className="flex flex-col gap-2">
							<span className="text-sm font-medium">New Folder</span>
							<Input
								placeholder="Folder name"
								value={newFolderName}
								onChange={(e) => setNewFolderName(e.target.value)}
								onKeyDown={(e) => e.key === "Enter" && handleCreate()}
								autoFocus
							/>
							<Button size="sm" onClick={handleCreate}>
								Create
							</Button>
						</div>
					</PopoverContent>
				</Popover>
			</div>
			<FolderNodeItem
				node={tree}
				selectedFolder={selectedFolder}
				onSelectFolder={onSelectFolder}
			/>
			{/* Show "Uncategorized" if there are flags without folders */}
			<button
				type="button"
				onClick={() => onSelectFolder("__uncategorized__")}
				className={cn(
					"flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
					selectedFolder === "__uncategorized__" && "bg-accent font-medium"
				)}
				style={{ paddingLeft: "24px" }}
			>
				<span className="w-3.5" />
				<FolderIcon className="h-4 w-4 text-muted-foreground" />
				<span className="truncate text-muted-foreground">Uncategorized</span>
			</button>
		</div>
	);
}
