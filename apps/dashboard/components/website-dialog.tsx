'use client';

import { authClient } from '@databuddy/auth/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoaderCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import type { CreateWebsiteData, Website } from '@/hooks/use-websites';
import { useCreateWebsite, useUpdateWebsite } from '@/hooks/use-websites';

const formSchema = z.object({
	name: z.string().min(1, 'Name is required'),
	domain: z
		.string()
		.min(1, 'Domain is required')
		.regex(
			/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/,
			'Invalid domain format'
		),
});

type FormData = z.infer<typeof formSchema>;

interface WebsiteDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	website?: Website | null;
	onSave?: (website: Website) => void;
}

export function WebsiteDialog({
	open,
	onOpenChange,
	website,
	onSave,
}: WebsiteDialogProps) {
	const isEditing = !!website;
	const { data: activeOrganization } = authClient.useActiveOrganization();
	const formRef = useRef<HTMLFormElement>(null);

	const createWebsiteMutation = useCreateWebsite();
	const updateWebsiteMutation = useUpdateWebsite();

	const form = useForm<FormData>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: '',
			domain: '',
		},
	});

	useEffect(() => {
		if (website) {
			form.reset({ name: website.name || '', domain: website.domain || '' });
		} else {
			form.reset({ name: '', domain: '' });
		}
	}, [website, form]);

	const handleSubmit = form.handleSubmit(async (formData) => {
		const submissionData: CreateWebsiteData = {
			name: formData.name,
			domain: formData.domain,
			organizationId: activeOrganization?.id,
		};

		try {
			if (isEditing) {
				const result = await updateWebsiteMutation.mutateAsync({ 
					id: website.id, 
					name: formData.name 
				});
				if (onSave) onSave(result);
				toast.success('Website updated successfully!');
			} else {
				const result = await createWebsiteMutation.mutateAsync(submissionData);
				if (onSave) onSave(result);
				toast.success('Website created successfully!');
			}
			onOpenChange(false);
		} catch (error: any) {
			const message = error.data?.code === 'CONFLICT'
				? 'A website with this domain already exists.'
				: `Failed to ${isEditing ? 'update' : 'create'} website.`;
			toast.error(message);
		}
	});

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="w-[95vw] max-w-md sm:w-full">
				<DialogHeader>
					<DialogTitle>
						{isEditing ? 'Edit Website' : 'Create a new website'}
					</DialogTitle>
					<DialogDescription>
						{isEditing
							? 'Update the details of your existing website.'
							: 'Create a new website to start tracking analytics.'}
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form className="space-y-4" onSubmit={handleSubmit} ref={formRef}>
						<fieldset
							className="space-y-4"
							disabled={
								createWebsiteMutation.isPending ||
								updateWebsiteMutation.isPending
							}
						>
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Name</FormLabel>
										<FormControl>
											<Input placeholder="Your project's name" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="domain"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Domain</FormLabel>
										<FormControl>
											<div className="flex items-center">
												<span className="inline-flex h-10 items-center rounded-l-md border border-input border-r-0 bg-muted px-3 text-muted-foreground text-sm">
													https://
												</span>
												<Input
													placeholder="your-company.com"
													{...field}
													className="rounded-l-none"
													onChange={(e) => {
														let domain = e.target.value.trim();
														if (
															domain.startsWith('http://') ||
															domain.startsWith('https://')
														) {
															try {
																domain = new URL(domain).hostname;
															} catch {}
														}
														field.onChange(domain.replace(/^www\./, ''));
													}}
												/>
											</div>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</fieldset>
					</form>
				</Form>
				<DialogFooter>
					<Button
						className="w-full sm:w-auto"
						disabled={
							createWebsiteMutation.isPending || updateWebsiteMutation.isPending
						}
						form="form"
						onClick={handleSubmit}
						type="submit"
					>
						{(createWebsiteMutation.isPending ||
							updateWebsiteMutation.isPending) && (
							<LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
						)}
						{isEditing ? 'Save changes' : 'Create website'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
