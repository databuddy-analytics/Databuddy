"use client";

import {
	CaretDownIcon,
	CheckIcon,
	FolderIcon,
	FolderOpenIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { FolderNode } from "./folder-utils";
import { getAllFolderPaths } from "./folder-utils";

interface FolderSelectorProps {
	folders: FolderNode[];
	value?: string;
	onChange: (folderPath: string) => void;
	placeholder?: string;
	className?: string;
}

interface FolderOptionProps {
	folder: FolderNode;
	level: number;
	selectedValue?: string;
	onSelect: (path: string) => void;
}

function FolderOption({ folder, level, selectedValue, onSelect }: FolderOptionProps) {
	const isSelected = selectedValue === folder.path;
	const hasChildren = folder.children.length > 0;

	return (
		<>
			<CommandItem
				className="flex items-center gap-2"
				onSelect={() => onSelect(folder.path)}
				value={folder.path}
			>
				{/* Indentation for nested folders */}
				{level > 0 && <div className="w-4" style={{ marginLeft: `${(level - 1) * 16}px` }} />}
				
				{/* Folder icon */}
				<div className="flex size-4 items-center justify-center text-muted-foreground">
					{hasChildren ? (
						<FolderOpenIcon size={14} weight="duotone" />
					) : (
						<FolderIcon size={14} weight="duotone" />
					)}
				</div>

				{/* Folder name */}
				<span className="flex-1">
					{folder.name}
					{folder.path === "" && " (No folder)"}
				</span>

				{/* Flag count */}
				{folder.flagCount > 0 && (
					<span className="text-xs text-muted-foreground">
						{folder.flagCount}
					</span>
				)}

				{/* Selected indicator */}
				{isSelected && (
					<CheckIcon size={14} className="text-primary" weight="bold" />
				)}
			</CommandItem>

			{/* Render children */}
			{folder.children.map((child) => (
				<FolderOption
					key={child.id}
					folder={child}
					level={level + 1}
					onSelect={onSelect}
					selectedValue={selectedValue}
				/>
			))}
		</>
	);
}

export function FolderSelector({
	folders,
	value,
	onChange,
	placeholder = "Select folder...",
	className,
}: FolderSelectorProps) {
	const [open, setOpen] = useState(false);
	const [createMode, setCreateMode] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");

	const allPaths = getAllFolderPaths(folders);
	const selectedFolder = folders.find((f) => findFolderByPath(f, value || ""));
	
	function findFolderByPath(folder: FolderNode, path: string): FolderNode | null {
		if (folder.path === path) return folder;
		for (const child of folder.children) {
			const found = findFolderByPath(child, path);
			if (found) return found;
		}
		return null;
	}

	const handleSelect = (folderPath: string) => {
		onChange(folderPath);
		setOpen(false);
		setCreateMode(false);
	};

	const handleCreateFolder = () => {
		if (!newFolderName.trim()) return;
		
		// For now, we'll just create a simple folder path
		// In a real app, this would call an API to create the folder first
		const folderPath = newFolderName.trim();
		onChange(folderPath);
		setNewFolderName("");
		setCreateMode(false);
		setOpen(false);
	};

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Button
					aria-expanded={open}
					className={cn("justify-between", className)}
					role="combobox"
					variant="outline"
				>
					<div className="flex items-center gap-2">
						{selectedFolder ? (
							<>
								<FolderIcon size={14} weight="duotone" />
								<span>
									{selectedFolder.path || "No folder"}
								</span>
							</>
						) : (
							<span className="text-muted-foreground">{placeholder}</span>
						)}
					</div>
					<CaretDownIcon size={14} className="opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-80 p-0" side="bottom" align="start">
				<Command>
					{!createMode && (
						<CommandInput placeholder="Search folders..." />
					)}
					
					{createMode ? (
						<div className="p-3">
							<div className="flex items-center gap-2">
								<FolderIcon size={14} className="text-muted-foreground" weight="duotone" />
								<input
									autoFocus
									className="flex-1 bg-transparent outline-none text-sm"
									onChange={(e) => setNewFolderName(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") handleCreateFolder();
										if (e.key === "Escape") {
											setCreateMode(false);
											setNewFolderName("");
										}
									}}
									placeholder="Folder name"
									value={newFolderName}
								/>
							</div>
							<div className="flex justify-end gap-2 mt-3">
								<Button
									onClick={() => {
										setCreateMode(false);
										setNewFolderName("");
									}}
									size="sm"
									variant="ghost"
								>
									Cancel
								</Button>
								<Button
									disabled={!newFolderName.trim()}
									onClick={handleCreateFolder}
									size="sm"
								>
									Create
								</Button>
							</div>
						</div>
					) : (
						<CommandList>
							<CommandEmpty>No folders found.</CommandEmpty>
							<CommandGroup>
								{folders.map((folder) => (
									<FolderOption
										key={folder.id}
										folder={folder}
										level={0}
										onSelect={handleSelect}
										selectedValue={value}
									/>
								))}
							</CommandGroup>
							<CommandSeparator />
							<CommandGroup>
								<CommandItem
									className="flex items-center gap-2"
									onSelect={() => setCreateMode(true)}
								>
									<PlusIcon size={14} />
									<span>Create new folder</span>
								</CommandItem>
							</CommandGroup>
						</CommandList>
					)}
				</Command>
			</PopoverContent>
		</Popover>
	);
}