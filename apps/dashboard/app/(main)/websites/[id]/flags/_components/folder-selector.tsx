"use client";

import { FolderIcon, FolderOpenIcon, PlusIcon } from "@phosphor-icons/react";
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
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface FolderSelectorProps {
	value?: string;
	onChange: (value: string | undefined) => void;
	folders: string[];
}

export function FolderSelector({
	value,
	onChange,
	folders,
}: FolderSelectorProps) {
	const [open, setOpen] = useState(false);
	const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");

	const handleCreateFolder = () => {
		if (newFolderName.trim()) {
			onChange(newFolderName.trim());
			setNewFolderName("");
			setShowNewFolderDialog(false);
			setOpen(false);
		}
	};

	const uniqueFolders = Array.from(new Set(folders.filter(Boolean)));

	return (
		<>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						role="combobox"
						aria-expanded={open}
						className="w-full justify-start font-normal"
					>
						{value ? (
							<>
								<FolderOpenIcon className="mr-2 size-4" weight="duotone" />
								<span className="truncate">{value}</span>
							</>
						) : (
							<>
								<FolderIcon className="mr-2 size-4 opacity-50" weight="duotone" />
								<span className="text-muted-foreground">No folder</span>
							</>
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-[300px] p-0" align="start">
					<Command>
						<CommandInput placeholder="Search folders..." />
						<CommandList>
							<CommandEmpty>No folders found.</CommandEmpty>
							<CommandGroup>
								<CommandItem
									onSelect={() => {
										onChange(undefined);
										setOpen(false);
									}}
									className={cn(!value && "bg-accent")}
								>
									<FolderIcon className="mr-2 size-4" weight="duotone" />
									<span>No folder (root)</span>
								</CommandItem>
								{uniqueFolders.map((folder) => (
									<CommandItem
										key={folder}
										onSelect={() => {
											onChange(folder);
											setOpen(false);
										}}
										className={cn(value === folder && "bg-accent")}
									>
										<FolderOpenIcon className="mr-2 size-4" weight="duotone" />
										<span className="truncate">{folder}</span>
									</CommandItem>
								))}
							</CommandGroup>
							<CommandSeparator />
							<CommandGroup>
								<CommandItem
									onSelect={() => {
										setShowNewFolderDialog(true);
										setOpen(false);
									}}
								>
									<PlusIcon className="mr-2 size-4" />
									<span>Create new folder</span>
								</CommandItem>
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>

			<Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Create New Folder</DialogTitle>
						<DialogDescription>
							Enter a name for the new folder. You can use slashes (/) for nested
							folders, e.g., "auth/login".
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2">
						<Label htmlFor="folder-name">Folder Name</Label>
						<Input
							id="folder-name"
							placeholder="e.g., auth/login"
							value={newFolderName}
							onChange={(e) => setNewFolderName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									handleCreateFolder();
								}
							}}
						/>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setShowNewFolderDialog(false);
								setNewFolderName("");
							}}
						>
							Cancel
						</Button>
						<Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
							Create Folder
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
