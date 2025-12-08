"use client";

import { filterOptions } from "@databuddy/shared/lists/filters";
import type { DynamicQueryFilter } from "@databuddy/shared/types/api";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	ArrowLeftIcon,
	FunnelIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { operatorOptions } from "@/hooks/use-filters";
import {
	type AutocompleteData,
	useAutocompleteData,
} from "@/hooks/use-funnels";
import { cn } from "@/lib/utils";

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
	if (!autocompleteData) return [];

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
	suggestions: string[];
	searchValue: string;
	onSelect: (value: string) => void;
	selectedValue: string;
}) {
	const filteredSuggestions = searchValue.trim()
		? suggestions
				.filter((s) => s.toLowerCase().includes(searchValue.toLowerCase()))
				.slice(0, MAX_SUGGESTIONS)
		: suggestions.slice(0, MAX_SUGGESTIONS);

	if (suggestions.length === 0) return null;

	return (
		<div className="space-y-2">
			<p className="text-muted-foreground text-xs">Suggestions</p>
			<div className="flex flex-wrap gap-1.5">
				{filteredSuggestions.length === 0 ? (
					<p className="py-2 text-muted-foreground text-xs">No matches found</p>
				) : (
					filteredSuggestions.map((suggestion) => (
						<button
							className={cn(
								"cursor-pointer rounded border px-2 py-1 text-xs hover:bg-accent",
								selectedValue === suggestion
									? "border-primary bg-primary/10 text-primary"
									: "border-border"
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
	onClose: () => void;
	autocompleteData: AutocompleteData | undefined;
	isLoading: boolean;
	isError: boolean;
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
			<>
				<div className="mb-3 flex items-center gap-3">
					<div className="rounded-full border bg-destructive/10 p-2.5">
						<WarningCircleIcon
							className="size-4 text-destructive"
							weight="duotone"
						/>
					</div>
					<div>
						<DialogTitle className="font-medium text-base">
							Add Filter
						</DialogTitle>
						<DialogDescription className="text-muted-foreground text-xs">
							Failed to load filter suggestions
						</DialogDescription>
					</div>
				</div>
				<div className="py-4 text-center">
					<p className="text-muted-foreground text-sm">
						Please try again later
					</p>
				</div>
				<DialogFooter>
					<Button className="flex-1" onClick={onClose} variant="secondary">
						Close
					</Button>
				</DialogFooter>
			</>
		);
	}

	if (step === "select-field") {
		return (
			<>
				<div className="mb-3 flex items-center gap-3">
					<div className="rounded-full border bg-secondary p-2.5">
						<FunnelIcon
							className="size-4 text-accent-foreground"
							weight="duotone"
						/>
					</div>
					<div>
						<DialogTitle className="font-medium text-base">
							Add Filter
						</DialogTitle>
						<DialogDescription className="text-muted-foreground text-xs">
							Choose a field to filter your data
						</DialogDescription>
					</div>
				</div>

				{isLoading ? (
					<div className="space-y-2 py-2">
						{Array.from({ length: 5 }, (_, i) => (
							<Skeleton
								className="h-9 w-full"
								key={`skeleton-${i.toString()}`}
							/>
						))}
					</div>
				) : (
					<Command className="rounded border">
						<CommandInput placeholder="Search fields…" />
						<CommandList className="max-h-[240px]">
							<CommandEmpty>No field found.</CommandEmpty>
							<CommandGroup>
								{filterOptions.map((filter) => (
									<CommandItem
										key={filter.value}
										onSelect={() => handleFieldSelect(filter)}
										value={filter.label}
									>
										{filter.label}
									</CommandItem>
								))}
							</CommandGroup>
						</CommandList>
					</Command>
				)}

				<DialogFooter>
					<Button className="flex-1" onClick={onClose} variant="secondary">
						Cancel
					</Button>
				</DialogFooter>
			</>
		);
	}

	return (
		<>
			<div className="mb-3 flex items-center gap-3">
				<div className="rounded-full border bg-secondary p-2.5">
					<FunnelIcon
						className="size-4 text-accent-foreground"
						weight="duotone"
					/>
				</div>
				<div>
					<DialogTitle className="font-medium text-base">
						{selectedFilterOption?.label}
					</DialogTitle>
					<DialogDescription className="text-muted-foreground text-xs">
						Set the condition and value for this filter
					</DialogDescription>
				</div>
			</div>

			<button
				className="mb-3 flex cursor-pointer items-center gap-1.5 text-muted-foreground text-xs hover:text-foreground"
				onClick={handleBack}
				type="button"
			>
				<ArrowLeftIcon className="size-3" weight="fill" />
				Back to fields
			</button>

			<Form {...form}>
				<form className="space-y-3" onSubmit={form.handleSubmit(onSubmit)}>
					<FormField
						control={form.control}
						name="value"
						render={({ field }) => (
							<FormItem>
								<FormLabel className="text-xs">Value</FormLabel>
								<FormControl>
									<div className="flex">
										<FormField
											control={form.control}
											name="operator"
											render={({ field: operatorField }) => (
												<Select
													defaultValue={operatorField.value}
													onValueChange={operatorField.onChange}
												>
													<SelectTrigger className="h-9 w-auto gap-1 rounded-r-none border-r-0 bg-secondary px-2.5 font-medium text-xs">
														<SelectValue />
													</SelectTrigger>
													<SelectContent align="start">
														{operatorOptions.map((option) => (
															<SelectItem
																key={option.value}
																value={option.value}
															>
																{option.label}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											)}
										/>
										<Input
											autoFocus
											className="rounded-l-none text-sm"
											placeholder={`Enter ${selectedFilterOption?.label.toLowerCase()}…`}
											{...field}
										/>
									</div>
								</FormControl>
								<FormMessage className="text-xs" />
							</FormItem>
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

					<DialogFooter className="pt-2">
						<Button
							className="flex-1"
							onClick={onClose}
							type="button"
							variant="secondary"
						>
							Cancel
						</Button>
						<Button
							className="flex-1"
							disabled={!form.formState.isValid}
							type="submit"
						>
							Add filter
						</Button>
					</DialogFooter>
				</form>
			</Form>
		</>
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
				<DialogContent className="max-w-md p-4">
					<FilterDialogContent
						addFilter={addFilter}
						autocompleteData={autocompleteQuery.data}
						isError={autocompleteQuery.isError}
						isLoading={autocompleteQuery.isLoading}
						onClose={handleClose}
					/>
				</DialogContent>
			</Dialog>
		</>
	);
}
