'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { FlaskIcon, PencilIcon } from '@phosphor-icons/react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
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
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import type { CreateExperimentData, Experiment } from '@/hooks/use-experiments';

const experimentFormSchema = z.object({
	name: z.string().min(1, 'Name is required'),
	description: z.string().optional(),
});

type ExperimentFormData = z.infer<typeof experimentFormSchema>;

const DEFAULT_FORM_VALUES: ExperimentFormData = {
	name: '',
	description: '',
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

export function ExperimentFormDialog({
	isOpen,
	onClose,
	onSave,
	experiment,
	isSaving = false,
}: ExperimentFormDialogProps) {
	const isEditMode = !!experiment;

	const getFormDefaults = (): ExperimentFormData => {
		if (!experiment) {
			return DEFAULT_FORM_VALUES;
		}

		return {
			name: experiment.name,
			description: experiment.description || '',
		};
	};

	const form = useForm<ExperimentFormData>({
		resolver: zodResolver(experimentFormSchema),
		defaultValues: getFormDefaults(),
	});

	const handleSubmit = async (data: ExperimentFormData) => {
		await onSave(data as Experiment | Omit<CreateExperimentData, 'websiteId'>);
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
				className="w-full overflow-y-auto p-4 sm:w-[600px]"
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
								{isEditMode ? 'Edit Experiment' : 'Create Experiment'}
							</SheetTitle>
							<SheetDescription className="mt-1 text-muted-foreground">
								{isEditMode
									? 'Update experiment details'
									: 'Create a new A/B experiment'}
							</SheetDescription>
						</div>
					</div>
				</SheetHeader>

				<Form {...form}>
					<form
						className="space-y-6 pt-6"
						onSubmit={form.handleSubmit(handleSubmit)}
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Experiment Name</FormLabel>
									<FormControl>
										<Input placeholder="e.g., Homepage CTA Test" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="description"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Description (optional)</FormLabel>
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
										: 'Update'
									: isSaving
										? 'Creating...'
										: 'Create'}
							</Button>
						</div>
					</form>
				</Form>
			</SheetContent>
		</Sheet>
	);
}
