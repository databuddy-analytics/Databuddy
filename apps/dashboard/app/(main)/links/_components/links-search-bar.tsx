"use client";

import {
	FunnelIcon,
	MagnifyingGlassIcon,
	SortAscendingIcon,
	XIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SortOption } from "./use-filtered-links";

const SORT_LABELS: Record<SortOption, string> = {
	newest: "Newest",
	oldest: "Oldest",
	"name-asc": "A → Z",
	"name-desc": "Z → A",
};

interface LinksSearchBarProps {
	searchQuery: string;
	onSearchQueryChangeAction: (query: string) => void;
	sortBy: SortOption;
	onSortByChangeAction: (sort: SortOption) => void;
}

export function LinksSearchBar({
	searchQuery,
	onSearchQueryChangeAction,
	sortBy,
	onSortByChangeAction,
}: LinksSearchBarProps) {
	const hasActiveFilters = searchQuery.trim() !== "" || sortBy !== "newest";

	return (
		<div className="flex w-full items-center gap-1.5">
			<div className="relative flex-1">
				<MagnifyingGlassIcon
					className="absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2 text-muted-foreground"
					weight="bold"
				/>
				<Input
					className="h-7 border-transparent bg-transparent pr-7 pl-8 text-sm shadow-none placeholder:text-muted-foreground/50 focus-visible:border-border focus-visible:bg-background"
					onChange={(e) => onSearchQueryChangeAction(e.target.value)}
					placeholder="Search links…"
					showFocusIndicator={false}
					value={searchQuery}
				/>
				{searchQuery && (
					<button
						aria-label="Clear search"
						className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
						onClick={() => onSearchQueryChangeAction("")}
						type="button"
					>
						<XIcon className="size-3.5" />
					</button>
				)}
			</div>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						className={cn(
							"h-7 gap-1 border-transparent px-2 text-xs shadow-none",
							sortBy !== "newest" && "border-primary/30 text-primary"
						)}
						size="sm"
						variant="outline"
					>
						<SortAscendingIcon size={14} weight="bold" />
						<span className="hidden sm:inline">{SORT_LABELS[sortBy]}</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-36">
					<DropdownMenuLabel>Sort by</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuRadioGroup
						onValueChange={(value) => onSortByChangeAction(value as SortOption)}
						value={sortBy}
					>
						<DropdownMenuRadioItem value="newest">
							Newest first
						</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value="oldest">
							Oldest first
						</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value="name-asc">
							Name (A-Z)
						</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value="name-desc">
							Name (Z-A)
						</DropdownMenuRadioItem>
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			{hasActiveFilters && (
				<Button
					className="h-7 gap-1 px-2 text-xs"
					onClick={() => {
						onSearchQueryChangeAction("");
						onSortByChangeAction("newest");
					}}
					size="sm"
					variant="ghost"
				>
					<FunnelIcon size={14} weight="duotone" />
					Clear
				</Button>
			)}
		</div>
	);
}
