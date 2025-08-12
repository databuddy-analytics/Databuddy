'use client';

import {
	DragDropContext,
	Draggable,
	Droppable,
	type DropResult,
} from '@hello-pangea/dnd';
import { filterOptions } from '@databuddy/shared';
import {
	ChartBarIcon,
	FunnelIcon,
	PencilIcon,
	PlusIcon,
	TrashIcon,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from '@/components/ui/sheet';
import type {
	AutocompleteData,
	CreateFunnelData,
	Funnel,
	FunnelFilter,
	FunnelStep,
} from '@/hooks/use-funnels';
import { operatorOptions, useFilters } from '@/hooks/use-filters';
import { AutocompleteInput, DraggableStep } from './funnel-components';

const defaultFilter: FunnelFilter = {
	field: 'browser_name',
	operator: 'equals',
	value: '',
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
			setFormData({
				...funnel,
				filters: funnel.filters || [],
			});
		} else {
			// Initialize for create mode
			setFormData({
				id: '',
				name: '',
				description: '',
				steps: [
					{ type: 'PAGE_VIEW' as const, target: '/', name: 'Landing Page' },
					{
						type: 'PAGE_VIEW' as const,
						target: '/signup',
						name: 'Sign Up Page',
					},
				],
				filters: [],
				isActive: true,
				createdAt: '',
				updatedAt: '',
			});
		}
	}, [funnel]);

	const handleSubmit = async () => {
		if (!formData) {
			return;
		}

		if (isCreateMode && onCreate) {
			const createData: CreateFunnelData = {
				name: formData.name,
				description: formData.description || undefined,
				steps: formData.steps,
				filters: formData.filters || [],
			};
			await onCreate(createData);
			resetForm();
		} else {
			await onSubmit(formData);
		}
	};

	const resetForm = useCallback(() => {
		if (isCreateMode) {
			setFormData({
				id: '',
				name: '',
				description: '',
				steps: [
					{ type: 'PAGE_VIEW' as const, target: '/', name: 'Landing Page' },
					{
						type: 'PAGE_VIEW' as const,
						target: '/signup',
						name: 'Sign Up Page',
					},
				],
				filters: [],
				isActive: true,
				createdAt: '',
				updatedAt: '',
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
							{ type: 'PAGE_VIEW' as const, target: '', name: '' },
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
					? {
							...prev,
							steps: prev.steps.filter((_, i) => i !== index),
						}
					: prev
			);
		},
		[formData]
	);

	const updateStep = useCallback(
		(index: number, field: keyof FunnelStep, value: string) => {
			if (!formData) {
				return;
			}
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
			if (!(result.destination && formData)) {
				return;
			}

			const sourceIndex = result.source.index;
			const destinationIndex = result.destination.index;

			// No change needed
			if (sourceIndex === destinationIndex) {
				return;
			}

			const items = [...formData.steps];
			const [reorderedItem] = items.splice(sourceIndex, 1);
			items.splice(destinationIndex, 0, reorderedItem);

			setFormData((prev) =>
				prev
					? {
							...prev,
							steps: items,
						}
					: prev
			);
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

	const getStepSuggestions = useCallback(
		(stepType: string): string[] => {
			if (!autocompleteData) {
				return [];
			}

			if (stepType === 'PAGE_VIEW') {
				return autocompleteData.pagePaths || [];
			}
			if (stepType === 'EVENT') {
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

	// Memoize form validation
	const isFormValid = useMemo(() => {
		if (!formData) {
			return false;
		}
		return (
			formData.name &&
			!formData.steps.some((s) => !(s.name && s.target)) &&
			!(formData.filters || []).some((f) => !f.value || f.value === '')
		);
	}, [formData]);

	if (!formData) {
		return null;
	}

	return (
		<Sheet onOpenChange={handleClose} open={isOpen}>
			<SheetContent
				className="w-full overflow-y-auto p-4 sm:w-[60vw] sm:max-w-[1200px]"
				side="right"
			>
				<SheetHeader className="space-y-3 border-border/50 border-b pb-6">
					<div className="flex items-center gap-3">
						<div className="rounded-xl border border-primary/20 bg-primary/10 p-3">
							{isCreateMode ? (
								<FunnelIcon
									className="h-6 w-6 text-primary"
									size={16}
									weight="duotone"
								/>
							) : (
								<PencilIcon
									className="h-6 w-6 text-primary"
									size={16}
									weight="duotone"
								/>
							)}
						</div>
						<div>
							<SheetTitle className="font-semibold text-foreground text-xl">
								{isCreateMode ? 'Create New Funnel' : 'Edit Funnel'}
							</SheetTitle>
							<SheetDescription className="mt-1 text-muted-foreground">
								{isCreateMode
									? 'Set up a new conversion funnel to track user journeys'
									: 'Update funnel configuration and steps'}
							</SheetDescription>
						</div>
					</div>
				</SheetHeader>

				<div className="space-y-6 pt-6">
					<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
						<div className="space-y-2">
							<Label
								className="font-medium text-foreground text-sm"
								htmlFor="edit-name"
							>
								Funnel Name
							</Label>
							<Input
								className="rounded border-border/50 focus:border-primary/50 focus:ring-primary/20"
								id="edit-name"
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
							<Label
								className="font-medium text-foreground text-sm"
								htmlFor="edit-description"
							>
								Description
							</Label>
							<Input
								className="rounded border-border/50 focus:border-primary/50 focus:ring-primary/20"
								id="edit-description"
								onChange={(e) =>
									setFormData((prev) =>
										prev ? { ...prev, description: e.target.value } : prev
									)
								}
								placeholder="Optional description"
								value={formData.description || ''}
							/>
						</div>
					</div>

					<div className="space-y-4">
						<div className="flex items-center gap-2">
							<ChartBarIcon
								className="h-5 w-5 text-primary"
								size={16}
								weight="duotone"
							/>
							<Label className="font-semibold text-base text-foreground">
								Funnel Steps
							</Label>
							<span className="text-muted-foreground text-xs">
								(drag to reorder)
							</span>
						</div>
						<DragDropContext onDragEnd={reorderSteps}>
							<Droppable droppableId="funnel-steps">
								{(provided: any, snapshot: any) => (
									<div
										{...provided.droppableProps}
										className={`space-y-4 transition-colors duration-150 ${
											snapshot.isDraggingOver
												? 'rounded-lg bg-accent/10 p-1'
												: ''
										}`}
										ref={provided.innerRef}
									>
										{formData.steps.map((step, index) => (
											<Draggable
												draggableId={`step-${index}`}
												index={index}
												key={`step-${index}`}
											>
												{(provided: any, snapshot: any) => (
													<div
														ref={provided.innerRef}
														{...provided.draggableProps}
														{...provided.dragHandleProps}
													>
														<DraggableStep
															canRemove={formData.steps.length > 2}
															getStepSuggestions={getStepSuggestions}
															index={index}
															isDragging={snapshot.isDragging}
															removeStep={removeStep}
															step={step}
															updateStep={updateStep}
														/>
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
							className="group rounded border-2 border-primary/30 border-dashed transition-all duration-300 hover:border-primary/50 hover:bg-primary/5"
							disabled={formData.steps.length >= 10}
							onClick={addStep}
							size="default"
							type="button"
							variant="outline"
						>
							<PlusIcon
								className="mr-2 h-4 w-4 transition-transform duration-300 group-hover:rotate-90"
								size={16}
							/>
							Add Step
						</Button>
					</div>

					<div className="space-y-4">
						<div className="flex items-center gap-2">
							<FunnelIcon
								className="h-5 w-5 text-primary"
								size={16}
								weight="duotone"
							/>
							<Label className="font-semibold text-base text-foreground">
								Filters
							</Label>
							<span className="text-muted-foreground text-xs">(optional)</span>
						</div>

						{formData.filters && formData.filters.length > 0 && (
							<div className="space-y-3">
								{formData.filters.map((filter, index) => (
									<div
										className="flex items-center gap-3 rounded border bg-muted/30 p-3"
										key={`filter-${index}`}
									>
										<Select
											onValueChange={(value) =>
												updateFilter(index, 'field', value)
											}
											value={filter.field}
										>
											<SelectTrigger className="w-40 rounded border-border/50">
												<SelectValue />
											</SelectTrigger>
											<SelectContent className="rounded">
												{filterOptions.map((option) => (
													<SelectItem key={option.value} value={option.value}>
														{option.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>

										<Select
											onValueChange={(value) =>
												updateFilter(index, 'operator', value)
											}
											value={filter.operator}
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

										<AutocompleteInput
											className="flex-1 rounded border-border/50 focus:border-primary/50 focus:ring-primary/20"
											onValueChange={(value) =>
												updateFilter(index, 'value', value)
											}
											placeholder="Filter value"
											suggestions={getSuggestions(filter.field)}
											value={(filter.value as string) || ''}
										/>

										<Button
											className="h-8 w-8 rounded p-0 hover:bg-destructive/10 hover:text-destructive"
											onClick={() => removeFilter(index)}
											size="sm"
											variant="ghost"
										>
											<TrashIcon className="h-4 w-4" size={16} />
										</Button>
									</div>
								))}
							</div>
						)}

						<Button
							className="rounded border-2 border-primary/30 border-dashed hover:border-primary/50 hover:bg-primary/5"
							onClick={() => addFilter()}
							size="sm"
							type="button"
							variant="outline"
						>
							<PlusIcon className="mr-2 h-4 w-4" size={16} />
							Add Filter
						</Button>
					</div>

					<div className="flex justify-end gap-3 border-border/50 border-t pt-6">
						<Button
							className="rounded"
							onClick={handleClose}
							type="button"
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							className="relative rounded"
							disabled={
								!isFormValid || (isCreateMode ? isCreating : isUpdating)
							}
							onClick={handleSubmit}
						>
							{(isCreateMode ? isCreating : isUpdating) && (
								<div className="absolute left-3">
									<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
								</div>
							)}
							<span
								className={
									(isCreateMode ? isCreating : isUpdating) ? 'ml-6' : ''
								}
							>
								{isCreateMode
									? isCreating
										? 'Creating...'
										: 'Create Funnel'
									: isUpdating
										? 'Updating...'
										: 'Update Funnel'}
							</span>
						</Button>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}
