"use client";

import { SortAscendingIcon } from "@phosphor-icons/react";
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
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { useCallback } from "react";

type SortOption = "newest" | "oldest" | "name-asc" | "name-desc";

interface LinksFiltersProps {
	sortBy: SortOption;
	searchQuery: string;
	onSortChange: (sort: SortOption) => void;
	onSearchChange: (query: string) => void;
}

export function LinksFilters({
	sortBy,
	searchQuery,
	onSortChange,
	onSearchChange,
}: LinksFiltersProps) {
	const handleClearSearch = useCallback(() => {
		onSearchChange("");
	}, [onSearchChange]);

	const getSortLabel = (option: SortOption): string => {
		switch (option) {
			case "newest":
				return "Newest First";
			case "oldest":
				return "Oldest First";
			case "name-asc":
				return "Name (A-Z)";
			case "name-desc":
				return "Name (Z-A)";
		}
	};

	return (
		<div className="flex items-center gap-3 border-b px-4 py-5.5">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button size="sm" variant="outline">
						<SortAscendingIcon size={16} weight="duotone" />
						{getSortLabel(sortBy)}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-40">
					<DropdownMenuLabel>Sort by</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuRadioGroup
						onValueChange={(value) => onSortChange(value as SortOption)}
						value={sortBy}
					>
						<DropdownMenuRadioItem value="newest">
							Newest First
						</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value="oldest">
							Oldest First
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

			<div className="relative flex-1">
				<MagnifyingGlassIcon
					className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground"
					weight="duotone"
				/>
				<Input
					className="pr-8 pl-9"
					onChange={(e) => onSearchChange(e.target.value)}
					placeholder="Search links"
					showFocusIndicator={false}
					value={searchQuery}
				/>
				{searchQuery && (
					<button
						aria-label="Clear search"
						className="absolute top-1/2 right-3 z-10 -translate-y-1/2 text-muted-foreground hover:text-foreground"
						onClick={handleClearSearch}
						type="button"
					>
						<XIcon className="size-4" />
					</button>
				)}
			</div>
		</div>
	);
}
