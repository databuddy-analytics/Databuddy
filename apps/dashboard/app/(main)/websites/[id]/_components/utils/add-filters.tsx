'use client';

import { Suspense, useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import { FunnelIcon } from '@phosphor-icons/react';
import { filterOptions, type DynamicQueryFilter } from '@databuddy/shared';
import { Button } from '@/components/ui/button';
import {
	Command,
	CommandInput,
	CommandItem,
	CommandList,
} from '@/components/ui/command';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { useAutocompleteData } from '@/hooks/use-funnels';
import { operatorOptions } from '@/hooks/use-filters';
import { Skeleton } from '@/components/ui/skeleton';

type OperatorOption = (typeof operatorOptions)[number];
type FilterOption = (typeof filterOptions)[number];

export function getOperatorShorthand(operator: OperatorOption['value']) {
	const operatorToShorthandMap: Record<
		OperatorOption['value'],
		DynamicQueryFilter['operator']
	> = {
		equals: 'eq',
		contains: 'like',
		not_equals: 'ne',
	};
	return operatorToShorthandMap[operator] || operator;
}

const MAX_SUGGESTIONS = 7;

function FilterEditorForm({
	filterOption,
	addFilter,
	setIsDropdownOpen,
	suggestions,
}: {
	addFilter: (filter: DynamicQueryFilter) => void;
	filterOption: FilterOption;
	setIsDropdownOpen: (isOpen: boolean) => void;
	suggestions: string[];
}) {
	const [operator, setOperator] = useState<OperatorOption>(operatorOptions[0]);
	const [value, setValue] = useState('');

	const [searchValue, setSearchValue] = useState('');
	const [isOpen, setIsOpen] = useState(false);
	const [filteredSuggestions, setFilteredSuggestions] = useState(
		suggestions.slice(0, MAX_SUGGESTIONS)
	);

	const handleInputChange = (newValue: string) => {
		setSearchValue(newValue);
		setValue(newValue);

		if (newValue.trim()) {
			const filtered = suggestions
				.filter((s) => s.toLowerCase().includes(newValue.toLowerCase()))
				.slice(0, MAX_SUGGESTIONS);
			setFilteredSuggestions(filtered);
			setIsOpen(filtered.length > 0);
		} else {
			setFilteredSuggestions(suggestions.slice(0, MAX_SUGGESTIONS));
		}
	};

	const handleSelect = (suggestion: string) => {
		setIsOpen(false);
		setValue(suggestion);
	};

	return (
		<div className="w-full space-y-2 p-2">
			<p>{filterOption.label}</p>
			<div className="flex w-full items-center gap-2">
				<Select
					onValueChange={(operatorValue) =>
						setOperator(
							operatorOptions.find(
								(o) => o.value === operatorValue
							) as OperatorOption
						)
					}
					value={operator.value}
				>
					<SelectTrigger className="w-32 rounded border-border/50">
						<SelectValue />
					</SelectTrigger>
					<SelectContent className="rounded">
						{operatorOptions.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Popover onOpenChange={setIsOpen} open={isOpen}>
					<PopoverTrigger asChild>
						<Button
							aria-expanded={isOpen}
							className="w-full flex-1 justify-between overflow-x-auto overflow-y-hidden bg-transparent px-3"
							role="combobox"
							variant="outline"
						>
							{value === '' ? 'Select a value' : value}
						</Button>
					</PopoverTrigger>
					<PopoverContent align="start" className="p-0">
						<Command shouldFilter={false}>
							<CommandInput
								className="w-full"
								onValueChange={handleInputChange}
								placeholder="Search for a value"
								value={searchValue}
							/>
							<CommandList>
								{filteredSuggestions.map((suggestion) => (
									<CommandItem
										className="w-full cursor-pointer border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent hover:text-accent-foreground"
										key={suggestion}
										onSelect={() => handleSelect(suggestion)}
										value={suggestion}
									>
										{suggestion}
									</CommandItem>
								))}
							</CommandList>
						</Command>
					</PopoverContent>
				</Popover>
			</div>
			<Button
				disabled={!value.trim()}
				onClick={() => {
					addFilter({
						field: filterOption.value,
						operator: getOperatorShorthand(operator.value),
						value,
					});
					setIsDropdownOpen(false);
				}}
				variant="default"
			>
				Add
			</Button>
		</div>
	);
}

function FilterSelectionForm({
	onFilterClick,
}: {
	onFilterClick: (filterOption: FilterOption) => void;
}) {
	return (
		<>
			<DropdownMenuLabel>Fields</DropdownMenuLabel>
			<DropdownMenuSeparator />
			{filterOptions.map((filter) => (
				<DropdownMenuItem
					key={filter.value}
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						onFilterClick(filter);
					}}
				>
					{filter.label}
				</DropdownMenuItem>
			))}
		</>
	);
}

