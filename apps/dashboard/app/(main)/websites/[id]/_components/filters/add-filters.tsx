"use client";

import { filterOptions } from "@/lib/filter-options";
import type { DynamicQueryFilter } from "@/types/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import {
	type AutocompleteData,
	useAutocompleteData,
} from "@/hooks/use-autocomplete";
import { operatorOptions } from "@/hooks/use-filters";
import { cn } from "@/lib/utils";
import { ArrowLeftIcon, FunnelIcon } from "@databuddy/ui/icons";
import { Dialog, DropdownMenu, SearchList } from "@databuddy/ui/client";
import { Button, Field, Input, Skeleton } from "@databuddy/ui";

function getOperatorDisplay(value: string): string {
	const option = operatorOptions.find((o) => o.value === value);
	return option?.label ?? value;
}

type FilterOption = (typeof filterOptions)[number];

const filterFormSchema = z.object({
	field: z.string().min(1, "Please select a field"),
	operator: z.enum(["eq", "ne", "contains", "not_contains", "starts_with"]),
	value: z.string().min(1, "Value is required"),
});

type FilterFormData = z.infer<typeof filterFormSchema>;

const MAX_SUGGESTIONS = 8;

function getSuggestions(
	field: string,
	autocompleteData: AutocompleteData | undefined
): string[] {
	if (!autocompleteData) {
		return [];
	}

	const suggestionMap: Record<string, string[] | undefined> = {
		browser_name: autocompleteData.browsers,
		os_name: autocompleteData.operatingSystems,
		country: autocompleteData.countries,
		device_type: autocompleteData.deviceTypes,
		utm_source: autocompleteData.utmSources,
		utm_medium: autocompleteData.utmMediums,
		utm_campaign: autocompleteData.utmCampaigns,
		path: autocompleteData.pagePaths,
	};

	return suggestionMap[field] ?? [];
}

function ValueSuggestions({
	suggestions,
	searchValue,
	onSelect,
	selectedValue,
}: {
	onSelect: (value: string) => void;
	searchValue: string;
	selectedValue: string;
	suggestions: string[];
}) {
	const filteredSuggestions = searchValue.trim()
		? suggestions
				.filter((s) => s.toLowerCase().includes(searchValue.toLowerCase()))
				.slice(0, MAX_SUGGESTIONS)
		: suggestions.slice(0, MAX_SUGGESTIONS);

	if (suggestions.length === 0) {
		return null;
	}

	return (
		<div className="space-y-1.5">
			<p className="text-[11px] text-muted-foreground">Suggestions</p>
			<div className="flex flex-wrap gap-1">
				{filteredSuggestions.length === 0 ? (
					<p className="py-1 text-muted-foreground text-xs">No matches</p>
				) : (
					filteredSuggestions.map((suggestion) => (
						<button
							className={cn(
								"cursor-pointer rounded-md px-2 py-1 text-xs transition-colors",
								selectedValue === suggestion
									? "bg-primary/10 text-primary"
									: "bg-secondary text-foreground hover:bg-interactive-hover"
							)}
							key={suggestion}
							onClick={() => onSelect(suggestion)}
							type="button"
						>
							{suggestion}
						</button>
					))
				)}
			</div>
		</div>
	);
}

type FilterDialogStep = "select-field" | "configure-value";

