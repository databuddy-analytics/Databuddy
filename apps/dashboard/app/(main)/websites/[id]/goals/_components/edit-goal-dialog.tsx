"use client";

import { AutocompleteInput } from "@/components/ui/autocomplete-input";
import { FilterRow } from "@/components/ui/filter-row";
import type { AutocompleteData } from "@/hooks/use-autocomplete";
import { goalFunnelOperatorOptions, useFilters } from "@/hooks/use-filters";
import type { CreateGoalData, Goal } from "@/hooks/use-goals";
import { filterOptions } from "@databuddy/shared/lists/filters";
import type { GoalFilter } from "@databuddy/shared/types/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FunnelSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import { GearIcon, PlusIcon, TargetIcon as Target } from "@databuddy/ui/icons";
import { Button, Divider, Field, Input, Text } from "@databuddy/ui";
import { Accordion, DropdownMenu, Sheet, Switch } from "@databuddy/ui/client";

const defaultFilter: GoalFilter = {
	field: "browser_name",
	operator: "equals",
	value: "",
} as const;

interface GoalFormData {
	description: string | null;
	filters: GoalFilter[];
	id?: string;
	ignoreHistoricData?: boolean;
	name: string;
	target: string;
	type: string;
}

interface EditGoalDialogProps {
	autocompleteData?: AutocompleteData;
	goal: Goal | null;
	isOpen: boolean;
	isSaving: boolean;
	onClose: () => void;
	onSave: (data: Goal | Omit<CreateGoalData, "websiteId">) => Promise<void>;
}

export function EditGoalDialog({
	isOpen,
	onClose,
	onSave,
	goal,
	isSaving,
	autocompleteData,
}: EditGoalDialogProps) {
	const [formData, setFormData] = useState<GoalFormData | null>(null);
	const isCreateMode = !goal;

	useEffect(() => {
		if (goal) {
			const sanitizedFilters = ((goal.filters as GoalFilter[]) || []).map(
				(f) => ({
					...f,
					operator: f.operator || "equals",
				})
			);
			setFormData({
				id: goal.id,
				name: goal.name,
				description: goal.description,
				type: goal.type,
				target: goal.target,
				filters: sanitizedFilters,
				ignoreHistoricData: goal.ignoreHistoricData ?? false,
			});
		} else {
			setFormData({
				name: "",
				description: "",
				type: "PAGE_VIEW",
				target: "",
				filters: [],
				ignoreHistoricData: false,
			});
		}
	}, [goal]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!formData) {
			return;
		}
		const sanitizedFilters = formData.filters.map((f) => ({
			...f,
			operator: f.operator || "equals",
		}));
		await onSave({
			...formData,
			filters: sanitizedFilters,
		} as Goal | Omit<CreateGoalData, "websiteId">);
	};

	const resetForm = useCallback(() => {
		setFormData({
			name: "",
			description: "",
			type: "PAGE_VIEW",
			target: "",
			filters: [],
			ignoreHistoricData: false,
		});
	}, []);

	const updateField = useCallback(
		(field: keyof GoalFormData, value: string) => {
			setFormData((prev) => (prev ? { ...prev, [field]: value } : prev));
		},
		[]
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

	const getTargetSuggestions = useCallback(
		(goalType: string): string[] => {
			if (!autocompleteData) {
				return [];
			}
			if (goalType === "PAGE_VIEW") {
				return autocompleteData.pagePaths || [];
			}
			if (goalType === "EVENT") {
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
		const hasEmptyFilter = formData.filters.some((f) => !f.value);
		return formData.name && formData.target && !hasEmptyFilter;
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
							<Target className="size-5 text-primary" weight="fill" />
						</div>
						<div>
							<Sheet.Title className="text-lg">
								{isCreateMode ? "New Goal" : formData.name || "Edit Goal"}
							</Sheet.Title>
							<Sheet.Description>
								{isCreateMode
									? "Track single-step conversions"
									: "Update goal settings"}
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
									onChange={(e) => updateField("name", e.target.value)}
									placeholder="e.g., Newsletter Signup"
									value={formData.name}
								/>
							</Field>
							<Field>
								<Field.Label>
									Description{" "}
									<span className="text-muted-foreground">(optional)</span>
								</Field.Label>
								<Input
									onChange={(e) => updateField("description", e.target.value)}
									placeholder="What this goal tracks"
									value={formData.description || ""}
								/>
							</Field>
						</div>

						<Divider />

						<div className="space-y-2">
							<Text variant="label">Target</Text>
							<div className="flex items-center gap-2 rounded-md border border-border/60 p-3">
								<div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-foreground font-semibold text-accent text-xs">
									1
								</div>
								<div className="flex flex-1 gap-2">
									<DropdownMenu>
										<DropdownMenu.Trigger className="flex h-8 w-28 shrink-0 cursor-pointer select-none items-center justify-between rounded-md bg-secondary px-3 text-foreground text-xs transition-colors hover:bg-interactive-hover">
											{formData.type === "PAGE_VIEW" ? "Page View" : "Event"}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="start" side="bottom">
											<DropdownMenu.RadioGroup
												onValueChange={(value) => updateField("type", value)}
												value={formData.type}
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
										className="flex-1"
										inputClassName="h-8 text-xs"
										onValueChange={(value) => updateField("target", value)}
										placeholder={
											formData.type === "PAGE_VIEW" ? "/path" : "event_name"
										}
										suggestions={getTargetSuggestions(formData.type)}
										value={formData.target}
									/>
								</div>
							</div>
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
													Only count events after this goal was created
												</Text>
											</div>
											<Switch
												checked={formData.ignoreHistoricData ?? false}
												onCheckedChange={(checked) =>
													setFormData((prev) =>
														prev
															? { ...prev, ignoreHistoricData: checked }
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
										{formData.filters.length > 0 && (
											<span className="ml-auto flex size-5 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
												{formData.filters.length}
											</span>
										)}
									</Accordion.Trigger>
									<Accordion.Content>
										{formData.filters.length > 0 && (
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
						<Button disabled={!isFormValid} loading={isSaving} type="submit">
							{isCreateMode ? "Create Goal" : "Save Changes"}
						</Button>
					</Sheet.Footer>
				</Sheet.Form>
				<Sheet.Close />
			</Sheet.Content>
		</Sheet>
	);
}
