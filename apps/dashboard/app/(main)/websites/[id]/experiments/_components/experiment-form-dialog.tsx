'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
	CodeIcon,
	Eye,
	FlaskIcon,
	LinkIcon,
	MouseMiddleClick,
	PencilIcon,
	PlusIcon,
	Target,
	TrashIcon,
} from '@phosphor-icons/react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
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
import { Textarea } from '@/components/ui/textarea';
import type { CreateExperimentData, Experiment } from '@/hooks/use-experiments';

// Validation patterns
const EVENT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

// Enhanced form schemas with better validation
const variantFormSchema = z.object({
	name: z
		.string()
		.min(1, 'Variant name is required')
		.max(100, 'Variant name must be 100 characters or less')
		.refine(
			(name) => name.trim().length > 0,
			'Variant name cannot be only whitespace'
		),
	type: z.enum(['visual', 'redirect', 'code']),
	content: z.unknown().default({}),
	trafficWeight: z
		.number()
		.min(0, 'Traffic weight must be at least 0%')
		.max(100, 'Traffic weight cannot exceed 100%'),
	isControl: z.boolean(),
});

const goalFormSchema = z.object({
	name: z
		.string()
		.min(1, 'Goal name is required')
		.max(100, 'Goal name must be 100 characters or less')
		.refine(
			(name) => name.trim().length > 0,
			'Goal name cannot be only whitespace'
		),
	type: z.string().min(1, 'Goal type is required'),
	target: z
		.string()
		.min(1, 'Target is required')
		.refine((target) => {
			// URL validation for PAGE_VIEW goals
			if (target.startsWith('/')) {
				return target.length > 1;
			}
			// Event name validation for EVENT goals
			return EVENT_NAME_PATTERN.test(target);
		}, 'Invalid target format'),
	description: z.string().optional(),
});

const experimentFormSchema = z
	.object({
		name: z
			.string()
			.min(1, 'Experiment name is required')
			.max(100, 'Experiment name must be 100 characters or less')
			.refine(
				(name) => name.trim().length > 0,
				'Experiment name cannot be only whitespace'
			),
		description: z.string().optional(),
		status: z.enum(['draft', 'running', 'paused', 'completed']),
		trafficAllocation: z
			.number()
			.min(1, 'Traffic allocation must be at least 1%')
			.max(100, 'Traffic allocation cannot exceed 100%'),
		startDate: z.string().optional(),
		endDate: z.string().optional(),
		primaryGoal: z.string().optional(),
		variants: z
			.array(variantFormSchema)
			.min(1, 'At least one variant is required')
			.max(10, 'Maximum 10 variants allowed'),
		goals: z.array(goalFormSchema).max(20, 'Maximum 20 goals allowed'),
	})
	.refine(
		(data) => {
			// Ensure traffic weights sum to approximately 100%
			const totalWeight = data.variants.reduce(
				(sum, variant) => sum + variant.trafficWeight,
				0
			);
			return Math.abs(totalWeight - 100) <= 5; // Allow 5% tolerance
		},
		{
			message: 'Variant traffic weights should sum to approximately 100%',
			path: ['variants'],
		}
	)
	.refine(
		(data) => {
			// Ensure only one control variant
			const controlCount = data.variants.filter((v) => v.isControl).length;
			return controlCount <= 1;
		},
		{
			message: 'Only one variant can be marked as control',
			path: ['variants'],
		}
	)
	.refine(
		(data) => {
			// Ensure variant names are unique
			const names = data.variants.map((v) => v.name.toLowerCase().trim());
			return new Set(names).size === names.length;
		},
		{
			message: 'Variant names must be unique',
			path: ['variants'],
		}
	);

type ExperimentFormData = z.infer<typeof experimentFormSchema>;

// Constants
const VARIANT_TYPES = ['visual', 'redirect', 'code'] as const;
const EXPERIMENT_STATUSES = [
	'draft',
	'running',
	'paused',
	'completed',
] as const;
const GOAL_TYPES = ['PAGE_VIEW', 'EVENT'] as const;

const DEFAULT_VARIANT: z.infer<typeof variantFormSchema> = {
	name: '',
	type: 'visual',
	content: {},
	trafficWeight: 50,
	isControl: false,
};

const DEFAULT_GOAL: z.infer<typeof goalFormSchema> = {
	name: '',
	type: 'PAGE_VIEW',
	target: '',
	description: '',
};

// Auto-calculate traffic weights
const redistributeTrafficWeights = (
	variants: ExperimentFormData['variants']
): ExperimentFormData['variants'] => {
	if (variants.length === 0) {
		return variants;
	}

	const equalWeight = Math.floor(100 / variants.length);
	const remainder = 100 - equalWeight * variants.length;

	return variants.map((variant, index) => ({
		...variant,
		trafficWeight: index === 0 ? equalWeight + remainder : equalWeight,
	}));
};

