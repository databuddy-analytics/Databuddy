"use client";

import { filterOptions } from "@databuddy/shared/lists/filters";
import {
	DragDropContext,
	Draggable,
	Droppable,
	type DropResult,
} from "@hello-pangea/dnd";
import {
	DotsNineIcon,
	FunnelIcon,
	PlusIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Switch } from "@/components/ui/switch";
import { goalFunnelOperatorOptions, useFilters } from "@/hooks/use-filters";
import type {
	AutocompleteData,
	CreateFunnelData,
	Funnel,
	FunnelFilter,
	FunnelStep,
} from "@/hooks/use-funnels";
import { cn } from "@/lib/utils";
import { AutocompleteInput } from "./funnel-components";

const defaultFilter: FunnelFilter = {
	field: "browser_name",
	operator: "equals",
	value: "",
} as const;

interface EditFunnelDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (funnel: Funnel) => Promise<void>;
	onCreate?: (data: CreateFunnelData) => Promise<void>;
	funnel: Funnel | null;
	isUpdating: boolean;
	isCreating?: boolean;
	autocompleteData?: AutocompleteData;
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
			// Ensure all filters have valid operators (default to "equals" if missing)
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

	const handleSubmit = async () => {
		if (!formData) return;

		// Ensure all filters have valid operators (default to "equals" if missing)
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
		if (!formData) return;
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
			if (!formData || formData.steps.length <= 2) return;
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
			if (!formData) return;
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
		[formData]
	);

	const reorderSteps = useCallback(
		(result: DropResult) => {
			if (!(result.destination && formData)) return;

			const sourceIndex = result.source.index;
			const destinationIndex = result.destination.index;

			if (sourceIndex === destinationIndex) return;

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
			if (!autocompleteData) return [];

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
			if (!autocompleteData) return [];

			if (stepType === "PAGE_VIEW") return autocompleteData.pagePaths || [];
			if (stepType === "EVENT") return autocompleteData.customEvents || [];

			return [];
		},
		[autocompleteData]
	);

	const handleClose = useCallback(() => {
		onClose();
		if (isCreateMode) resetForm();
	}, [onClose, isCreateMode, resetForm]);

	const isFormValid = useMemo(() => {
		if (!formData) return false;
		return (
			formData.name &&
			!formData.steps.some((s) => !(s.name && s.target)) &&
			!(formData.filters || []).some((f) => !f.value || f.value === "")
		);
	}, [formData]);

	if (!formData) return null;

	return (
		<Sheet onOpenChange={handleClose} open={isOpen}>
			<SheetContent side="right">
				<SheetHeader>
					<div className="flex items-start gap-4">
						<div className="flex size-11 items-center justify-center rounded border bg-background">
							<FunnelIcon
								className="text-accent-foreground"
								size={22}
								weight="fill"
							/>
						</div>
						<div className="min-w-0 flex-1">
							<SheetTitle className="truncate text-lg">
								{isCreateMode ? "New Funnel" : formData.name || "Edit Funnel"}
							</SheetTitle>
							<SheetDescription className="text-xs">
								{isCreateMode
									? "Track user conversion journeys"
									: `${formData.steps.length} steps configured`}
							</SheetDescription>
						</div>
						<Badge variant="secondary">{formData.steps.length} steps</Badge>
					</div>
				</SheetHeader>

				<SheetBody className="space-y-6">
					{/* Basic Info */}
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="funnel-name">Name</Label>
							<Input
								id="funnel-name"
								onChange={(e) =>
									setFormData((prev) =>
										prev ? { ...prev, name: e.target.value } : prev
									)
								}
								placeholder="e.g., Sign Up Flow"
								value={formData.name}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="funnel-description">Description</Label>
							<Input
								id="funnel-description"
								onChange={(e) =>
									setFormData((prev) =>
										prev ? { ...prev, description: e.target.value } : prev
									)
								}
								placeholder="Optional"
								value={formData.description || ""}
							/>
						</div>
					</div>

					{/* Steps Section */}
					<section className="space-y-3">
						<div className="flex items-center justify-between">
							<Label className="text-muted-foreground text-xs">
								Funnel Steps
							</Label>
							<span className="text-muted-foreground text-xs">
								Drag to reorder
							</span>
						</div>

						<DragDropContext onDragEnd={reorderSteps}>
							<Droppable droppableId="funnel-steps">
								{(provided, snapshot) => (
									<div
										{...provided.droppableProps}
										className={cn(
											"space-y-2",
											snapshot.isDraggingOver && "rounded bg-accent/50 p-2"
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
															"flex items-center gap-2 rounded border bg-card p-2.5 transition-all",
															snapshot.isDragging &&
																"border-primary shadow-lg ring-2 ring-primary/20"
														)}
													>
														{/* Drag handle */}
														<div
															{...provided.dragHandleProps}
															className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
														>
															<DotsNineIcon size={16} />
														</div>

														{/* Step number */}
														<div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-foreground font-semibold text-accent text-xs">
															{index + 1}
														</div>

														{/* Step fields */}
														<div className="grid flex-1 grid-cols-3 gap-2">
															<Select
																onValueChange={(value) =>
																	updateStep(index, "type", value)
																}
																value={step.type}
															>
																<SelectTrigger className="h-8 text-xs">
																	<SelectValue />
																</SelectTrigger>
																<SelectContent>
																	<SelectItem value="PAGE_VIEW">
																		Page View
																	</SelectItem>
																	<SelectItem value="EVENT">Event</SelectItem>
																</SelectContent>
															</Select>
															<AutocompleteInput
																className="h-8 text-xs"
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
															<Input
																className="h-8 text-xs"
																onChange={(e) =>
																	updateStep(index, "name", e.target.value)
																}
																placeholder="Step name"
																value={step.name}
															/>
														</div>

														{/* Remove button */}
														{formData.steps.length > 2 && (
															<Button
																className="size-6 shrink-0 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
																onClick={() => removeStep(index)}
																size="icon"
																variant="ghost"
															>
																<TrashIcon size={14} />
															</Button>
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
							className="w-full border text-accent-foreground hover:bg-accent hover:text-accent-foreground"
							disabled={formData.steps.length >= 10}
							onClick={addStep}
							size="sm"
							variant="outline"
						>
							<PlusIcon size={14} />
							Add Step
						</Button>
					</section>

					{/* Settings Section */}
					<section className="space-y-3">
						<Label className="text-muted-foreground text-xs">Settings</Label>
						<div className="flex items-center justify-between rounded border bg-card p-3">
							<div className="space-y-0.5">
								<Label
									className="font-medium text-sm"
									htmlFor="ignore-historic"
								>
									Ignore historic data
								</Label>
								<p className="text-muted-foreground text-xs">
									Only count events after this funnel was created
								</p>
							</div>
							<Switch
								checked={formData.ignoreHistoricData ?? false}
								id="ignore-historic"
								onCheckedChange={(checked) =>
									setFormData((prev) =>
										prev ? { ...prev, ignoreHistoricData: checked } : prev
									)
								}
							/>
						</div>
					</section>

					{/* Filters Section */}
					<section className="space-y-3">
						<Label className="text-muted-foreground text-xs">
							Filters (Optional)
						</Label>

						{formData.filters && formData.filters.length > 0 && (
							<div className="space-y-2">
								{formData.filters.map((filter, index) => (
									<div
										className="flex items-center gap-2 rounded border bg-card p-2.5"
										key={`filter-${index}`}
									>
										<Select
											onValueChange={(value) =>
												updateFilter(index, "field", value)
											}
											value={filter.field}
										>
											<SelectTrigger className="h-8 w-28 text-xs">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{filterOptions.map((option) => (
													<SelectItem key={option.value} value={option.value}>
														{option.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>

										<Select
											onValueChange={(value) =>
												updateFilter(index, "operator", value)
											}
											value={filter.operator || "equals"}
										>
											<SelectTrigger className="h-8 w-24 text-xs">
												<SelectValue placeholder="equals" />
											</SelectTrigger>
											<SelectContent>
												{goalFunnelOperatorOptions.map((option) => (
													<SelectItem key={option.value} value={option.value}>
														{option.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>

										<AutocompleteInput
											className="h-8 flex-1 text-xs"
											onValueChange={(value) =>
												updateFilter(index, "value", value)
											}
											placeholder="Value"
											suggestions={getSuggestions(filter.field)}
											value={(filter.value as string) || ""}
										/>

										<Button
											className="size-6 shrink-0 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
											onClick={() => removeFilter(index)}
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
							onClick={() => addFilter()}
							size="sm"
							variant="outline"
						>
							<PlusIcon size={14} />
							Add Filter
						</Button>
					</section>
				</SheetBody>

				<SheetFooter>
					<Button onClick={handleClose} variant="ghost">
						Cancel
					</Button>
					<Button
						disabled={!isFormValid || (isCreateMode ? isCreating : isUpdating)}
						onClick={handleSubmit}
					>
						{(isCreateMode ? isCreating : isUpdating) ? (
							<>
								<div className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
								{isCreateMode ? "Creating…" : "Saving…"}
							</>
						) : isCreateMode ? (
							"Create Funnel"
						) : (
							"Save Changes"
						)}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
