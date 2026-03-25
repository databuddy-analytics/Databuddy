"use client";

import {
	CaretDownIcon,
	CaretRightIcon,
	FolderIcon,
	FolderOpenIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Flag } from "./types";

interface FolderNode {
	name: string;
	path: string;
	children: FolderNode[];
	flags: Flag[];
	isExpanded: boolean;
}

interface FolderTreeProps {
	flags: Flag[];
	selectedFolder?: string;
	onFolderSelect: (folderPath: string) => void;
	className?: string;
}

export function FolderTree({
	flags,
	selectedFolder,
	onFolderSelect,
	className,
}: FolderTreeProps) {
	const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
		new Set([""])
	);

	// Build folder tree from flags
	const folderTree = useMemo(() => {
		const buildFolderTree = (flags: Flag[]): FolderNode => {
			const root: FolderNode = {
				name: "Root",
				path: "",
				children: [],
				flags: [],
				isExpanded: true,
			};

			const folderMap = new Map<string, FolderNode>();
		folderMap.set("", root);

		// First pass: create all folder nodes
		for (const flag of flags) {
			const folderPath = flag.folder || "";
			
			if (folderPath && !folderMap.has(folderPath)) {
				const parts = folderPath.split("/").filter(Boolean);
				let currentPath = "";
				let parentNode = root;

				for (let i = 0; i < parts.length; i++) {
					const part = parts[i];
					const newPath = currentPath ? `${currentPath}/${part}` : part;

					if (!folderMap.has(newPath)) {
						const newNode: FolderNode = {
							name: part,
							path: newPath,
							children: [],
							flags: [],
							isExpanded: expandedFolders.has(newPath),
						};
						folderMap.set(newPath, newNode);
						parentNode.children.push(newNode);
					}

					parentNode = folderMap.get(newPath)!;
					currentPath = newPath;
				}
			}
		}

		// Second pass: assign flags to their folders
		for (const flag of flags) {
			const folderPath = flag.folder || "";
			const folderNode = folderMap.get(folderPath);
			if (folderNode) {
				folderNode.flags.push(flag);
			}
		}

		// Sort children alphabetically
		const sortChildren = (node: FolderNode) => {
			node.children.sort((a, b) => a.name.localeCompare(b.name));
			for (const child of node.children) {
				sortChildren(child);
			}
		};
		sortChildren(root);

		return root;
		};

		return buildFolderTree(flags);
	}, [flags]); // Removed expandedFolders dependency for performance

	const toggleFolder = (folderPath: string) => {
		const newExpanded = new Set(expandedFolders);
		if (newExpanded.has(folderPath)) {
			newExpanded.delete(folderPath);
		} else {
			newExpanded.add(folderPath);
		}
		setExpandedFolders(newExpanded);
	};

	const renderFolderNode = (node: FolderNode, depth = 0) => {
		const isSelected = selectedFolder === node.path;
		const isExpanded = expandedFolders.has(node.path);
		const hasChildren = node.children.length > 0;
		const flagCount = node.flags.length;

		return (
			<div key={node.path}>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => onFolderSelect(node.path)}
					className={cn(
						"w-full justify-start gap-2 px-2 py-1.5 h-auto font-normal",
						isSelected && "bg-accent text-accent-foreground",
						depth > 0 && "ml-4"
					)}
					style={{ paddingLeft: `${depth * 16 + 8}px` }}
				>
					{hasChildren && (
						<div
							onClick={(e) => {
								e.stopPropagation();
								toggleFolder(node.path);
							}}
							className="flex items-center justify-center size-4 hover:bg-accent rounded cursor-pointer"
							role="button"
							tabIndex={0}
							onKeyDown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									e.stopPropagation();
									toggleFolder(node.path);
								}
							}}
						>
							{isExpanded ? (
								<CaretDownIcon size={12} />
							) : (
								<CaretRightIcon size={12} />
							)}
						</div>
					)}
					{!hasChildren && <div className="size-4" />}
					
					{isExpanded && hasChildren ? (
						<FolderOpenIcon size={16} weight="duotone" />
					) : (
						<FolderIcon size={16} weight="duotone" />
					)}
					
					<span className="flex-1 truncate text-left">
						{node.name === "Root" ? "Uncategorized" : node.name}
					</span>
					
					{flagCount > 0 && (
						<span className="text-muted-foreground text-xs">
							{flagCount}
						</span>
					)}
				</Button>

				<AnimatePresence>
					{isExpanded && hasChildren && (
						<motion.div
							initial={{ opacity: 0, scaleY: 0 }}
							animate={{ opacity: 1, scaleY: 1 }}
							exit={{ opacity: 0, scaleY: 0 }}
							transition={{ duration: 0.2 }}
							className="overflow-hidden origin-top"
						>
							{node.children.map((child) => renderFolderNode(child, depth + 1))}
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		);
	};

	return (
		<div className={cn("space-y-1", className)}>
			{/* All Flags option */}
			<Button
				variant="ghost"
				size="sm"
				onClick={() => onFolderSelect("ALL")}
				className={cn(
					"w-full justify-start gap-2 px-2 py-1.5 h-auto font-normal",
					selectedFolder === "ALL" && "bg-accent text-accent-foreground"
				)}
			>
				<div className="size-4" />
				<FolderIcon size={16} weight="duotone" />
				<span className="flex-1 truncate text-left">All Flags</span>
				<span className="text-muted-foreground text-xs">
					{flags.length}
				</span>
			</Button>
			{renderFolderNode(folderTree)}
		</div>
	);
}