const DEFAULT_FORM_VALUES: ExperimentFormData = {
	name: '',
	description: '',
	status: 'draft',
	trafficAllocation: 100,
	variants: [DEFAULT_VARIANT],
	goals: [],
};

interface ExperimentFormDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onSave: (
		data: Experiment | Omit<CreateExperimentData, 'websiteId'>
	) => Promise<void>;
	experiment?: Experiment | null;
	isSaving?: boolean;
}

// Icon utilities
const getVariantIcon = (type: string) => {
	const iconProps = { size: 16, weight: 'duotone' as const };
	switch (type) {
		case 'visual':
			return <Eye className="text-blue-600" {...iconProps} />;
		case 'redirect':
			return <LinkIcon className="text-green-600" {...iconProps} />;
		case 'code':
			return <CodeIcon className="text-purple-600" {...iconProps} />;
		default:
			return <FlaskIcon className="text-muted-foreground" {...iconProps} />;
	}
};

const getGoalIcon = (type: string) => {
	const iconProps = { size: 16, weight: 'duotone' as const };
	switch (type) {
		case 'PAGE_VIEW':
			return <Eye className="text-blue-600" {...iconProps} />;
		case 'EVENT':
			return <MouseMiddleClick className="text-green-600" {...iconProps} />;
		default:
			return <Target className="text-muted-foreground" {...iconProps} />;
	}
};

// Reusable components
interface VariantFormItemProps {
	index: number;
	onRemove: () => void;
	canRemove: boolean;
	form: ReturnType<typeof useForm<ExperimentFormData>>;
}

