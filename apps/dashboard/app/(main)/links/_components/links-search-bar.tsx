"use client";

import {
	FunnelIcon,
	MagnifyingGlassIcon,
	SortAscendingIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import type { Link } from "@/hooks/use-links";

type SortOption = "newest" | "oldest" | "name-asc" | "name-desc";

interface LinksSearchBarProps {
	links: Link[];
	onFilteredLinksChange: (filteredLinks: Link[]) => void;
}

export function LinksSearchBar({
	links,
	onFilteredLinksChange,
}: LinksSearchBarProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [sortBy, setSortBy] = useState<SortOption>("newest");

	const [debouncedSearch] = useDebouncedValue(searchQuery, {
		wait: 200,
	});

	const filteredAndSortedLinks = useMemo(() => {
		let result = [...links];

		// Filter by search query
		if (debouncedSearch.trim()) {
			const query = debouncedSearch.toLowerCase();
			result = result.filter(
				(link) =>
					link.name.toLowerCase().includes(query) ||
					link.slug.toLowerCase().includes(query) ||
					link.targetUrl.toLowerCase().includes(query)
			);
		}

		// Sort
		switch (sortBy) {
			case "newest":
				result.sort(
					(a, b) =>
						new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
				);
				break;
			case "oldest":
				result.sort(
					(a, b) =>
						new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
				);
				break;
			case "name-asc":
				result.sort((a, b) => a.name.localeCompare(b.name));
				break;
			case "name-desc":
				result.sort((a, b) => b.name.localeCompare(a.name));
				break;
			default:
				break;
		}

		return result;
	}, [links, debouncedSearch, sortBy]);

	useEffect(() => {
		onFilteredLinksChange(filteredAndSortedLinks);
	}, [filteredAndSortedLinks, onFilteredLinksChange]);

	const handleClearSearch = useCallback(() => {
		setSearchQuery("");
	}, []);

	const getSortLabel = (option: SortOption): string => {
		switch (option) {
			case "newest":
				return "Newest first";
			case "oldest":
				return "Oldest first";
			case "name-asc":
				return "Name (A-Z)";
			case "name-desc":
				return "Name (Z-A)";
			default:
				return "Newest first";
		}
	};

	const hasActiveFilters = searchQuery.trim() !== "" || sortBy !== "newest";

	return (
		<div className="flex items-center gap-2 border-b px-4 py-3">
			<div className="relative flex-1">
				<MagnifyingGlassIcon
					className="absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground"
					weight="bold"
				/>
				<Input
					className="pr-8 pl-9"
					onChange={(e) => setSearchQuery(e.target.value)}
					placeholder="Search links…"
					showFocusIndicator={false}
					value={searchQuery}
				/>
				{searchQuery && (
					<button
						aria-label="Clear search"
						className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
						onClick={handleClearSearch}
						type="button"
					>
						<XIcon className="size-4" />
					</button>
				)}
			</div>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						className={sortBy !== "newest" ? "border-primary/50" : ""}
						size="sm"
						variant="outline"
					>
						<SortAscendingIcon size={16} weight="bold" />
						<span className="hidden sm:inline">{getSortLabel(sortBy)}</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-40">
					<DropdownMenuLabel>Sort by</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuRadioGroup
						onValueChange={(value) => setSortBy(value as SortOption)}
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
					onClick={() => {
						setSearchQuery("");
						setSortBy("newest");
					}}
					size="sm"
					variant="ghost"
				>
					<FunnelIcon size={16} weight="duotone" />
					Clear
				</Button>
			)}
		</div>
	);
}
