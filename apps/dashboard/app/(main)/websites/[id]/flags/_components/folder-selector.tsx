"use client";

import {
	CaretRightIcon,
	FolderIcon,
	FolderOpenIcon,
	FolderPlusIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface FolderSelectorProps {
	value: string | null | undefined;
	onChange: (folder: string | null) => void;
	existingFolders: string[];
}

interface FolderNode {
	name: string;
	path: string;
	children: FolderNode[];
}

function buildFolderTree(folders: string[]): FolderNode[] {
	const root: FolderNode[] = [];

	for (const folder of folders) {
		const parts = folder.split("/");
		let currentLevel = root;

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			const path = parts.slice(0, i + 1).join("/");
			let existing = currentLevel.find((node) => node.name === part);

			if (!existing) {
				existing = { name: part, path, children: [] };
				currentLevel.push(existing);
			}

			currentLevel = existing.children;
		}
	}

	return root;
}

function FolderTreeItem({
	node,
	selectedPath,
	onSelect,
	depth = 0,
}: {
	node: FolderNode;
	selectedPath: string | null | undefined;
	onSelect: (path: string) => void;
	depth?: number;
}) {
	const [isExpanded, setIsExpanded] = useState(true);
	const hasChildren = node.children.length > 0;
	const isSelected = selectedPath === node.path;

	return (
		<div>
			<button
				className={cn(
					"flex w-full items-center gap-1.5 rounded p-1.5 text-left text-sm transition-colors hover:bg-accent",
					isSelected && "bg-accent"
				)}
				onClick={() => onSelect(node.path)}
				style={{ paddingLeft: `${depth * 12 + 6}px` }}
				type="button"
			>
				{hasChildren && (
					<button
						className="shrink-0 p-0.5"
						onClick={(e) => {
							e.stopPropagation();
							setIsExpanded(!isExpanded);
						}}
						type="button"
					>
						<CaretRightIcon
							className={cn(
								"size-3 text-muted-foreground transition-transform",
								isExpanded && "rotate-90"
							)}
						/>
					</button>
				)}
				{!hasChildren && <span className="w-4" />}
				{isExpanded && hasChildren ? (
					<FolderOpenIcon
						className="size-4 shrink-0 text-amber-500"
						weight="duotone"
					/>
				) : (
					<FolderIcon
						className="size-4 shrink-0 text-amber-500"
						weight="duotone"
					/>
				)}
				<span className="truncate">{node.name}</span>
			</button>
			{isExpanded && hasChildren && (
				<div>
					{node.children.map((child) => (
						<FolderTreeItem
							depth={depth + 1}
							key={child.path}
							node={child}
							onSelect={onSelect}
							selectedPath={selectedPath}
						/>
					))}
				</div>
			)}
		</div>
	);
}

export function FolderSelector({
	value,
	onChange,
	existingFolders,
}: FolderSelectorProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [isCreating, setIsCreating] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");

	const folderTree = useMemo(
		() => buildFolderTree(existingFolders),
		[existingFolders]
	);

	const handleSelect = (path: string | null) => {
		onChange(path);
		setIsOpen(false);
	};

	const handleCreateFolder = () => {
		if (newFolderName.trim()) {
			const folderPath = value
				? `${value}/${newFolderName.trim()}`
				: newFolderName.trim();
			onChange(folderPath);
			setNewFolderName("");
			setIsCreating(false);
			setIsOpen(false);
		}
	};

	const displayValue = value || "Uncategorized";

	return (
		<div className="space-y-2">
			<Popover onOpenChange={setIsOpen} open={isOpen}>
				<PopoverTrigger asChild>
					<Button
						className={cn(
							"h-9 w-full justify-between gap-2 font-normal",
							!value && "text-muted-foreground"
						)}
						type="button"
						variant="outline"
					>
						<div className="flex items-center gap-2 truncate">
							<FolderIcon className="size-4 shrink-0 text-amber-500" weight="duotone" />
							<span className="truncate">{displayValue}</span>
						</div>
						{value && (
							<button
								className="shrink-0 text-muted-foreground hover:text-foreground"
								onClick={(e) => {
									e.stopPropagation();
									onChange(null);
								}}
								type="button"
							>
								<XIcon className="size-4" />
							</button>
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-64 p-2">
					{/* Uncategorized option */}
					<button
						className={cn(
							"flex w-full items-center gap-2 rounded p-2 text-left text-sm transition-colors hover:bg-accent",
							!value && "bg-accent"
						)}
						onClick={() => handleSelect(null)}
						type="button"
					>
						<FolderIcon className="size-4 text-muted-foreground" />
						<span>Uncategorized</span>
					</button>

					{/* Folder tree */}
					{folderTree.length > 0 && (
						<div
							className="mt-1 max-h-48 overflow-y-auto border-t pt-1"
							onTouchMove={(e) => e.stopPropagation()}
							onWheel={(e) => e.stopPropagation()}
						>
							{folderTree.map((node) => (
								<FolderTreeItem
									key={node.path}
									node={node}
									onSelect={handleSelect}
									selectedPath={value}
								/>
							))}
						</div>
					)}

					{/* Create new folder */}
					<div className="mt-2 border-t pt-2">
						{isCreating ? (
							<div className="flex gap-1.5">
								<Input
									autoFocus
									className="h-8 flex-1"
									onChange={(e) => setNewFolderName(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											handleCreateFolder();
										} else if (e.key === "Escape") {
											setIsCreating(false);
											setNewFolderName("");
										}
									}}
									placeholder={value ? `${value}/...` : "folder-name"}
									value={newFolderName}
								/>
								<Button
									className="h-8 shrink-0"
									disabled={!newFolderName.trim()}
									onClick={handleCreateFolder}
									size="sm"
									type="button"
								>
									Add
								</Button>
							</div>
						) : (
							<Button
								className="h-8 w-full gap-1.5 text-muted-foreground"
								onClick={() => setIsCreating(true)}
								size="sm"
								type="button"
								variant="ghost"
							>
								<FolderPlusIcon className="size-4" weight="duotone" />
								{value ? "Create subfolder" : "Create folder"}
							</Button>
						)}
					</div>
				</PopoverContent>
			</Popover>
		</div>
	);
}
