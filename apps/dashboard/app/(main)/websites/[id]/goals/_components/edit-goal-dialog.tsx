'use client';

import { filterOptions, type GoalFilter } from '@databuddy/shared';
import {
	Eye,
	MouseMiddleClick,
	PencilIcon,
	PlusIcon,
	Target,
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
import type { AutocompleteData } from '@/hooks/use-funnels';
import type { CreateGoalData, Goal } from '@/hooks/use-goals';
import { operatorOptions, useFilters } from '@/hooks/use-filters';
import { AutocompleteInput } from '../../funnels/_components/funnel-components';

const defaultFilter: GoalFilter = {
	field: 'browser_name',
	operator: 'equals',
	value: '',
} as const;

interface EditGoalDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onSave: (data: Goal | Omit<CreateGoalData, 'websiteId'>) => Promise<void>;
	goal: Goal | null;
	isSaving: boolean;
	autocompleteData?: AutocompleteData;
}

export function EditGoalDialog({
	isOpen,
	onClose,
	onSave,
	goal,
	isSaving,
	autocompleteData,
}: EditGoalDialogProps) {
	const [formData, setFormData] = useState<
		Goal | Omit<CreateGoalData, 'websiteId'> | null
	>(null);
	const isCreateMode = !goal;

	useEffect(() => {
		if (goal) {
			setFormData({
				...goal,
				filters: goal.filters || [],
			});
		} else {
			// Initialize for create mode
			setFormData({
				name: '',
				description: '',
				type: 'PAGE_VIEW' as const,
				target: '',
				filters: [],
			});
		}
	}, [goal]);

	const handleSubmit = async () => {
		if (!formData) {
			return;
		}
		await onSave(formData);
	};

	const resetForm = useCallback(() => {
		if (isCreateMode) {
			setFormData({
				name: '',
				description: '',
				type: 'PAGE_VIEW' as const,
				target: '',
				filters: [],
			});
		}
	}, [isCreateMode]);

	const updateGoal = useCallback(
		(field: keyof Goal | keyof CreateGoalData, value: string) => {
			if (!formData) {
				return;
			}
			setFormData((prev) =>
				prev
					? {
							...prev,
							[field]: value,
						}
					: prev
			);
		},
		[formData]
	);

	const handleFiltersChange = useCallback((newFilters: GoalFilter[]) => {
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
			formData.target &&
			!(formData.filters || []).some((f) => !f.value || f.value === '')
		);
	}, [formData]);

	const getGoalIcon = (type: string) => {
		switch (type) {
			case 'PAGE_VIEW':
				return <Eye className="text-blue-600" size={16} weight="duotone" />;
			case 'EVENT':
				return (
					<MouseMiddleClick
						className="text-green-600"
						size={16}
						weight="duotone"
					/>
				);
			default:
				return (
					<Target
						className="text-muted-foreground"
						size={16}
						weight="duotone"
					/>
				);
		}
	};

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
								<Target
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
								{isCreateMode ? 'Create New Goal' : 'Edit Goal'}
							</SheetTitle>
							<SheetDescription className="mt-1 text-muted-foreground">
								{isCreateMode
									? 'Set up a new goal to track single-step conversions'
									: 'Update goal configuration and tracking settings'}
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
								Goal Name
							</Label>
							<Input
								className="rounded-lg border-border/50 transition-all duration-200 hover:border-border focus:border-primary/50 focus:ring-primary/20"
								id="edit-name"
								onChange={(e) =>
									setFormData((prev) =>
										prev ? { ...prev, name: e.target.value } : prev
									)
								}
								placeholder="e.g., Newsletter Signup"
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
								className="rounded-lg border-border/50 transition-all duration-200 hover:border-border focus:border-primary/50 focus:ring-primary/20"
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
							<Target
								className="h-5 w-5 text-primary"
								size={16}
								weight="duotone"
							/>
							<Label className="font-semibold text-base text-foreground">
								Goal Target
							</Label>
						</div>

						<div className="group flex items-center gap-4 rounded-xl border p-4 transition-all duration-200 hover:border-primary/30 hover:bg-accent/5 hover:shadow-sm">
							{/* Goal Number */}
							<div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 border-primary/20 bg-gradient-to-br from-primary to-primary/80 font-semibold text-primary-foreground text-sm shadow-sm transition-all duration-200 group-hover:shadow-md">
								1
							</div>

							{/* Goal Icon */}
							<div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted/50 transition-all duration-200 group-hover:bg-muted/70">
								{getGoalIcon(formData?.type || 'PAGE_VIEW')}
							</div>

							{/* Goal Fields */}
							<div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-3">
								<Select
									onValueChange={(value) => updateGoal('type', value)}
									value={formData?.type}
								>
									<SelectTrigger className="rounded-lg border-border/50 transition-all duration-200 hover:border-border focus:border-primary/50">
										<SelectValue />
									</SelectTrigger>
									<SelectContent className="rounded-lg">
										<SelectItem value="PAGE_VIEW">
											<div className="flex items-center gap-2">
												<Eye
													className="text-blue-600"
													size={14}
													weight="duotone"
												/>
												Page View
											</div>
										</SelectItem>
										<SelectItem value="EVENT">
											<div className="flex items-center gap-2">
												<MouseMiddleClick
													className="text-green-600"
													size={14}
													weight="duotone"
												/>
												Event
											</div>
										</SelectItem>
									</SelectContent>
								</Select>
								<AutocompleteInput
									className="rounded-lg border-border/50 transition-all duration-200 hover:border-border focus:border-primary/50 focus:ring-primary/20"
									onValueChange={(value) => updateGoal('target', value)}
									placeholder={
										formData?.type === 'PAGE_VIEW' ? '/path' : 'event_name'
									}
									suggestions={getStepSuggestions(
										formData?.type || 'PAGE_VIEW'
									)}
									value={formData?.target || ''}
								/>
								<Input
									className="rounded-lg border-border/50 transition-all duration-200 hover:border-border focus:border-primary/50 focus:ring-primary/20"
									onChange={(e) => updateGoal('name', e.target.value)}
									placeholder="Goal name"
									value={formData?.name || ''}
								/>
							</div>
						</div>
					</div>

					<div className="space-y-4">
						<div className="flex items-center gap-2">
							<Target
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
										className="group flex items-center gap-3 rounded-lg border bg-muted/30 p-3 transition-all duration-200 hover:bg-muted/40 hover:shadow-sm"
										key={`filter-${index}-${filter.field}-${filter.operator}`}
									>
										<Select
											onValueChange={(value) =>
												updateFilter(index, 'field', value)
											}
											value={filter.field}
										>
											<SelectTrigger className="w-40 rounded-lg border-border/50 transition-all duration-200 hover:border-border focus:border-primary/50">
												<SelectValue />
											</SelectTrigger>
											<SelectContent className="rounded-lg">
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
											<SelectTrigger className="w-32 rounded-lg border-border/50 transition-all duration-200 hover:border-border focus:border-primary/50">
												<SelectValue />
											</SelectTrigger>
											<SelectContent className="rounded-lg">
												{operatorOptions.map((option) => (
													<SelectItem key={option.value} value={option.value}>
														{option.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>

										<AutocompleteInput
											className="flex-1 rounded-lg border-border/50 transition-all duration-200 hover:border-border focus:border-primary/50 focus:ring-primary/20"
											onValueChange={(value) =>
												updateFilter(index, 'value', value)
											}
											placeholder="Filter value"
											suggestions={getSuggestions(filter.field)}
											value={(filter.value as string) || ''}
										/>

										<Button
											className="h-8 w-8 rounded-lg p-0 transition-all duration-200 hover:scale-105 hover:bg-destructive/10 hover:text-destructive"
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
							className="group rounded-lg border-2 border-primary/30 border-dashed transition-all duration-300 hover:border-primary/50 hover:bg-primary/5"
							onClick={() => addFilter()}
							size="sm"
							type="button"
							variant="outline"
						>
							<PlusIcon
								className="mr-2 h-4 w-4 transition-transform duration-300 group-hover:rotate-90"
								size={16}
							/>
							Add Filter
						</Button>
					</div>

					<div className="flex justify-end gap-3 border-border/50 border-t pt-6">
						<Button
							className="rounded-lg transition-all duration-200 hover:bg-muted"
							onClick={handleClose}
							type="button"
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							className="relative rounded-lg bg-gradient-to-r from-primary to-primary/90 shadow-lg transition-all duration-200 hover:from-primary/90 hover:to-primary hover:shadow-xl"
							disabled={!isFormValid || isSaving}
							onClick={handleSubmit}
						>
							{isSaving && (
								<div className="absolute left-3">
									<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
								</div>
							)}
							<span className={isSaving ? 'ml-6' : ''}>
								{isCreateMode
									? isSaving
										? 'Creating...'
										: 'Create Goal'
									: isSaving
										? 'Updating...'
										: 'Update Goal'}
							</span>
						</Button>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}