function VariantFormItem({
	index,
	onRemove,
	canRemove,
	form,
}: VariantFormItemProps) {
	const variantType = form.watch(`variants.${index}.type`);
	const allVariants = form.watch('variants');

	// Calculate total weight for validation feedback
	const totalWeight = allVariants.reduce(
		(sum, variant) => sum + (variant?.trafficWeight || 0),
		0
	);

	return (
		<div className="group flex items-center gap-4 rounded-xl border p-4 transition-all duration-200 hover:border-primary/30 hover:bg-accent/5">
			<div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 border-primary/20 bg-gradient-to-br from-primary to-primary/80 font-semibold text-primary-foreground text-sm">
				{index + 1}
			</div>

			<div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted/50">
				{getVariantIcon(variantType)}
			</div>

			<div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-4">
				<FormField
					control={form.control}
					name={`variants.${index}.name`}
					render={({ field }) => (
						<FormItem>
							<FormControl>
								<Input placeholder="Variant name" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name={`variants.${index}.type`}
					render={({ field }) => (
						<FormItem>
							<Select defaultValue={field.value} onValueChange={field.onChange}>
								<FormControl>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{VARIANT_TYPES.map((type) => (
										<SelectItem key={type} value={type}>
											<div className="flex items-center gap-2">
												{getVariantIcon(type)}
												{type.charAt(0).toUpperCase() + type.slice(1)}
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name={`variants.${index}.trafficWeight`}
					render={({ field }) => (
						<FormItem>
							<FormControl>
								<div className="space-y-1">
									<Input
										max={100}
										min={0}
										placeholder="50"
										type="number"
										{...field}
										onChange={(e) =>
											field.onChange(Number.parseInt(e.target.value, 10) || 0)
										}
									/>
									{index === allVariants.length - 1 && totalWeight !== 100 && (
										<div className="flex items-center justify-between text-muted-foreground text-xs">
											<span>Total: {totalWeight}%</span>
											<Button
												className="h-auto p-0 text-xs"
												onClick={() => {
													const redistributed =
														redistributeTrafficWeights(allVariants);
													redistributed.forEach((variant, i) => {
														form.setValue(
															`variants.${i}.trafficWeight`,
															variant.trafficWeight
														);
													});
												}}
												size="sm"
												type="button"
												variant="ghost"
											>
												Auto-balance
											</Button>
										</div>
									)}
								</div>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name={`variants.${index}.isControl`}
					render={({ field }) => (
						<FormItem className="flex items-center gap-2 space-y-0">
							<FormControl>
								<Checkbox
									checked={field.value}
									onCheckedChange={field.onChange}
								/>
							</FormControl>
							<FormLabel className="font-normal text-sm">Control</FormLabel>
						</FormItem>
					)}
				/>
			</div>

			{canRemove && (
				<Button
					className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
					onClick={onRemove}
					size="sm"
					type="button"
					variant="ghost"
				>
					<TrashIcon className="h-4 w-4" size={16} />
				</Button>
			)}
		</div>
	);
}

interface GoalFormItemProps {
	index: number;
	onRemove: () => void;
	form: ReturnType<typeof useForm<ExperimentFormData>>;
}

function GoalFormItem({ index, onRemove, form }: GoalFormItemProps) {
	const goalType = form.watch(`goals.${index}.type`);

	return (
		<div className="group flex items-center gap-3 rounded-lg border bg-muted/30 p-3 hover:bg-muted/40">
			<div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted/50">
				{getGoalIcon(goalType)}
			</div>

			<div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-4">
				<FormField
					control={form.control}
					name={`goals.${index}.name`}
					render={({ field }) => (
						<FormItem>
							<FormControl>
								<Input placeholder="Goal name" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name={`goals.${index}.type`}
					render={({ field }) => (
						<FormItem>
							<Select defaultValue={field.value} onValueChange={field.onChange}>
								<FormControl>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{GOAL_TYPES.map((type) => (
										<SelectItem key={type} value={type}>
											<div className="flex items-center gap-2">
												{getGoalIcon(type)}
												{type.replace('_', ' ')}
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name={`goals.${index}.target`}
					render={({ field }) => (
						<FormItem>
							<FormControl>
								<Input
									placeholder={
										goalType === 'PAGE_VIEW' ? '/path' : 'event_name'
									}
									{...field}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name={`goals.${index}.description`}
					render={({ field }) => (
						<FormItem>
							<FormControl>
								<Input placeholder="Description" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
			</div>

			<Button
				className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
				onClick={onRemove}
				size="sm"
				type="button"
				variant="ghost"
			>
				<TrashIcon className="h-4 w-4" size={16} />
			</Button>
		</div>
	);
}

export function ExperimentFormDialog({
	isOpen,
	onClose,
	onSave,
	experiment,
	isSaving = false,
}: ExperimentFormDialogProps) {
	const isEditMode = !!experiment;

	// Convert experiment data for form or use defaults
	const getFormDefaults = (): ExperimentFormData => {
		if (!experiment) {
			return DEFAULT_FORM_VALUES;
		}

		return {
			name: experiment.name,
			description: experiment.description || '',
			status: experiment.status,
			trafficAllocation: experiment.trafficAllocation,
			startDate: experiment.startDate || undefined,
			endDate: experiment.endDate || undefined,
			primaryGoal: experiment.primaryGoal || undefined,
			variants: experiment.variants || [DEFAULT_VARIANT],
			goals:
				experiment.goals?.map((goal) => ({
					name: goal.name,
					type: goal.type,
					target: goal.target,
					description: goal.description || undefined,
				})) || [],
		};
	};

	const form = useForm<ExperimentFormData>({
		resolver: zodResolver(experimentFormSchema),
		defaultValues: getFormDefaults(),
	});

	const variants = useFieldArray({
		control: form.control,
		name: 'variants',
	});

	const goals = useFieldArray({
		control: form.control,
		name: 'goals',
	});

	const handleSubmit = async (data: ExperimentFormData) => {
		const submitData = {
			...data,
			description: data.description || undefined,
		};

		await onSave(
			submitData as Experiment | Omit<CreateExperimentData, 'websiteId'>
		);

		if (!isEditMode) {
			form.reset(DEFAULT_FORM_VALUES);
		}
	};

	const handleClose = () => {
		onClose();
		if (!isEditMode) {
			form.reset(DEFAULT_FORM_VALUES);
		}
	};

	return (
		<Sheet onOpenChange={handleClose} open={isOpen}>
			<SheetContent
				className="w-full overflow-y-auto p-4 sm:w-[80vw] sm:max-w-[1400px]"
				side="right"
			>
				<SheetHeader className="space-y-3 border-border/50 border-b pb-6">
					<div className="flex items-center gap-3">
						<div className="rounded border border-primary/20 bg-primary/10 p-3">
							{isEditMode ? (
								<PencilIcon
									className="h-6 w-6 text-primary"
									size={16}
									weight="duotone"
								/>
							) : (
								<FlaskIcon
									className="h-6 w-6 text-primary"
									size={16}
									weight="duotone"
								/>
							)}
						</div>
						<div>
							<SheetTitle className="font-semibold text-foreground text-xl">
								{isEditMode ? 'Edit Experiment' : 'Create New Experiment'}
							</SheetTitle>
							<SheetDescription className="mt-1 text-muted-foreground">
								{isEditMode
									? 'Update experiment configuration and variants'
									: 'Set up a new A/B experiment to test different variants'}
							</SheetDescription>
						</div>
					</div>
				</SheetHeader>

				<Form {...form}>
					<form
						className="space-y-8 pt-6"
						onSubmit={form.handleSubmit(handleSubmit)}
					>
						{/* Basic Information */}
						<div className="space-y-6">
							<div className="flex items-center gap-2">
								<FlaskIcon
									className="h-5 w-5 text-primary"
									size={16}
									weight="duotone"
								/>
								<h3 className="font-semibold text-base text-foreground">
									Experiment Details
								</h3>
							</div>

							<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Experiment Name</FormLabel>
											<FormControl>
												<Input
													placeholder="e.g., Homepage CTA Test"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="status"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Status</FormLabel>
											<Select
												defaultValue={field.value}
												onValueChange={field.onChange}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Select status" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{EXPERIMENT_STATUSES.map((status) => (
														<SelectItem key={status} value={status}>
															{status.charAt(0).toUpperCase() + status.slice(1)}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							<FormField
								control={form.control}
								name="description"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Description</FormLabel>
										<FormControl>
											<Textarea
												placeholder="Describe what you're testing..."
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="trafficAllocation"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Traffic Allocation (%)</FormLabel>
										<FormControl>
											<Input
												max={100}
												min={0}
												placeholder="100"
												type="number"
												{...field}
												onChange={(e) =>
													field.onChange(
														Number.parseInt(e.target.value, 10) || 0
													)
												}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						{/* Variants Section */}
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<FlaskIcon
										className="h-5 w-5 text-primary"
										size={16}
										weight="duotone"
									/>
									<h3 className="font-semibold text-base text-foreground">
										Variants
									</h3>
								</div>
								<Button
									className="border-dashed"
									onClick={() => {
										const currentVariants = form.getValues('variants');
										const newVariant = {
											...DEFAULT_VARIANT,
											name: `Variant ${currentVariants.length + 1}`,
											trafficWeight: Math.floor(
												100 / (currentVariants.length + 1)
											),
										};
										variants.append(newVariant);

										// Auto-redistribute weights for all variants
										setTimeout(() => {
											const allVariants = form.getValues('variants');
											const redistributed =
												redistributeTrafficWeights(allVariants);
											redistributed.forEach((variant, i) => {
												form.setValue(
													`variants.${i}.trafficWeight`,
													variant.trafficWeight
												);
											});
										}, 0);
									}}
									size="sm"
									type="button"
									variant="outline"
								>
									<PlusIcon className="mr-2 h-4 w-4" size={16} />
									Add Variant
								</Button>
							</div>

							<div className="space-y-3">
								{variants.fields.map((field, index) => (
									<VariantFormItem
										canRemove={variants.fields.length > 1}
										form={form}
										index={index}
										key={field.id}
										onRemove={() => {
											variants.remove(index);
											// Auto-redistribute weights after removal
											const remainingVariants = form
												.getValues('variants')
												.filter((_, i) => i !== index);
											if (remainingVariants.length > 0) {
												const redistributed =
													redistributeTrafficWeights(remainingVariants);
												redistributed.forEach((variant, i) => {
													// Skip the removed index
													const actualIndex = i >= index ? i + 1 : i;
													if (
														actualIndex < variants.fields.length &&
														actualIndex !== index
													) {
														form.setValue(
															`variants.${i}.trafficWeight`,
															variant.trafficWeight
														);
													}
												});
											}
										}}
									/>
								))}
							</div>
						</div>

						{/* Goals Section */}
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<Target
										className="h-5 w-5 text-primary"
										size={16}
										weight="duotone"
									/>
									<h3 className="font-semibold text-base text-foreground">
										Goals
									</h3>
									<span className="text-muted-foreground text-xs">
										(optional)
									</span>
								</div>
								<Button
									className="border-dashed"
									onClick={() => goals.append(DEFAULT_GOAL)}
									size="sm"
									type="button"
									variant="outline"
								>
									<PlusIcon className="mr-2 h-4 w-4" size={16} />
									Add Goal
								</Button>
							</div>

							{goals.fields.length > 0 && (
								<div className="space-y-3">
									{goals.fields.map((field, index) => (
										<GoalFormItem
											form={form}
											index={index}
											key={field.id}
											onRemove={() => goals.remove(index)}
										/>
									))}
								</div>
							)}
						</div>

						{/* Action Buttons */}
						<div className="flex justify-end gap-3 border-border/50 border-t pt-6">
							<Button onClick={handleClose} type="button" variant="outline">
								Cancel
							</Button>
							<Button disabled={isSaving} type="submit">
								{isSaving && (
									<div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
								)}
								{isEditMode
									? isSaving
										? 'Updating...'
										: 'Update Experiment'
									: isSaving
										? 'Creating...'
										: 'Create Experiment'}
							</Button>
						</div>
					</form>
				</Form>
			</SheetContent>
		</Sheet>
	);
}
