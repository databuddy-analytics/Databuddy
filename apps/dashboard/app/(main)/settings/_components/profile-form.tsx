'use client';

import { authClient, useSession } from '@databuddy/auth/client';
import { ArrowClockwiseIcon, CheckCircleIcon } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

// Define form schema with validation
const profileFormSchema = z.object({
	name: z
		.string()
		.min(2, 'Name must be at least 2 characters')
		.max(50, 'Name cannot exceed 50 characters'),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export function ProfileForm() {
	const { data: session } = useSession();
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(false);
	const [isSaved, setIsSaved] = useState(false);

	const form = useForm<ProfileFormValues>({
		defaultValues: {
			name: session?.user?.name || '',
		},
	});

	async function onSubmit(data: ProfileFormValues) {
		setIsLoading(true);
		setIsSaved(false);

		try {
			// Update user's name
			const response = await authClient.updateUser({
				name: data.name,
			});

			// Refresh the page to update the session data
			router.refresh();

			if (response.error) {
				toast.error(response.error.message || 'Failed to update profile');
			} else {
				toast.success('Profile updated successfully');
				setIsSaved(true);

				// Reset saved indicator after a delay
				setTimeout(() => setIsSaved(false), 3000);
			}
		} catch (error: any) {
			toast.error(error.message || 'Failed to update profile');
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<Form {...form}>
			<form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
				<FormField
					control={form.control}
					name="name"
					render={({ field }) => (
						<FormItem>
							<div className="flex items-center justify-between">
								<FormLabel>Display Name</FormLabel>
								{session?.user?.name !== form.watch('name') && (
									<span className="text-slate-400 text-xs">
										Unsaved changes
									</span>
								)}
							</div>
							<FormControl>
								<Input placeholder="Your name" {...field} />
							</FormControl>
							<FormDescription className="text-xs">
								This is your public display name visible to other users.
							</FormDescription>
							<FormMessage />
						</FormItem>
					)}
				/>

				<div className="flex justify-end">
					<Button
						className="flex items-center"
						disabled={isLoading || session?.user?.name === form.watch('name')}
						type="submit"
					>
						{isLoading ? (
							<>
								<ArrowClockwiseIcon
									className="mr-2 h-4 w-4 animate-spin"
									size={16}
									weight="fill"
								/>
								Saving...
							</>
						) : isSaved ? (
							<>
								<CheckCircleIcon
									className="mr-2 h-4 w-4"
									size={16}
									weight="fill"
								/>
								Saved
							</>
						) : (
							'Save Changes'
						)}
					</Button>
				</div>
			</form>
		</Form>
	);
}
