"use client";

import type {
	LinkFolder,
	LinkSortOption,
	LinkTypeFilter,
} from "@/hooks/use-links";
import {
	ArrowsDownUpIcon as SortAscendingIcon,
	FolderSimpleIcon,
	FunnelIcon,
	MagnifyingGlassIcon,
	XMarkIcon as XIcon,
} from "@databuddy/ui/icons";
import { Input } from "@databuddy/ui";
import { DropdownMenu } from "@databuddy/ui/client";

const SORT_LABELS: Record<LinkSortOption, string> = {
	newest: "Newest",
	oldest: "Oldest",
	"name-asc": "A → Z",
	"name-desc": "Z → A",
};

const TYPE_LABELS: Record<LinkTypeFilter, string> = {
	all: "All",
	short: "Short Links",
	deep: "Deep Links",
};

const UNFILED_VALUE = "__unfiled__";
const ALL_FOLDERS_VALUE = "__all__";

interface LinksSearchBarProps {
	folderId: string | null | undefined;
	folders: LinkFolder[];
	onFolderChangeAction: (folderId: string | null | undefined) => void;
	onSearchQueryChangeAction: (query: string) => void;
	onSortByChangeAction: (sort: LinkSortOption) => void;
	onTypeFilterChangeAction: (type: LinkTypeFilter) => void;
	searchQuery: string;
	sortBy: LinkSortOption;
	typeFilter: LinkTypeFilter;
}

function folderFilterValue(folderId: string | null | undefined): string {
	if (folderId === undefined) {
		return ALL_FOLDERS_VALUE;
	}
	if (folderId === null) {
		return UNFILED_VALUE;
	}
	return folderId;
}

function folderFilterLabel(
	folderId: string | null | undefined,
	folders: LinkFolder[]
): string {
	if (folderId === undefined) {
		return "All folders";
	}
	if (folderId === null) {
		return "Unfiled";
	}
	return folders.find((folder) => folder.id === folderId)?.name ?? "Folder";
}

export function LinksSearchBar({
	searchQuery,
	onSearchQueryChangeAction,
	sortBy,
	onSortByChangeAction,
	typeFilter,
	onTypeFilterChangeAction,
	folders,
	folderId,
	onFolderChangeAction,
}: LinksSearchBarProps) {
	return (
		<div className="flex w-full items-center gap-1.5">
			<div className="relative flex-1">
				<MagnifyingGlassIcon
					className="absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2 text-muted-foreground"
					weight="bold"
				/>
				<Input
					className="h-7 pr-7 pl-8"
					onChange={(e) => onSearchQueryChangeAction(e.target.value)}
					placeholder="Search links"
					value={searchQuery}
					variant="ghost"
				/>
				{searchQuery && (
					<button
						aria-label="Clear search"
						className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
						onClick={() => onSearchQueryChangeAction("")}
						type="button"
					>
						<XIcon className="size-3" />
					</button>
				)}
			</div>

			{folders.length > 0 && (
				<DropdownMenu>
					<DropdownMenu.Trigger
						className={`inline-flex h-7 max-w-32 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs transition-colors hover:bg-interactive-hover hover:text-foreground ${folderId === undefined ? "text-muted-foreground" : "text-foreground"}`}
					>
						<FolderSimpleIcon
							size={14}
							weight={folderId === undefined ? "bold" : "fill"}
						/>
						<span className="hidden truncate sm:inline">
							{folderFilterLabel(folderId, folders)}
						</span>
					</DropdownMenu.Trigger>
					<DropdownMenu.Content
						align="end"
						className="max-h-72 w-44 overflow-auto"
					>
						<DropdownMenu.RadioGroup
							onValueChange={(value) => {
								if (value === ALL_FOLDERS_VALUE) {
									onFolderChangeAction(undefined);
								} else if (value === UNFILED_VALUE) {
									onFolderChangeAction(null);
								} else {
									onFolderChangeAction(value);
								}
							}}
							value={folderFilterValue(folderId)}
						>
							<DropdownMenu.RadioItem value={ALL_FOLDERS_VALUE}>
								All folders
							</DropdownMenu.RadioItem>
							<DropdownMenu.RadioItem value={UNFILED_VALUE}>
								Unfiled
							</DropdownMenu.RadioItem>
							{folders.map((folder) => (
								<DropdownMenu.RadioItem key={folder.id} value={folder.id}>
									{folder.name}
								</DropdownMenu.RadioItem>
							))}
						</DropdownMenu.RadioGroup>
					</DropdownMenu.Content>
				</DropdownMenu>
			)}

			<DropdownMenu>
				<DropdownMenu.Trigger
					className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs transition-colors hover:bg-interactive-hover hover:text-foreground ${typeFilter === "all" ? "text-muted-foreground" : "text-foreground"}`}
				>
					<FunnelIcon
						size={14}
						weight={typeFilter === "all" ? "bold" : "fill"}
					/>
					<span className="hidden sm:inline">{TYPE_LABELS[typeFilter]}</span>
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" className="w-36">
					<DropdownMenu.Group>
						<DropdownMenu.GroupLabel>Type</DropdownMenu.GroupLabel>
					</DropdownMenu.Group>
					<DropdownMenu.Separator />
					<DropdownMenu.RadioGroup
						onValueChange={(value) =>
							onTypeFilterChangeAction(value as LinkTypeFilter)
						}
						value={typeFilter}
					>
						<DropdownMenu.RadioItem value="all">All</DropdownMenu.RadioItem>
						<DropdownMenu.RadioItem value="short">
							Short Links
						</DropdownMenu.RadioItem>
						<DropdownMenu.RadioItem value="deep">
							Deep Links
						</DropdownMenu.RadioItem>
					</DropdownMenu.RadioGroup>
				</DropdownMenu.Content>
			</DropdownMenu>

			<DropdownMenu>
				<DropdownMenu.Trigger className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-muted-foreground text-xs transition-colors hover:bg-interactive-hover hover:text-foreground">
					<SortAscendingIcon size={14} weight="bold" />
					<span className="hidden sm:inline">{SORT_LABELS[sortBy]}</span>
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" className="w-36">
					<DropdownMenu.Group>
						<DropdownMenu.GroupLabel>Sort by</DropdownMenu.GroupLabel>
					</DropdownMenu.Group>
					<DropdownMenu.Separator />
					<DropdownMenu.RadioGroup
						onValueChange={(value) =>
							onSortByChangeAction(value as LinkSortOption)
						}
						value={sortBy}
					>
						<DropdownMenu.RadioItem value="newest">
							Newest first
						</DropdownMenu.RadioItem>
						<DropdownMenu.RadioItem value="oldest">
							Oldest first
						</DropdownMenu.RadioItem>
						<DropdownMenu.RadioItem value="name-asc">
							Name (A-Z)
						</DropdownMenu.RadioItem>
						<DropdownMenu.RadioItem value="name-desc">
							Name (Z-A)
						</DropdownMenu.RadioItem>
					</DropdownMenu.RadioGroup>
				</DropdownMenu.Content>
			</DropdownMenu>
		</div>
	);
}
