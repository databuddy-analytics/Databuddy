"use client";

import { FolderIcon, PlusIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Flag } from "./types";

interface FolderSelectorProps {
	value: string | null | undefined;
	onChange: (folder: string | null) => void;
	existingFlags: Flag[];
}

export function FolderSelector({
	value,
	onChange,
	existingFlags,
}: FolderSelectorProps) {
	const [open, setOpen] = useState(false);
	const [newFolderInput, setNewFolderInput] = useState("");

	const existingFolders = useMemo(() => {
		const folders = new Set<string>();
		for (const flag of existingFlags) {
			if (flag.folder) {
				folders.add(flag.folder);
				// Also add parent folders
				const parts = flag.folder.split("/");
				for (let i = 1; i < parts.length; i++) {
					folders.add(parts.slice(0, i).join("/"));
				}
			}
		}
		return Array.from(folders).sort();
	}, [existingFlags]);

	const handleSelect = (folder: string | null) => {
		onChange(folder);
		setOpen(false);
	};

	const handleCreateFolder = () => {
		const trimmed = newFolderInput.trim().replace(/^\/+|\/+$/g, "");
		if (trimmed && /^[a-zA-Z0-9_\-\/]*$/.test(trimmed)) {
			onChange(trimmed);
			setNewFolderInput("");
			setOpen(false);
		}
	};

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Button
					className={cn(
						"w-full justify-start font-normal",
						!value && "text-muted-foreground"
					)}
					type="button"
					variant="outline"
				>
					<FolderIcon className="mr-2 size-4" weight="duotone" />
					{value || "No folder"}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-2">
				<div className="space-y-1">
					{/* No folder option */}
					<button
						className={cn(
							"flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
							!value && "bg-accent"
						)}
						onClick={() => handleSelect(null)}
						type="button"
					>
						<span className="text-muted-foreground">No folder</span>
					</button>

					{/* Existing folders */}
					{existingFolders.map((folder) => (
						<button
							className={cn(
								"flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
								value === folder && "bg-accent"
							)}
							key={folder}
							onClick={() => handleSelect(folder)}
							type="button"
						>
							<FolderIcon
								className="size-4 shrink-0 text-muted-foreground"
								weight="duotone"
							/>
							<span className="truncate">{folder}</span>
						</button>
					))}

					{/* Divider */}
					{existingFolders.length > 0 && (
						<div className="my-1 h-px bg-border" />
					)}

					{/* New folder input */}
					<div className="flex items-center gap-1">
						<Input
							className="h-8 text-sm"
							onChange={(e) => setNewFolderInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									handleCreateFolder();
								}
							}}
							placeholder="New folder path..."
							value={newFolderInput}
						/>
						<Button
							className="size-8 shrink-0"
							disabled={
								!newFolderInput.trim() ||
								!/^[a-zA-Z0-9_\-\/]*$/.test(newFolderInput.trim())
							}
							onClick={handleCreateFolder}
							size="icon"
							type="button"
							variant="ghost"
						>
							<PlusIcon className="size-4" />
						</Button>
					</div>
					<p className="px-1 text-muted-foreground text-xs">
						Use / for nested folders (e.g. billing/plans)
					</p>
				</div>
			</PopoverContent>
		</Popover>
	);
}
