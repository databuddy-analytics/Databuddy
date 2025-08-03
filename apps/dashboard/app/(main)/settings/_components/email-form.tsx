'use client';

import { authClient, useSession } from '@databuddy/auth/client';
import {
	ArrowClockwiseIcon,
	CheckCircleIcon,
	EnvelopeSimpleIcon,
	LockKeyIcon,
	ShieldCheckIcon,
	SparkleIcon,
	WarningIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { cn } from '@/lib/utils';

// Define form schema with validation
const formSchema = z.object({
	newEmail: z.string().email('Please enter a valid email address'),
	password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof formSchema>;

export function EmailForm() {
	const { data: session } = useSession();
	const [isLoading, setIsLoading] = useState(false);

	const form = useForm<FormValues>({
		defaultValues: {
			newEmail: '',
			password: '',
		},
	});

	async function onSubmit(data: FormValues) {
		setIsLoading(true);
		try {
			const response = await authClient.changeEmail({
				newEmail: data.newEmail,
			});

			if (response.error) {
				toast.error(response.error.message || 'Failed to update email');
			} else {
				form.reset();
				toast.success(
					'Email update request sent! Check your new email for verification.'
				);
			}

			form.reset();
		} catch (error: any) {
			toast.error(error.message || 'Failed to update email');
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<div className="fade-in slide-in-from-bottom-2 animate-in space-y-6 duration-300">
			{/* Current Email Display */}
			<Card className="border-muted/50 bg-gradient-to-br from-muted/20 to-muted/5">
				<CardContent className="p-4">
					<div className="flex flex-col-reverse items-start justify-between gap-2 lg:flex-row">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-full border border-blue-500/20 bg-gradient-to-br from-blue-500/20 to-blue-600/5">
								<EnvelopeSimpleIcon
									className="h-5 w-5 text-blue-600"
									size={20}
									weight="duotone"
								/>
							</div>
							<div>
								<p className="font-medium text-sm">Current Email</p>
								<p className="text-muted-foreground text-sm">
									{session?.user?.email || 'Not available'}
								</p>
							</div>
						</div>
						<div className="flex items-center gap-2">
							{session?.user?.emailVerified ? (
								<Badge className="text-xs" variant="secondary">
									<CheckCircleIcon
										className="mr-1 h-3 w-3"
										size={12}
										weight="fill"
									/>
									Verified
								</Badge>
							) : (
								<Badge
									className="border-amber-300 text-amber-600 text-xs"
									variant="outline"
								>
									<WarningIcon
										className="mr-1 h-3 w-3"
										size={12}
										weight="duotone"
									/>
									Unverified
								</Badge>
							)}
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Security Notice */}
			<Alert className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
				<ShieldCheckIcon
					className="h-4 w-4 text-blue-600"
					size={16}
					weight="duotone"
				/>
				<AlertDescription className="text-sm">
					<strong>Security Notice:</strong> Changing your email requires
					verification. You'll receive a confirmation link at your new email
					address.
				</AlertDescription>
			</Alert>

			{/* Form */}
			<Form {...form}>
				<form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
					<FormField
						control={form.control}
						name="newEmail"
						render={({ field }) => (
							<FormItem className="space-y-3">
								<FormLabel className="font-medium text-base">
									New Email Address
								</FormLabel>
								<FormControl>
									<div className="relative">
										<Input
											className={cn(
												'pl-10 transition-all duration-200',
												form.formState.errors.newEmail && 'border-destructive'
											)}
											placeholder="Enter your new email address"
											{...field}
										/>
										<EnvelopeSimpleIcon
											className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 transform text-muted-foreground"
											size={16}
											weight="duotone"
										/>
									</div>
								</FormControl>
								<FormDescription className="text-sm leading-relaxed">
									Enter the new email address you want to use for your account.
									You'll need to verify this email before the change takes
									effect.
								</FormDescription>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="password"
						render={({ field }) => (
							<FormItem className="space-y-3">
								<FormLabel className="font-medium text-base">
									Current Password
								</FormLabel>
								<FormControl>
									<div className="relative">
										<Input
											className={cn(
												'pl-10 transition-all duration-200',
												form.formState.errors.password && 'border-destructive'
											)}
											placeholder="Enter your current password"
											type="password"
											{...field}
										/>
										<LockKeyIcon
											className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 transform text-muted-foreground"
											size={16}
											weight="duotone"
										/>
									</div>
								</FormControl>
								<FormDescription className="text-sm leading-relaxed">
									Confirm your identity by entering your current password.
								</FormDescription>
								<FormMessage />
							</FormItem>
						)}
					/>

					{/* Action Button */}
					<div className="border-muted/50 border-t pt-4">
						<Button
							className="w-full transition-all duration-300 sm:w-auto sm:min-w-40"
							disabled={isLoading}
							type="submit"
						>
							{isLoading ? (
								<>
									<ArrowClockwiseIcon
										className="mr-2 h-4 w-4 animate-spin"
										size={16}
										weight="fill"
									/>
									Sending Request...
								</>
							) : (
								<>
									<EnvelopeSimpleIcon
										className="mr-2 h-4 w-4"
										size={16}
										weight="duotone"
									/>
									Update Email
								</>
							)}
						</Button>
					</div>
				</form>
			</Form>

			{/* Help Text */}
			<div className="rounded-lg border border-muted/50 bg-muted/30 p-4">
				<div className="flex items-start gap-3">
					<div className="rounded-md bg-primary/10 p-1">
						<SparkleIcon
							className="h-4 w-4 text-primary"
							size={16}
							weight="duotone"
						/>
					</div>
					<div className="text-sm">
						<p className="mb-1 font-medium">📧 Email Change Process</p>
						<ul className="space-y-1 text-muted-foreground leading-relaxed">
							<li>• A verification link will be sent to your new email</li>
							<li>• Click the link to confirm the email change</li>
							<li>• Your old email will remain active until verification</li>
							<li>• You'll be notified at both email addresses</li>
						</ul>
					</div>
				</div>
			</div>
		</div>
	);
}
