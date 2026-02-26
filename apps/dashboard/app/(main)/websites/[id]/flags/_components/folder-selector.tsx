"use client";

import { FolderIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface FolderSelectorProps {
	folders: string[];
	value: string | null;
	onChange: (folder: string | null) => void;
	onCreateFolder?: (name: string) => void;
}

export function FolderSelector({
	folders,
	value,
	onChange,
	onCreateFolder,
}: FolderSelectorProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const handleSelect = (folder: string) => {
		onChange(folder === "none" ? null : folder);
		setOpen(false);
	};

	const handleCreateNew = () => {
		if (search && onCreateFolder) {
			onCreateFolder(search);
			setSearch("");
			setOpen(false);
		}
	};

	const displayValue = value || "No folder";

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					className="w-full justify-between"
				>
					<div className="flex items-center gap-2">
						<FolderIcon className="size-4" weight="duotone" />
						<span className="truncate">{displayValue}</span>
					</div>
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[300px] p-0">
				<Command>
					<CommandInput
						placeholder="Search or create folder..."
						value={search}
						onValueChange={setSearch}
					/>
					<CommandEmpty>
						{search && onCreateFolder ? (
							<div className="p-2">
								<Button
									variant="ghost"
									className="w-full justify-start"
									onClick={handleCreateNew}
								>
									Create "{search}"
								</Button>
							</div>
						) : (
							<div className="p-4 text-center text-muted-foreground text-sm">
								No folders found
							</div>
						)}
					</CommandEmpty>
					<CommandGroup>
						<CommandItem
							value="none"
							onSelect={() => handleSelect("none")}
							className={cn(value === null && "bg-accent")}
						>
							<FolderIcon className="mr-2 size-4" weight="duotone" />
							No folder
						</CommandItem>
						{folders.map((folder) => (
							<CommandItem
								key={folder}
								value={folder}
								onSelect={() => handleSelect(folder)}
								className={cn(value === folder && "bg-accent")}
							>
								<FolderIcon className="mr-2 size-4" weight="duotone" />
								{folder}
							</CommandItem>
						))}
					</CommandGroup>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
