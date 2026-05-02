"use client";

import { AutocompleteInput } from "@/components/ui/autocomplete-input";
import { FilterRow } from "@/components/ui/filter-row";
import type { AutocompleteData } from "@/hooks/use-autocomplete";
import { goalFunnelOperatorOptions, useFilters } from "@/hooks/use-filters";
import { cn } from "@/lib/utils";
import type {
	CreateFunnelData,
	Funnel,
	FunnelFilter,
	FunnelStep,
} from "@/types/funnels";
import { filterOptions } from "@databuddy/shared/lists/filters";
import {
	DragDropContext,
	Draggable,
	Droppable,
	type DropResult,
} from "@hello-pangea/dnd";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	DotsNineIcon,
	FunnelSimpleIcon,
	XIcon,
} from "@phosphor-icons/react/dist/ssr";
import { FunnelIcon, GearIcon, PlusIcon } from "@databuddy/ui/icons";
import { Button, Divider, Field, Input, Text } from "@databuddy/ui";
import { Accordion, DropdownMenu, Sheet, Switch } from "@databuddy/ui/client";

const defaultFilter: FunnelFilter = {
	field: "browser_name",
	operator: "equals",
	value: "",
} as const;

interface EditFunnelDialogProps {
	autocompleteData?: AutocompleteData;
	funnel: Funnel | null;
	isCreating?: boolean;
	isOpen: boolean;
	isUpdating: boolean;
	onClose: () => void;
	onCreate?: (data: CreateFunnelData) => Promise<void>;
	onSubmit: (funnel: Funnel) => Promise<void>;
}

