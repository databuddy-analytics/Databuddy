"use client";

import type { SortOption } from "./use-filtered-monitors";
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
	"name-asc": "A → Z",
	"name-desc": "Z → A",
};

interface ListSearchBarProps<TStatus extends string> {
	onSearchQueryChangeAction: (query: string) => void;
	onSortByChangeAction: (sort: SortOption) => void;
	onStatusFilterChangeAction: (status: TStatus) => void;
	placeholder: string;
	searchQuery: string;
	showStatusFilter: boolean;
	sortBy: SortOption;
	statusFilter: TStatus;
	statusLabels: Record<TStatus, string>;
}

export function ListSearchBar<TStatus extends string>({
	searchQuery,
	onSearchQueryChangeAction,
	placeholder,
	sortBy,
	onSortByChangeAction,
	statusFilter,
	statusLabels,
	onStatusFilterChangeAction,
	showStatusFilter,
}: ListSearchBarProps<TStatus>) {
	return (
		<div className="flex w-full items-center gap-1.5">
			<div className="relative flex-1">
				<MagnifyingGlassIcon className="absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
				<Input
					className="h-7 pr-7 pl-8"
					onChange={(e) => onSearchQueryChangeAction(e.target.value)}
					placeholder={placeholder}
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

			{showStatusFilter && (
				<DropdownMenu>
					<DropdownMenu.Trigger
						className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs transition-colors hover:bg-interactive-hover hover:text-foreground ${statusFilter === "all" ? "text-muted-foreground" : "text-foreground"}`}
					>
						<FunnelIcon size={14} />
						<span className="hidden sm:inline">
							{statusLabels[statusFilter]}
						</span>
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" className="w-36">
						<DropdownMenu.Group>
							<DropdownMenu.GroupLabel>Status</DropdownMenu.GroupLabel>
						</DropdownMenu.Group>
						<DropdownMenu.Separator />
						<DropdownMenu.RadioGroup
							onValueChange={onStatusFilterChangeAction}
							value={statusFilter}
						>
							{(Object.entries(statusLabels) as [TStatus, string][]).map(
								([value, label]) => (
									<DropdownMenu.RadioItem key={value} value={value}>
										{label}
									</DropdownMenu.RadioItem>
								)
							)}
						</DropdownMenu.RadioGroup>
					</DropdownMenu.Content>
				</DropdownMenu>
			)}

			<DropdownMenu>
				<DropdownMenu.Trigger className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-muted-foreground text-xs transition-colors hover:bg-interactive-hover hover:text-foreground">
					<SortAscendingIcon size={14} />
					<span className="hidden sm:inline">{SORT_LABELS[sortBy]}</span>
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" className="w-36">
					<DropdownMenu.Group>
						<DropdownMenu.GroupLabel>Sort by</DropdownMenu.GroupLabel>
					</DropdownMenu.Group>
					<DropdownMenu.Separator />
					<DropdownMenu.RadioGroup
						onValueChange={onSortByChangeAction}
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
