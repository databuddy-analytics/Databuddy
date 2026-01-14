"use client";

import { filterOptions } from "@databuddy/shared/lists/filters";
import type { DateRange } from "@databuddy/shared/types/analytics";
import type { CustomQueryConfig } from "@databuddy/shared/types/custom-query";
import type { QueryOutputField } from "@databuddy/shared/types/query";
import {
	CalendarDotsIcon,
	CaretDownIcon,
	ChartBarIcon,
	ChartLineUpIcon,
	CheckIcon,
	CodeIcon,
	FunnelIcon,
	GaugeIcon,
	PencilSimpleIcon,
	PlusIcon,
	SpinnerGapIcon,
	SquaresFourIcon,
	TextTIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { StatCardDisplayMode } from "@/components/analytics/stat-card";
import { StatCard } from "@/components/analytics/stat-card";
import { AutocompleteInput } from "@/components/ui/autocomplete-input";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetBody,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { operatorOptions } from "@/hooks/use-filters";
import { useAutocompleteData } from "@/hooks/use-funnels";
import { cn } from "@/lib/utils";
import { CustomQueryBuilder } from "./custom-query-builder";
import { useDashboardData } from "./hooks/use-dashboard-data";
import type { QueryTypeOption } from "./hooks/use-query-types";
import { useQueryTypes } from "./hooks/use-query-types";
import { getCategoryIcon } from "./utils/category-utils";
import {
	DATE_RANGE_PRESETS,
	getPresetLabel,
	resolveDateRange,
} from "./utils/date-presets";
import type {
	CardFilter,
	DashboardCardConfig,
	DataSourceMode,
	DateRangePreset,
} from "./utils/types";

// Re-export for convenience
export type { DashboardCardConfig } from "./utils/types";

/** Visualization types compatible with stat cards */
const CARD_COMPATIBLE_VISUALIZATIONS = new Set([
	"metric",
	"timeseries",
	"area",
	"line",
]);

interface CardSheetProps {
	isOpen: boolean;
	onCloseAction: () => void;
	onSaveAction: (card: DashboardCardConfig) => void;
	onDeleteAction?: (cardId: string) => void;
	websiteId: string;
	dateRange: DateRange;
	editingCard?: DashboardCardConfig | null;
}

function mapVisualizationToDisplayMode(
	viz: QueryTypeOption["defaultVisualization"]
): StatCardDisplayMode {
	switch (viz) {
		case "timeseries":
		case "area":
		case "line":
			return "chart";
		default:
			return "text";
	}
}

function isMetricType(viz: QueryTypeOption["defaultVisualization"]): boolean {
	return viz === "metric";
}

function isTrendType(viz: QueryTypeOption["defaultVisualization"]): boolean {
	return viz === "timeseries" || viz === "area" || viz === "line";
}

export function CardSheet({
	isOpen,
	onCloseAction,
	onSaveAction,
	onDeleteAction,
	websiteId,
	dateRange,
	editingCard,
}: CardSheetProps) {
	const { queryTypes, isLoading: isLoadingTypes } = useQueryTypes();
	const autocompleteQuery = useAutocompleteData(websiteId, isOpen);
	const isEditMode = !!editingCard;

	const [dataSourceMode, setDataSourceMode] =
		useState<DataSourceMode>("predefined");
	const [selectedQueryType, setSelectedQueryType] =
		useState<QueryTypeOption | null>(null);
	const [selectedField, setSelectedField] = useState<QueryOutputField | null>(
		null
	);
	const [customQuery, setCustomQuery] = useState<CustomQueryConfig | null>(
		null
	);
	const [displayMode, setDisplayMode] = useState<StatCardDisplayMode>("text");
	const [customTitle, setCustomTitle] = useState("");
	const [dateRangePreset, setDateRangePreset] =
		useState<DateRangePreset>("global");
	const [filters, setFilters] = useState<CardFilter[]>([]);
	const [isQueryTypeOpen, setIsQueryTypeOpen] = useState(false);
	const [isFieldOpen, setIsFieldOpen] = useState(false);
	const [isDateRangeOpen, setIsDateRangeOpen] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

	// Check if form is valid for saving
	const canSave =
		dataSourceMode === "predefined"
			? Boolean(selectedQueryType && selectedField)
			: Boolean(customQuery?.table);

	// Filter and group query types for cards
	const { metricTypes, trendTypes } = useMemo(() => {
		const compatible = queryTypes.filter((t) =>
			CARD_COMPATIBLE_VISUALIZATIONS.has(t.defaultVisualization || "")
		);

		return {
			metricTypes: compatible.filter((t) =>
				isMetricType(t.defaultVisualization)
			),
			trendTypes: compatible.filter((t) => isTrendType(t.defaultVisualization)),
		};
	}, [queryTypes]);

	// Compute the preview date range based on preset
	const previewDateRange = useMemo(
		() => resolveDateRange(dateRangePreset, dateRange),
		[dateRangePreset, dateRange]
	);

	// Create a temporary widget config for preview data fetching
	const previewWidgets = useMemo(
		() =>
			selectedQueryType
				? [
						{
							id: "preview",
							queryType: selectedQueryType.key,
							type: "card" as const,
							field: selectedField?.name || "",
							label: selectedField?.label || "",
							displayMode,
							filters,
						},
					]
				: [],
		[selectedQueryType, selectedField, displayMode, filters]
	);

	const {
		getValue,
		getChartData,
		isLoading: isPreviewLoading,
	} = useDashboardData(websiteId, previewDateRange, previewWidgets, {
		enabled: isOpen && !!selectedQueryType,
	});

	const resetForm = () => {
		setDataSourceMode("predefined");
		setSelectedQueryType(null);
		setSelectedField(null);
		setCustomQuery(null);
		setDisplayMode("text");
		setCustomTitle("");
		setDateRangePreset("global");
		setFilters([]);
		setShowDeleteConfirm(false);
	};

	const initializeFromCard = (card: DashboardCardConfig) => {
		// Set data source mode
		const mode = card.dataSourceMode || "predefined";
		setDataSourceMode(mode);

		if (mode === "custom" && card.customQuery) {
			setCustomQuery(card.customQuery);
			setSelectedQueryType(null);
			setSelectedField(null);
		} else {
			const queryType = queryTypes.find((t) => t.key === card.queryType);
			if (queryType) {
				setSelectedQueryType(queryType);
				const field = queryType.outputFields.find((f) => f.name === card.field);
				if (field) {
					setSelectedField(field);
				}
			}
			setCustomQuery(null);
		}

		setDisplayMode(card.displayMode);
		setCustomTitle(card.title || "");
		setDateRangePreset(card.dateRangePreset || "global");
		setFilters(card.filters || []);
	};

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			onCloseAction();
		}
	};

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		if (editingCard && queryTypes.length > 0) {
			initializeFromCard(editingCard);
		} else if (!editingCard) {
			resetForm();
		}
	}, [isOpen, editingCard, queryTypes]);

	const handleQueryTypeSelect = (queryType: QueryTypeOption) => {
		setSelectedQueryType(queryType);
		setSelectedField(null);
		setDisplayMode(
			mapVisualizationToDisplayMode(queryType.defaultVisualization)
		);
		setIsQueryTypeOpen(false);
	};

	const handleFieldSelect = (field: QueryOutputField) => {
		setSelectedField(field);
		setIsFieldOpen(false);
	};

	const handleSubmit = () => {
		if (dataSourceMode === "predefined") {
			if (!(selectedQueryType && selectedField)) {
				return;
			}

			setIsSubmitting(true);

			const card: DashboardCardConfig = {
				id: editingCard?.id || `card-${Date.now()}`,
				type: "card",
				queryType: selectedQueryType.key,
				field: selectedField.name,
				label: selectedField.label || selectedField.name,
				displayMode,
				title: customTitle.trim() || undefined,
				category: selectedQueryType.category,
				dateRangePreset:
					dateRangePreset !== "global" ? dateRangePreset : undefined,
				filters: filters.length > 0 ? filters : undefined,
				dataSourceMode: "predefined",
			};

			onSaveAction(card);
		} else {
			if (!customQuery || customQuery.selects.length === 0) {
				return;
			}

			setIsSubmitting(true);

			// Get the first select's alias as the label
			const firstSelect = customQuery.selects.at(0);
			const label =
				firstSelect?.alias || `${firstSelect?.aggregate}_${firstSelect?.field}`;

			const card: DashboardCardConfig = {
				id: editingCard?.id || `card-${Date.now()}`,
				type: "card",
				queryType: `custom_${customQuery.table}`,
				field: firstSelect?.field || "",
				label,
				displayMode: "text", // Custom queries only support text for now
				title: customTitle.trim() || undefined,
				category: "Custom",
				dateRangePreset:
					dateRangePreset !== "global" ? dateRangePreset : undefined,
				dataSourceMode: "custom",
				customQuery,
			};

			onSaveAction(card);
		}

		setIsSubmitting(false);
		onCloseAction();
	};

	const handleAddFilter = () => {
		setFilters((prev) => [
			...prev,
			{ field: "browser_name", operator: "eq", value: "" },
		]);
	};

	const handleRemoveFilter = (index: number) => {
		setFilters((prev) => prev.filter((_, i) => i !== index));
	};

	const handleUpdateFilter = (
		index: number,
		key: keyof CardFilter,
		value: string
	) => {
		setFilters((prev) =>
			prev.map((f, i) => (i === index ? { ...f, [key]: value } : f))
		);
	};

	const getSuggestions = useCallback(
		(field: string): string[] => {
			const data = autocompleteQuery.data;
			if (!data) {
				return [];
			}

			switch (field) {
				case "browser_name":
					return data.browsers || [];
				case "os_name":
					return data.operatingSystems || [];
				case "country":
					return data.countries || [];
				case "device_type":
					return data.deviceTypes || [];
				case "path":
					return data.pagePaths || [];
				case "utm_source":
					return data.utmSources || [];
				case "utm_medium":
					return data.utmMediums || [];
				case "utm_campaign":
					return data.utmCampaigns || [];
				default:
					return [];
			}
		},
		[autocompleteQuery.data]
	);

	const handleDelete = () => {
		if (editingCard && onDeleteAction) {
			onDeleteAction(editingCard.id);
			onCloseAction();
		}
	};

	const previewTitle =
		customTitle || selectedField?.label || selectedField?.name || "Value";
	const previewIcon = selectedQueryType
		? getCategoryIcon(selectedQueryType.category)
		: undefined;
	const previewValue =
		selectedQueryType && selectedField
			? getValue("preview", selectedQueryType.key, selectedField.name)
			: "—";
	const previewChartData =
		displayMode === "chart" && selectedQueryType && selectedField
			? getChartData("preview", selectedQueryType.key, selectedField.name)
			: undefined;

	// Check if chart mode is supported for selected query type
	const supportsChart =
		selectedQueryType && isTrendType(selectedQueryType.defaultVisualization);

	return (
		<Sheet onOpenChange={handleOpenChange} open={isOpen}>
			<SheetContent className="sm:max-w-md" side="right">
				<SheetHeader>
					<div className="flex items-center gap-4">
						<div className="flex size-11 items-center justify-center rounded border bg-secondary">
							{isEditMode ? (
								<PencilSimpleIcon
									className="size-5 text-primary"
									weight="duotone"
								/>
							) : (
								<SquaresFourIcon
									className="size-5 text-primary"
									weight="duotone"
								/>
							)}
						</div>
						<div>
							<SheetTitle className="text-lg">
								{isEditMode ? "Edit Card" : "Add Card"}
							</SheetTitle>
							<SheetDescription>
								{isEditMode
									? "Modify your stat card configuration"
									: "Create a new stat card from your analytics data"}
							</SheetDescription>
						</div>
					</div>
				</SheetHeader>

				<SheetBody className="space-y-6">
					{/* Live Preview */}
					<div className="space-y-2">
						<Label className="text-muted-foreground">Preview</Label>
						<StatCard
							chartData={previewChartData}
							chartType="area"
							description={selectedQueryType?.title}
							displayMode={displayMode}
							icon={previewIcon}
							id="preview"
							isLoading={!selectedQueryType || isPreviewLoading}
							title={previewTitle}
							value={previewValue}
						/>
					</div>

					{/* Separator */}
					<div className="h-px bg-border" />

					{/* Data Source Mode Toggle */}
					<div className="space-y-2">
						<Label>Data Source Type</Label>
						<div className="flex gap-2">
							<Button
								className={cn(
									"flex-1 justify-start gap-2",
									dataSourceMode === "predefined" &&
										"border-primary bg-primary/5"
								)}
								onClick={() => setDataSourceMode("predefined")}
								type="button"
								variant="outline"
							>
								<GaugeIcon className="size-4" weight="duotone" />
								Predefined
							</Button>
							<Button
								className={cn(
									"flex-1 justify-start gap-2",
									dataSourceMode === "custom" && "border-primary bg-primary/5"
								)}
								onClick={() => setDataSourceMode("custom")}
								type="button"
								variant="outline"
							>
								<CodeIcon className="size-4" weight="duotone" />
								Custom Query
							</Button>
						</div>
					</div>

					{dataSourceMode === "predefined" ? (
						<>
							{/* Query Type Selector */}
							<div className="space-y-2">
								<Label>
									Data Source <span className="text-destructive">*</span>
								</Label>
								{isLoadingTypes ? (
									<Skeleton className="h-10 w-full" />
								) : (
									<Popover
										onOpenChange={setIsQueryTypeOpen}
										open={isQueryTypeOpen}
									>
										<PopoverTrigger asChild>
											<Button
												className="w-full justify-between"
												role="combobox"
												variant="outline"
											>
												{selectedQueryType ? (
													<div className="flex items-center gap-2 truncate">
														{(() => {
															const Icon = getCategoryIcon(
																selectedQueryType.category
															);
															return (
																<Icon
																	className="size-4 shrink-0 text-muted-foreground"
																	weight="duotone"
																/>
															);
														})()}
														<span className="truncate">
															{selectedQueryType.title}
														</span>
													</div>
												) : (
													<span className="text-muted-foreground">
														Select a data source…
													</span>
												)}
												<CaretDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent
											align="start"
											className="w-80 p-0"
											onOpenAutoFocus={(e) => e.preventDefault()}
											onPointerDownOutside={(e) => e.preventDefault()}
										>
											<Command shouldFilter>
												<CommandInput placeholder="Search data sources…" />
												<CommandList
													className="max-h-72"
													onWheel={(e) => e.stopPropagation()}
												>
													<CommandEmpty>No data source found.</CommandEmpty>

													{/* Metrics Section */}
													{metricTypes.length > 0 && (
														<CommandGroup
															heading={
																<div className="flex items-center gap-1.5">
																	<GaugeIcon
																		className="size-3.5 text-muted-foreground"
																		weight="duotone"
																	/>
																	Metrics
																	<span className="ml-auto text-[10px] text-muted-foreground/60">
																		single values
																	</span>
																</div>
															}
														>
															{metricTypes.map((type) => {
																const Icon = getCategoryIcon(type.category);
																return (
																	<CommandItem
																		key={type.key}
																		onSelect={() => handleQueryTypeSelect(type)}
																		value={`${type.title} ${type.category}`}
																	>
																		<CheckIcon
																			className={cn(
																				"mr-2 size-4 shrink-0",
																				selectedQueryType?.key === type.key
																					? "opacity-100"
																					: "opacity-0"
																			)}
																		/>
																		<Icon
																			className="mr-2 size-4 shrink-0 text-muted-foreground"
																			weight="duotone"
																		/>
																		<div className="min-w-0 flex-1">
																			<p className="truncate font-medium text-sm">
																				{type.title}
																			</p>
																			<p className="truncate text-muted-foreground text-xs">
																				{type.description}
																			</p>
																		</div>
																	</CommandItem>
																);
															})}
														</CommandGroup>
													)}

													{/* Trends Section */}
													{trendTypes.length > 0 && (
														<CommandGroup
															heading={
																<div className="flex items-center gap-1.5">
																	<ChartLineUpIcon
																		className="size-3.5 text-muted-foreground"
																		weight="duotone"
																	/>
																	Trends
																	<span className="ml-auto text-[10px] text-muted-foreground/60">
																		over time
																	</span>
																</div>
															}
														>
															{trendTypes.map((type) => {
																const Icon = getCategoryIcon(type.category);
																return (
																	<CommandItem
																		key={type.key}
																		onSelect={() => handleQueryTypeSelect(type)}
																		value={`${type.title} ${type.category}`}
																	>
																		<CheckIcon
																			className={cn(
																				"mr-2 size-4 shrink-0",
																				selectedQueryType?.key === type.key
																					? "opacity-100"
																					: "opacity-0"
																			)}
																		/>
																		<Icon
																			className="mr-2 size-4 shrink-0 text-muted-foreground"
																			weight="duotone"
																		/>
																		<div className="min-w-0 flex-1">
																			<p className="truncate font-medium text-sm">
																				{type.title}
																			</p>
																			<p className="truncate text-muted-foreground text-xs">
																				{type.description}
																			</p>
																		</div>
																	</CommandItem>
																);
															})}
														</CommandGroup>
													)}
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								)}
							</div>

							{/* Field Selector */}
							{selectedQueryType && (
								<div className="space-y-2">
									<Label>
										Field to Display <span className="text-destructive">*</span>
									</Label>
									<Popover onOpenChange={setIsFieldOpen} open={isFieldOpen}>
										<PopoverTrigger asChild>
											<Button
												className="w-full justify-between"
												role="combobox"
												variant="outline"
											>
												{selectedField ? (
													<span className="truncate">
														{selectedField.label || selectedField.name}
													</span>
												) : (
													<span className="text-muted-foreground">
														Select a field…
													</span>
												)}
												<CaretDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent
											align="start"
											className="w-80 p-0"
											onOpenAutoFocus={(e) => e.preventDefault()}
											onPointerDownOutside={(e) => e.preventDefault()}
										>
											<Command shouldFilter>
												<CommandInput placeholder="Search fields…" />
												<CommandList className="max-h-72">
													<CommandEmpty>No field found.</CommandEmpty>
													<CommandGroup>
														{selectedQueryType.outputFields.map((field) => (
															<CommandItem
																key={field.name}
																onSelect={() => handleFieldSelect(field)}
																value={field.label || field.name}
															>
																<CheckIcon
																	className={cn(
																		"mr-2 size-4",
																		selectedField?.name === field.name
																			? "opacity-100"
																			: "opacity-0"
																	)}
																/>
																<div className="min-w-0 flex-1">
																	<p className="truncate font-medium text-sm">
																		{field.label || field.name}
																		{field.unit && (
																			<span className="ml-1 text-muted-foreground">
																				({field.unit})
																			</span>
																		)}
																	</p>
																	{field.description && (
																		<p className="truncate text-muted-foreground text-xs">
																			{field.description}
																		</p>
																	)}
																</div>
															</CommandItem>
														))}
													</CommandGroup>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>
							)}

							{/* Display Mode - only show if trends data supports chart */}
							{selectedField && supportsChart && (
								<div className="space-y-2">
									<Label>Display Mode</Label>
									<div className="flex gap-2">
										{(
											[
												{ value: "text", label: "Text", icon: TextTIcon },
												{ value: "chart", label: "Chart", icon: ChartBarIcon },
											] as const
										).map((mode) => {
											const isSelected = displayMode === mode.value;
											const Icon = mode.icon;
											return (
												<button
													className={cn(
														"flex flex-1 cursor-pointer items-center justify-center gap-2 rounded border py-2.5 transition-all",
														isSelected
															? "border-primary bg-primary/5 text-foreground"
															: "border-transparent bg-secondary text-muted-foreground hover:border-border hover:text-foreground"
													)}
													key={mode.value}
													onClick={() => setDisplayMode(mode.value)}
													type="button"
												>
													<Icon
														className={cn(
															"size-4",
															isSelected
																? "text-primary"
																: "text-muted-foreground"
														)}
														weight="duotone"
													/>
													<span className="font-medium text-sm">
														{mode.label}
													</span>
												</button>
											);
										})}
									</div>
								</div>
							)}

							{/* Custom Title */}
							{selectedField && (
								<div className="space-y-2">
									<Label
										className="text-muted-foreground"
										htmlFor="customTitle"
									>
										Custom Title (optional)
									</Label>
									<Input
										id="customTitle"
										onChange={(e) => setCustomTitle(e.target.value)}
										placeholder={selectedField.label || selectedField.name}
										value={customTitle}
									/>
								</div>
							)}
						</>
					) : (
						<>
							{/* Custom Query Builder */}
							<CustomQueryBuilder
								onChangeAction={setCustomQuery}
								value={customQuery}
							/>

							{/* Custom Title for Custom Query */}
							{customQuery && customQuery.selects.length > 0 && (
								<div className="space-y-2">
									<Label
										className="text-muted-foreground"
										htmlFor="customTitle"
									>
										Custom Title (optional)
									</Label>
									<Input
										id="customTitle"
										onChange={(e) => setCustomTitle(e.target.value)}
										placeholder={
											customQuery.selects.at(0)?.alias || "Custom metric"
										}
										value={customTitle}
									/>
								</div>
							)}
						</>
					)}

					{/* Advanced Options - Date Range & Filters (shared) */}
					{(selectedField ||
						(customQuery && customQuery.selects.length > 0)) && (
						<>
							<div className="h-px bg-border" />

							{/* Date Range Override */}
							<div className="space-y-2">
								<Label className="flex items-center gap-1.5 text-muted-foreground">
									<CalendarDotsIcon className="size-3.5" weight="duotone" />
									Date Range
								</Label>
								<Popover
									onOpenChange={setIsDateRangeOpen}
									open={isDateRangeOpen}
								>
									<PopoverTrigger asChild>
										<Button
											className="w-full justify-between"
											role="combobox"
											variant="outline"
										>
											<span
												className={cn(
													dateRangePreset === "global" &&
														"text-muted-foreground"
												)}
											>
												{getPresetLabel(dateRangePreset)}
											</span>
											<CaretDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
										</Button>
									</PopoverTrigger>
									<PopoverContent
										align="start"
										className="w-64 p-0"
										onOpenAutoFocus={(e) => e.preventDefault()}
									>
										<Command>
											<CommandList>
												<CommandGroup>
													{DATE_RANGE_PRESETS.map((preset) => (
														<CommandItem
															key={preset.value}
															onSelect={() => {
																setDateRangePreset(preset.value);
																setIsDateRangeOpen(false);
															}}
															value={preset.label}
														>
															<CheckIcon
																className={cn(
																	"mr-2 size-4",
																	dateRangePreset === preset.value
																		? "opacity-100"
																		: "opacity-0"
																)}
															/>
															{preset.label}
														</CommandItem>
													))}
												</CommandGroup>
											</CommandList>
										</Command>
									</PopoverContent>
								</Popover>
							</div>

							{/* Filters */}
							<div className="space-y-2">
								<Label className="flex items-center gap-1.5 text-muted-foreground">
									<FunnelIcon className="size-3.5" weight="duotone" />
									Filters
								</Label>

								{filters.length > 0 && (
									<div className="space-y-2">
										{filters.map((filter, index) => (
											<div
												className="flex items-center gap-2 rounded border bg-card p-2.5"
												key={`filter-${index}`}
											>
												<Select
													onValueChange={(value) =>
														handleUpdateFilter(index, "field", value)
													}
													value={filter.field}
												>
													<SelectTrigger className="h-8 w-28 text-xs">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{filterOptions.map((option) => (
															<SelectItem
																key={option.value}
																value={option.value}
															>
																{option.label}
															</SelectItem>
														))}
													</SelectContent>
												</Select>

												<Select
													onValueChange={(value) =>
														handleUpdateFilter(index, "operator", value)
													}
													value={filter.operator}
												>
													<SelectTrigger className="h-8 w-24 text-xs">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
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

												<AutocompleteInput
													className="flex-1 text-xs"
													inputClassName="h-8"
													onValueChange={(value) =>
														handleUpdateFilter(index, "value", value)
													}
													placeholder="Value…"
													suggestions={getSuggestions(filter.field)}
													value={filter.value}
												/>

												<Button
													aria-label="Remove filter"
													className="size-6 shrink-0 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
													onClick={() => handleRemoveFilter(index)}
													size="icon"
													variant="ghost"
												>
													<TrashIcon size={14} />
												</Button>
											</div>
										))}
									</div>
								)}

								<Button
									className="w-full"
									onClick={handleAddFilter}
									size="sm"
									type="button"
									variant="outline"
								>
									<PlusIcon className="size-4" />
									Add Filter
								</Button>
							</div>
						</>
					)}
				</SheetBody>

				<SheetFooter className="flex-row justify-between sm:justify-between">
					{isEditMode && onDeleteAction ? (
						<Button
							className="text-destructive hover:bg-destructive/10 hover:text-destructive"
							onClick={() => setShowDeleteConfirm(true)}
							type="button"
							variant="ghost"
						>
							<TrashIcon className="size-4" weight="duotone" />
							Delete
						</Button>
					) : (
						<div />
					)}
					<div className="flex gap-2">
						<Button onClick={onCloseAction} type="button" variant="ghost">
							Cancel
						</Button>
						<Button
							className="min-w-24"
							disabled={isSubmitting || !canSave}
							onClick={handleSubmit}
							type="button"
						>
							{isSubmitting ? (
								<>
									<SpinnerGapIcon className="animate-spin" size={16} />
									{isEditMode ? "Saving…" : "Adding…"}
								</>
							) : isEditMode ? (
								"Save Changes"
							) : (
								"Add Card"
							)}
						</Button>
					</div>
				</SheetFooter>

				<DeleteDialog
					isOpen={showDeleteConfirm}
					itemName={`"${editingCard?.title || editingCard?.label}"`}
					onClose={() => setShowDeleteConfirm(false)}
					onConfirm={handleDelete}
					title="Delete Card"
				/>
			</SheetContent>
		</Sheet>
	);
}