function FilterForm({
	addFilter,
	setIsDropdownOpen,
}: {
	addFilter: (filter: DynamicQueryFilter) => void;
	setIsDropdownOpen: (isOpen: boolean) => void;
}) {
	const [filterBeingEdited, setFilterBeingEdited] =
		useState<FilterOption | null>(null);

	const { id } = useParams();
	const websiteId = id as string;

	// TODO: Refactor this to a "useSuggestions" hook
	const autocompleteQuery = useAutocompleteData(websiteId);
	const autocompleteData = autocompleteQuery.data;
	const getSuggestions = useCallback(
		(field: string): string[] => {
			if (!autocompleteData) {
				return [];
			}

			switch (field) {
				case 'browser_name':
					return autocompleteData.browsers || [];
				case 'os_name':
					return autocompleteData.operatingSystems || [];
				case 'country':
					return autocompleteData.countries || [];
				case 'device_type':
					return autocompleteData.deviceTypes || [];
				case 'utm_source':
					return autocompleteData.utmSources || [];
				case 'utm_medium':
					return autocompleteData.utmMediums || [];
				case 'utm_campaign':
					return autocompleteData.utmCampaigns || [];
				default:
					return [];
			}
		},
		[autocompleteData]
	);

	if (autocompleteQuery.isError) {
		return (
			<div className="p-4 text-destructive text-sm">
				Failed to load filter suggestions. Please try again.
			</div>
		);
	}

	if (autocompleteQuery.isLoading) {
		const numberOfFilters = filterOptions.length;
		return (
			<div className="flex flex-col gap-2">
				{Array.from({ length: Math.min(numberOfFilters, 5) }).map(
					(_, index) => (
						<Skeleton key={`filter-skeleton-${index}`} className="h-8 w-full" />
					)
				)}
			</div>
		);
	}

	if (filterBeingEdited) {
		return (
			<FilterEditorForm
				addFilter={addFilter}
				filterOption={filterBeingEdited}
				setIsDropdownOpen={setIsDropdownOpen}
				suggestions={getSuggestions(filterBeingEdited.value)}
			/>
		);
	}

	return (
		<FilterSelectionForm
			onFilterClick={(filterOption: FilterOption) =>
				setFilterBeingEdited(filterOption)
			}
		/>
	);
}

export function AddFilterForm({
	addFilter,
	buttonText = 'Filter',
}: {
	addFilter: (filter: DynamicQueryFilter) => void;
	buttonText?: string;
}) {
	const [isOpen, setIsOpen] = useState(false);
	return (
		<DropdownMenu onOpenChange={setIsOpen} open={isOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					aria-expanded={isOpen}
					aria-haspopup="menu"
					aria-label="Add filter"
					className="h-8"
					onClick={() => setIsOpen(!isOpen)}
					variant="outline"
				>
					<FunnelIcon aria-hidden="true" weight="duotone" />
					{buttonText}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-[300px]" side="bottom">
				<Suspense fallback={<div>Loading...</div>}>
					<FilterForm addFilter={addFilter} setIsDropdownOpen={setIsOpen} />
				</Suspense>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
