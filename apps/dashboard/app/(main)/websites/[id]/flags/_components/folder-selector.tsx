"use client";

import { CaretDownIcon, FolderIcon, PlusIcon } from "@phosphor-icons/react";
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

interface FolderSelectorProps {
	value?: string;
	onValueChange: (value: string) => void;
	folders: string[];
	placeholder?: string;
	className?: string;
}

export function FolderSelector({
	value,
	onValueChange,
	folders,
	placeholder = "Select folder...",
	className,
}: FolderSelectorProps) {
	const [open, setOpen] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");

	// Get unique folders from the list
	const uniqueFolders = Array.from(new Set(folders.filter((folder): folder is string => Boolean(folder))));

	const handleCreateFolder = () => {
		const trimmed = newFolderName.trim();
		if (!trimmed) return;
		
		const folderRegex = /^$|^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/;
		if (!folderRegex.test(trimmed)) return; // silently skip invalid names
		
		onValueChange(trimmed);
		setNewFolderName("");
		setOpen(false);
	};

	const displayValue = value || "No folder";

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					className={cn("justify-between", className)}
				>
					<div className="flex items-center gap-2">
						<FolderIcon size={16} weight="duotone" />
						<span className="truncate">{displayValue}</span>
					</div>
					<CaretDownIcon
						className={cn(
							"ml-2 size-4 shrink-0 opacity-50 transition-transform",
							open && "rotate-180"
						)}
					/>
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[300px] p-0" align="start">
				<Command>
					<CommandInput
						placeholder="Search folders..."
						value={newFolderName}
						onValueChange={setNewFolderName}
					/>
					<CommandList>
						<CommandEmpty>
							<div className="flex flex-col items-center gap-2 py-4">
								<span className="text-muted-foreground text-sm">
									No folders found
								</span>
								{newFolderName.trim() && /^$|^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(newFolderName.trim()) && (
									<Button
										size="sm"
										onClick={handleCreateFolder}
										className="gap-2"
									>
										<PlusIcon size={14} />
										Create "{newFolderName.trim()}"
									</Button>
								)}
							</div>
						</CommandEmpty>
						<CommandGroup>
							<CommandItem
								value=""
								onSelect={() => {
									onValueChange("");
									setOpen(false);
								}}
								className="gap-2"
							>
								<FolderIcon size={16} weight="duotone" className="opacity-50" />
								<span>No folder</span>
								{value === "" && (
									<div className="ml-auto size-2 rounded-full bg-primary" />
								)}
							</CommandItem>
							{uniqueFolders.map((folder) => (
								<CommandItem
									key={folder}
									value={folder}
									onSelect={() => {
										onValueChange(folder);
										setOpen(false);
									}}
									className="gap-2"
								>
									<FolderIcon size={16} weight="duotone" />
									<span className="truncate">{folder}</span>
									{value === folder && (
										<div className="ml-auto size-2 rounded-full bg-primary" />
									)}
								</CommandItem>
							))}
						</CommandGroup>
						{newFolderName.trim() && !uniqueFolders.includes(newFolderName.trim()) && (
							<>
								<CommandSeparator />
								<CommandGroup>
									{/^$|^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(newFolderName.trim()) && (
										<CommandItem
											onSelect={handleCreateFolder}
											className="gap-2"
										>
											<PlusIcon size={16} />
											<span>Create "{newFolderName.trim()}"</span>
										</CommandItem>
									)}
								</CommandGroup>
							</>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}