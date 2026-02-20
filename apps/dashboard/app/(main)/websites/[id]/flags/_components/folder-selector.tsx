"use client";

import { FolderIcon, FolderOpenIcon, PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
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
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

interface FolderSelectorProps {
	websiteId: string;
	value: string | null | undefined;
	onValueChange: (value: string | null) => void;
	disabled?: boolean;
}

export function FolderSelector({
	websiteId,
	value,
	onValueChange,
	disabled,
}: FolderSelectorProps) {
	const [open, setOpen] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");

	const { data: flags } = useQuery({
		...orpc.flags.list.queryOptions({
			input: { websiteId },
		}),
	});

	// Extract unique folders from flags
	const folders = Array.from(
		new Set(
			(flags ?? [])
				.map((f: { folder?: string | null }) => f.folder)
				.filter((f): f is string => Boolean(f))
		)
	).sort();

	const handleCreateFolder = () => {
		if (newFolderName.trim()) {
			onValueChange(newFolderName.trim());
			setNewFolderName("");
			setOpen(false);
		}
	};

	const displayValue = value || "No folder";
	const IconComponent = value ? FolderOpenIcon : FolderIcon;

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Button
					aria-expanded={open}
					className="w-full justify-start gap-2 font-normal"
					disabled={disabled}
					role="combobox"
					variant="outline"
				>
					<IconComponent className="size-4 text-muted-foreground" />
					<span className="truncate">{displayValue}</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-[300px] p-0">
				<Command>
					<CommandInput placeholder="Search folders..." />
					<CommandList>
						<CommandEmpty>
							<div className="space-y-2 p-2">
								<p className="text-muted-foreground text-sm">No folders found</p>
								{newFolderName && (
									<Button
										className="w-full gap-2"
										onClick={handleCreateFolder}
										size="sm"
									>
										<PlusIcon className="size-4" />
										Create &quot;{newFolderName}&quot;
									</Button>
								)}
							</div>
						</CommandEmpty>
						<CommandGroup>
							<CommandItem
								className="gap-2"
								onSelect={() => {
									onValueChange(null);
									setOpen(false);
								}}
								value=""
							>
								<FolderIcon
									className={cn("size-4", !value && "text-primary")}
								/>
								<span className={cn(!value && "font-medium")}>No folder</span>
							</CommandItem>
						</CommandGroup>
						{folders.length > 0 && (
							<>
								<CommandSeparator />
								<CommandGroup heading="Folders">
									{folders.map((folder) => (
										<CommandItem
											className="gap-2"
											key={folder}
											onSelect={() => {
												onValueChange(folder);
												setOpen(false);
											}}
											value={folder}
										>
											<FolderOpenIcon
												className={cn(
													"size-4",
													value === folder && "text-primary"
												)}
											/>
											<span className={cn(value === folder && "font-medium")}>
												{folder}
											</span>
										</CommandItem>
									))}
								</CommandGroup>
							</>
						)}
						<CommandSeparator />
						<div className="p-2">
							<div className="flex gap-2">
								<input
									className="flex-1 rounded border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
									onChange={(e) => setNewFolderName(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											handleCreateFolder();
										}
									}}
									placeholder="New folder name..."
									value={newFolderName}
								/>
								<Button
									disabled={!newFolderName.trim()}
									onClick={handleCreateFolder}
									size="sm"
									type="button"
								>
									<PlusIcon className="size-4" />
								</Button>
							</div>
						</div>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
