"use client";

import type { LinkFolder } from "@/hooks/use-links";
import { cn } from "@/lib/utils";
import { ArchiveIcon, CaretDownIcon, CheckIcon } from "@databuddy/ui/icons";
import { useFieldContext } from "@databuddy/ui";
import { DropdownMenu } from "@databuddy/ui/client";

interface FolderDropdownProps {
	folders: LinkFolder[];
	isLoading?: boolean;
	onChange: (folderId: string) => void;
	value?: string;
}

function getSelectedLabel(
	value: string | undefined,
	folders: LinkFolder[],
	isLoading?: boolean
) {
	if (!value) {
		return "Unfiled";
	}
	return (
		folders.find((folder) => folder.id === value)?.name ??
		(isLoading ? "Loading folder..." : "Unknown folder")
	);
}

export function FolderDropdown({
	folders,
	isLoading,
	onChange,
	value,
}: FolderDropdownProps) {
	const field = useFieldContext();
	const selectedLabel = getSelectedLabel(value, folders, isLoading);

	return (
		<DropdownMenu>
			<DropdownMenu.Trigger
				aria-describedby={
					field
						? [field.error && field.errorId, field.descriptionId]
								.filter(Boolean)
								.join(" ") || undefined
						: undefined
				}
				aria-invalid={field?.error || undefined}
				aria-label={`Folder: ${selectedLabel}`}
				className={cn(
					"flex h-8 w-full cursor-pointer select-none items-center justify-between rounded-md bg-secondary px-3 text-foreground text-xs",
					"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
					"hover:bg-interactive-hover data-[popup-open]:bg-interactive-hover data-[state=open]:bg-interactive-hover",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
					field?.error &&
						"ring-2 ring-destructive/60 focus-visible:ring-destructive/60"
				)}
				id={field?.id}
				type="button"
			>
				<span className="flex min-w-0 items-center gap-2">
					<ArchiveIcon
						className="size-3.5 shrink-0 text-muted-foreground"
						weight="duotone"
					/>
					<span className="truncate">{selectedLabel}</span>
				</span>
				<CaretDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" className="w-56">
				<DropdownMenu.Group>
					<DropdownMenu.GroupLabel>Folder</DropdownMenu.GroupLabel>
					<DropdownMenu.Item onClick={() => onChange("")}>
						<CheckIcon
							className={cn("size-3.5 shrink-0", value && "opacity-0")}
						/>
						Unfiled
					</DropdownMenu.Item>
					{folders.map((folder) => (
						<DropdownMenu.Item
							key={folder.id}
							onClick={() => onChange(folder.id)}
						>
							<CheckIcon
								className={cn(
									"size-3.5 shrink-0",
									value !== folder.id && "opacity-0"
								)}
							/>
							<span className="truncate">{folder.name}</span>
						</DropdownMenu.Item>
					))}
				</DropdownMenu.Group>
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}