function FilterDialogContent({
	addFilter,
	onClose,
	autocompleteData,
	isLoading,
	isError,
}: {
	addFilter: (filter: DynamicQueryFilter) => void;
	autocompleteData: AutocompleteData | undefined;
	isError: boolean;
	isLoading: boolean;
	onClose: () => void;
}) {
	const [step, setStep] = useState<FilterDialogStep>("select-field");
	const [selectedFilterOption, setSelectedFilterOption] =
		useState<FilterOption | null>(null);

	const form = useForm<FilterFormData>({
		resolver: zodResolver(filterFormSchema),
		defaultValues: {
			field: "",
			operator: "eq",
			value: "",
		},
	});

	const watchedValue = form.watch("value");
	const watchedField = form.watch("field");

	const handleFieldSelect = (filter: FilterOption) => {
		setSelectedFilterOption(filter);
		form.setValue("field", filter.value, { shouldValidate: true });
		setStep("configure-value");
	};

	const handleBack = () => {
		setStep("select-field");
		setSelectedFilterOption(null);
		form.reset();
	};

	const onSubmit = (data: FilterFormData) => {
		addFilter({
			field: data.field,
			operator: data.operator,
			value: data.value.trim(),
		});
		onClose();
	};

	const suggestions = getSuggestions(watchedField, autocompleteData);

	if (isError) {
		return (
			<div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
				<p className="font-medium text-foreground text-sm">
					Failed to load filters
				</p>
				<p className="text-muted-foreground text-xs">Please try again later</p>
				<Button
					className="mt-2"
					onClick={onClose}
					size="sm"
					variant="secondary"
				>
					Close
				</Button>
			</div>
		);
	}

	if (step === "select-field") {
		return isLoading ? (
			<div className="space-y-1 p-3">
				{Array.from({ length: 6 }, (_, i) => (
					<Skeleton
						className="h-8 w-full rounded-md"
						key={`s-${i.toString()}`}
					/>
				))}
			</div>
		) : (
			<SearchList>
				<SearchList.Input autoFocus placeholder="Search fields…" />
				<SearchList.List>
					<SearchList.Empty>No field found.</SearchList.Empty>
					{filterOptions.map((filter) => (
						<SearchList.Item
							key={filter.value}
							onSelect={() => handleFieldSelect(filter)}
							value={filter.label}
						>
							{filter.label}
						</SearchList.Item>
					))}
				</SearchList.List>
			</SearchList>
		);
	}

	return (
		<div className="space-y-4 p-4">
			<div className="flex items-center gap-2">
				<button
					className="flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground"
					onClick={handleBack}
					type="button"
				>
					<ArrowLeftIcon className="size-3.5" />
				</button>
				<p className="font-medium text-foreground text-sm">
					{selectedFilterOption?.label}
				</p>
			</div>

			<form className="space-y-3" onSubmit={form.handleSubmit(onSubmit)}>
				<Controller
					control={form.control}
					name="value"
					render={({ field, fieldState }) => (
						<Field error={!!fieldState.error}>
							<div className="flex">
								<Controller
									control={form.control}
									name="operator"
									render={({ field: operatorField }) => (
										<DropdownMenu>
											<DropdownMenu.Trigger className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-r-none rounded-l-md border-border/60 border-r bg-secondary px-2.5 font-medium text-foreground text-xs transition-colors hover:bg-interactive-hover">
												{getOperatorDisplay(operatorField.value)}
											</DropdownMenu.Trigger>
											<DropdownMenu.Content align="start" side="bottom">
												<DropdownMenu.RadioGroup
													onValueChange={(v) => operatorField.onChange(v)}
													value={operatorField.value}
												>
													{operatorOptions.map((option) => (
														<DropdownMenu.RadioItem
															key={option.value}
															value={option.value}
														>
															{option.label}
														</DropdownMenu.RadioItem>
													))}
												</DropdownMenu.RadioGroup>
											</DropdownMenu.Content>
										</DropdownMenu>
									)}
								/>
								<Input
									autoFocus
									className="rounded-l-none"
									placeholder={`Enter ${selectedFilterOption?.label.toLowerCase()}…`}
									{...field}
								/>
							</div>
							{fieldState.error && (
								<Field.Error>{fieldState.error.message}</Field.Error>
							)}
						</Field>
					)}
				/>

				<ValueSuggestions
					onSelect={(value) =>
						form.setValue("value", value, { shouldValidate: true })
					}
					searchValue={watchedValue}
					selectedValue={watchedValue}
					suggestions={suggestions}
				/>

				<div className="flex justify-end gap-2 pt-1">
					<Button onClick={onClose} size="sm" type="button" variant="ghost">
						Cancel
					</Button>
					<Button disabled={!form.formState.isValid} size="sm" type="submit">
						Add filter
					</Button>
				</div>
			</form>
		</div>
	);
}

export function AddFilterForm({
	addFilter,
	buttonText = "Filter",
	className,
	disabled = false,
}: {
	addFilter: (filter: DynamicQueryFilter) => void;
	buttonText?: string;
	className?: string;
	disabled?: boolean;
}) {
	const [isOpen, setIsOpen] = useState(false);

	const { id } = useParams();
	const websiteId = id as string;

	const autocompleteQuery = useAutocompleteData(websiteId);

	const handleClose = useCallback(() => {
		setIsOpen(false);
	}, []);

	return (
		<>
			<Button
				aria-label="Add filter"
				className={cn("h-8 text-xs", className)}
				disabled={disabled}
				onClick={() => setIsOpen(true)}
				variant="secondary"
			>
				<FunnelIcon className="size-3.5" weight="duotone" />
				{buttonText}
			</Button>

			<Dialog onOpenChange={setIsOpen} open={isOpen}>
				<Dialog.Content className="max-w-sm overflow-hidden p-0">
					<Dialog.Header className="sr-only">
						<Dialog.Title>Add Filter</Dialog.Title>
						<Dialog.Description>
							Choose a field and configure the filter
						</Dialog.Description>
					</Dialog.Header>
					<FilterDialogContent
						addFilter={addFilter}
						autocompleteData={autocompleteQuery.data}
						isError={autocompleteQuery.isError}
						isLoading={autocompleteQuery.isLoading}
						onClose={handleClose}
					/>
				</Dialog.Content>
			</Dialog>
		</>
	);
}