export function EditFunnelDialog({
	isOpen,
	onClose,
	onSubmit,
	onCreate,
	funnel,
	isUpdating,
	isCreating = false,
	autocompleteData,
}: EditFunnelDialogProps) {
	const [formData, setFormData] = useState<Funnel | null>(null);
	const isCreateMode = !funnel;

	useEffect(() => {
		if (funnel) {
			const sanitizedFilters = (funnel.filters || []).map((f) => ({
				...f,
				operator: f.operator || "equals",
			}));
			setFormData({
				...funnel,
				filters: sanitizedFilters,
				ignoreHistoricData: funnel.ignoreHistoricData ?? false,
			});
		} else {
			setFormData({
				id: "",
				name: "",
				description: "",
				steps: [
					{ type: "PAGE_VIEW" as const, target: "/", name: "Landing Page" },
					{
						type: "PAGE_VIEW" as const,
						target: "/signup",
						name: "Sign Up Page",
					},
				],
				filters: [],
				ignoreHistoricData: false,
				isActive: true,
				createdAt: "",
				updatedAt: "",
			});
		}
	}, [funnel]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!formData) {
			return;
		}

		const sanitizedFilters = (formData.filters || []).map((f) => ({
			...f,
			operator: f.operator || "equals",
		}));

		if (isCreateMode && onCreate) {
			const createData: CreateFunnelData = {
				name: formData.name,
				description: formData.description || undefined,
				steps: formData.steps,
				filters: sanitizedFilters,
				ignoreHistoricData: formData.ignoreHistoricData,
			};
			await onCreate(createData);
			resetForm();
		} else {
			await onSubmit({
				...formData,
				filters: sanitizedFilters,
			});
		}
	};

	const resetForm = useCallback(() => {
		if (isCreateMode) {
			setFormData({
				id: "",
				name: "",
				description: "",
				steps: [
					{ type: "PAGE_VIEW" as const, target: "/", name: "Landing Page" },
					{
						type: "PAGE_VIEW" as const,
						target: "/signup",
						name: "Sign Up Page",
					},
				],
				filters: [],
				ignoreHistoricData: false,
				isActive: true,
				createdAt: "",
				updatedAt: "",
			});
		}
	}, [isCreateMode]);

	const addStep = useCallback(() => {
		if (!formData) {
			return;
		}
		setFormData((prev) =>
			prev
				? {
						...prev,
						steps: [
							...prev.steps,
							{ type: "PAGE_VIEW" as const, target: "", name: "" },
						],
					}
				: prev
		);
	}, [formData]);

	const removeStep = useCallback(
		(index: number) => {
			if (!formData || formData.steps.length <= 2) {
				return;
			}
			setFormData((prev) =>
				prev
					? { ...prev, steps: prev.steps.filter((_, i) => i !== index) }
					: prev
			);
		},
		[formData]
	);

	const updateStep = useCallback(
		(index: number, field: keyof FunnelStep, value: string) => {
			setFormData((prev) =>
				prev
					? {
							...prev,
							steps: prev.steps.map((step, i) =>
								i === index ? { ...step, [field]: value } : step
							),
						}
					: prev
			);
		},
		[]
	);

	const reorderSteps = useCallback(
		(result: DropResult) => {
			if (!(result.destination && formData)) {
				return;
			}

			const sourceIndex = result.source.index;
			const destinationIndex = result.destination.index;

			if (sourceIndex === destinationIndex) {
				return;
			}

			const items = [...formData.steps];
			const [reorderedItem] = items.splice(sourceIndex, 1);
			items.splice(destinationIndex, 0, reorderedItem);

			setFormData((prev) => (prev ? { ...prev, steps: items } : prev));
		},
		[formData]
	);

	const handleFiltersChange = useCallback((newFilters: FunnelFilter[]) => {
		setFormData((prev) => (prev ? { ...prev, filters: newFilters } : prev));
	}, []);

	const { addFilter, removeFilter, updateFilter } = useFilters({
		filters: formData?.filters || [],
		onFiltersChange: handleFiltersChange,
		defaultFilter,
	});

	const getSuggestions = useCallback(
		(field: string): string[] => {
			if (!autocompleteData) {
				return [];
			}

			switch (field) {
				case "browser_name":
					return autocompleteData.browsers || [];
				case "os_name":
					return autocompleteData.operatingSystems || [];
				case "country":
					return autocompleteData.countries || [];
				case "device_type":
					return autocompleteData.deviceTypes || [];
				case "utm_source":
					return autocompleteData.utmSources || [];
				case "utm_medium":
					return autocompleteData.utmMediums || [];
				case "utm_campaign":
					return autocompleteData.utmCampaigns || [];
				default:
					return [];
			}
		},
		[autocompleteData]
	);

	const getStepSuggestions = useCallback(
		(stepType: string): string[] => {
			if (!autocompleteData) {
				return [];
			}

			if (stepType === "PAGE_VIEW") {
				return autocompleteData.pagePaths || [];
			}
			if (stepType === "EVENT") {
				return autocompleteData.customEvents || [];
			}

			return [];
		},
		[autocompleteData]
	);

	const handleClose = useCallback(() => {
		onClose();
		if (isCreateMode) {
			resetForm();
		}
	}, [onClose, isCreateMode, resetForm]);

	const isFormValid = useMemo(() => {
		if (!formData) {
			return false;
		}
		return (
			formData.name &&
			!formData.steps.some((s) => !(s.name && s.target)) &&
			!(formData.filters || []).some((f) => !f.value || f.value === "")
		);
	}, [formData]);

	if (!formData) {
		return null;
	}

	return (
		<Sheet onOpenChange={handleClose} open={isOpen}>
			<Sheet.Content className="w-full sm:max-w-lg" side="right">
				<Sheet.Header>
					<div className="flex items-center gap-4">
						<div className="flex size-11 items-center justify-center rounded border bg-secondary">
							<FunnelIcon className="size-5 text-primary" weight="fill" />
						</div>
						<div>
							<Sheet.Title className="text-lg">
								{isCreateMode ? "New Funnel" : formData.name || "Edit Funnel"}
							</Sheet.Title>
							<Sheet.Description>
								{isCreateMode
									? "Track user conversion journeys"
									: `${formData.steps.length} steps configured`}
							</Sheet.Description>
						</div>
					</div>
				</Sheet.Header>

				<Sheet.Form onSubmit={handleSubmit}>
					<Sheet.Body className="space-y-5">
						<div className="grid gap-3 sm:grid-cols-2">
							<Field>
								<Field.Label>Name</Field.Label>
								<Input
									onChange={(e) =>
										setFormData((prev) =>
											prev ? { ...prev, name: e.target.value } : prev
										)
									}
									placeholder="e.g., Sign Up Flow"
									value={formData.name}
								/>
							</Field>
							<Field>
								<Field.Label>
									Description{" "}
									<span className="text-muted-foreground">(optional)</span>
								</Field.Label>
								<Input
									onChange={(e) =>
										setFormData((prev) =>
											prev
												? {
														...prev,
														description: e.target.value,
													}
												: prev
										)
									}
									placeholder="What this funnel tracks"
									value={formData.description || ""}
								/>
							</Field>
						</div>

						<Divider />

						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<Text variant="label">Steps</Text>
								<Text tone="muted" variant="caption">
									Drag to reorder
								</Text>
							</div>

							<DragDropContext onDragEnd={reorderSteps}>
								<Droppable droppableId="funnel-steps">
									{(provided, snapshot) => (
										<div
											{...provided.droppableProps}
											className={cn(
												"space-y-2",
												snapshot.isDraggingOver && "rounded-md bg-accent/50 p-2"
											)}
											ref={provided.innerRef}
										>
											{formData.steps.map((step, index) => (
												<Draggable
													draggableId={`step-${index}`}
													index={index}
													key={`step-${index}`}
												>
													{(provided, snapshot) => (
														<div
															ref={provided.innerRef}
															{...provided.draggableProps}
															className={cn(
																"flex items-center gap-2 rounded-md border border-border/60 p-2.5 transition-all",
																snapshot.isDragging &&
																	"border-primary shadow-lg ring-2 ring-primary/20"
															)}
														>
															<div
																{...provided.dragHandleProps}
																className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
															>
																<DotsNineIcon className="size-4" />
															</div>
															<div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-foreground font-semibold text-accent text-xs">
																{index + 1}
															</div>
															<Input
																className="h-8 min-w-0 flex-1 text-xs"
																onChange={(e) =>
																	updateStep(index, "name", e.target.value)
																}
																placeholder="Step name"
																value={step.name}
															/>
															<DropdownMenu>
																<DropdownMenu.Trigger className="flex h-8 w-24 shrink-0 cursor-pointer select-none items-center justify-between rounded-md bg-secondary px-3 text-foreground text-xs transition-colors hover:bg-interactive-hover">
																	{step.type === "PAGE_VIEW" ? "Page" : "Event"}
																</DropdownMenu.Trigger>
																<DropdownMenu.Content
																	align="start"
																	side="bottom"
																>
																	<DropdownMenu.RadioGroup
																		onValueChange={(value) =>
																			updateStep(index, "type", value)
																		}
																		value={step.type}
																	>
																		<DropdownMenu.RadioItem value="PAGE_VIEW">
																			Page View
																		</DropdownMenu.RadioItem>
																		<DropdownMenu.RadioItem value="EVENT">
																			Event
																		</DropdownMenu.RadioItem>
																	</DropdownMenu.RadioGroup>
																</DropdownMenu.Content>
															</DropdownMenu>
															<AutocompleteInput
																className="min-w-0 flex-1"
																inputClassName="h-8 text-xs"
																onValueChange={(value) =>
																	updateStep(index, "target", value)
																}
																placeholder={
																	step.type === "PAGE_VIEW"
																		? "/path"
																		: "event_name"
																}
																suggestions={getStepSuggestions(step.type)}
																value={step.target || ""}
															/>
															{formData.steps.length > 2 && (
																<button
																	aria-label="Remove step"
																	className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
																	onClick={() => removeStep(index)}
																	type="button"
																>
																	<XIcon className="size-3.5" />
																</button>
															)}
														</div>
													)}
												</Draggable>
											))}
											{provided.placeholder}
										</div>
									)}
								</Droppable>
							</DragDropContext>

							<Button
								className="w-full text-muted-foreground"
								disabled={formData.steps.length >= 10}
								onClick={addStep}
								size="sm"
								type="button"
								variant="secondary"
							>
								<PlusIcon className="size-3.5" />
								Add Step
							</Button>
						</div>

						<Divider />

						<div className="space-y-2">
							<div className="overflow-hidden rounded-md border border-border/60">
								<Accordion>
									<Accordion.Trigger>
										<GearIcon
											className="size-4 shrink-0 text-muted-foreground"
											weight="duotone"
										/>
										<Text variant="label">Settings</Text>
									</Accordion.Trigger>
									<Accordion.Content>
										<div className="flex items-center justify-between gap-4">
											<div>
												<Text variant="label">Ignore historic data</Text>
												<Text tone="muted" variant="caption">
													Only count events after this funnel was created
												</Text>
											</div>
											<Switch
												checked={formData.ignoreHistoricData ?? false}
												onCheckedChange={(checked) =>
													setFormData((prev) =>
														prev
															? {
																	...prev,
																	ignoreHistoricData: checked,
																}
															: prev
													)
												}
											/>
										</div>
									</Accordion.Content>
								</Accordion>
							</div>

							<div className="overflow-hidden rounded-md border border-border/60">
								<Accordion>
									<Accordion.Trigger>
										<FunnelSimpleIcon className="size-4 shrink-0 text-muted-foreground" />
										<Text variant="label">Filters</Text>
										{formData.filters && formData.filters.length > 0 && (
											<span className="ml-auto flex size-5 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
												{formData.filters.length}
											</span>
										)}
									</Accordion.Trigger>
									<Accordion.Content>
										{formData.filters && formData.filters.length > 0 && (
											<div className="mb-3 space-y-2">
												{formData.filters.map((filter, index) => (
													<FilterRow
														field={filter.field}
														fieldOptions={filterOptions}
														key={`filter-${index}`}
														onFieldChange={(value) =>
															updateFilter(index, "field", value)
														}
														onOperatorChange={(value) =>
															updateFilter(index, "operator", value)
														}
														onRemove={() => removeFilter(index)}
														onValueChange={(value) =>
															updateFilter(index, "value", value)
														}
														operator={filter.operator || "equals"}
														operatorOptions={goalFunnelOperatorOptions}
														suggestions={getSuggestions(filter.field)}
														value={(filter.value as string) || ""}
													/>
												))}
											</div>
										)}
										<Button
											className="w-full text-muted-foreground"
											onClick={() => addFilter()}
											size="sm"
											type="button"
											variant="secondary"
										>
											<PlusIcon className="size-3.5" />
											Add Filter
										</Button>
									</Accordion.Content>
								</Accordion>
							</div>
						</div>
					</Sheet.Body>

					<Sheet.Footer>
						<Button onClick={handleClose} type="button" variant="secondary">
							Cancel
						</Button>
						<Button
							disabled={!isFormValid}
							loading={isCreateMode ? isCreating : isUpdating}
							type="submit"
						>
							{isCreateMode ? "Create Funnel" : "Save Changes"}
						</Button>
					</Sheet.Footer>
				</Sheet.Form>
				<Sheet.Close />
			</Sheet.Content>
		</Sheet>
	);
}
