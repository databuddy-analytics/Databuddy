"use client";

import type { SortOption, TypeFilter } from "./use-filtered-links";
import {
	ArrowsDownUpIcon as SortAscendingIcon,
	FunnelIcon,
	MagnifyingGlassIcon,
	XMarkIcon as XIcon,
} from "@databuddy/ui/icons";
import { Input } from "@databuddy/ui";
import { DropdownMenu } from "@databuddy/ui/client";

const SORT_LABELS: Record<SortOption, string> = {
	newest: "Newest",
	oldest: "Oldest",
	"name-asc": "A \u2192 Z",
	"name-desc": "Z \u2192 A",
};

const TYPE_LABELS: Record<TypeFilter, string> = {
	all: "All",
	short: "Short Links",
	deep: "Deep Links",
};

interface LinksSearchBarProps {
	hasDeepLinks: boolean;
	onSearchQueryChangeAction: (query: string) => void;
	onSortByChangeAction: (sort: SortOption) => void;
	onTypeFilterChangeAction: (type: TypeFilter) => void;
	searchQuery: string;
	sortBy: SortOption;
	typeFilter: TypeFilter;
}

export function LinksSearchBar({
	searchQuery,
	onSearchQueryChangeAction,
	sortBy,
	onSortByChangeAction,
	typeFilter,
	onTypeFilterChangeAction,
	hasDeepLinks,
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

			{hasDeepLinks && (
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
								onTypeFilterChangeAction(value as TypeFilter)
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
			)}

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
						onValueChange={(value) => onSortByChangeAction(value as SortOption)}
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
