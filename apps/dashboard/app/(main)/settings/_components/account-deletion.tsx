'use client';

import { authClient, useSession } from '@databuddy/auth/client';
import {
	ArrowClockwiseIcon,
	InfoIcon,
	ShieldCheckIcon,
	TrashIcon,
	WarningIcon,
} from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
import { Separator } from '@/components/ui/separator';

// Define form schema with validation
const formSchema = z.object({
	email: z.string().email('Please enter a valid email address'),
	password: z.string().min(1, 'Password is required'),
	confirmText: z.string().min(1, 'Please type "DELETE" to confirm'),
});

export function AccountDeletion() {
	const { data: session } = useSession();
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(false);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const formRef = useRef<HTMLFormElement>(null);

	const form = useForm<z.infer<typeof formSchema>>({
		defaultValues: {
			email: '',
			password: '',
			confirmText: '',
		},
	});

	async function onSubmit(data: z.infer<typeof formSchema>) {
		if (data.email !== session?.user?.email) {
			toast.error("Email doesn't match your account email");
			return;
		}

		setIsLoading(true);

		try {
			const { data } = await authClient.deleteUser({ callbackURL: '/login' });

			if (data?.success) {
				toast.success('Your account has been scheduled for deletion');
				form.reset();
				setIsDialogOpen(false);

				await authClient.signOut();
				router.push('/login');
			} else if (data?.message) {
				toast.error(data.message);
			} else {
				toast.error('Failed to process account deletion');
			}
		} catch (error: unknown) {
			if (error instanceof Error) {
				toast.error(error.message || 'Failed to process account deletion');
			} else {
				toast.error('Failed to process account deletion');
			}
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<div>
			<div className="flex flex-col justify-between space-y-4 rounded-lg border border-red-900/20 bg-gradient-to-r from-red-950/20 to-red-900/10 p-4 md:flex-row md:items-center md:space-x-6 md:space-y-0">
				<div className="flex-1 space-y-2">
					<div className="flex items-center">
						<ShieldCheckIcon
							className="mr-2 h-5 w-5 text-red-500"
							size={20}
							weight="fill"
						/>
						<h3 className="font-medium text-base text-red-400">
							Account Deletion
						</h3>
					</div>
					<p className="text-slate-700 text-sm">
						Deleting your account will remove all your data and cannot be
						reversed after the grace period.
					</p>
					<div className="mt-1 hidden text-slate-600 text-xs italic md:block">
						A 30-day recovery window will be available before permanent
						deletion.
					</div>
				</div>
				<AlertDialog onOpenChange={setIsDialogOpen} open={isDialogOpen}>
					<AlertDialogTrigger asChild>
						<Button
							className="border border-red-800/50 bg-red-900/60 px-4 text-white hover:bg-red-800"
							size="sm"
							variant="destructive"
						>
							<TrashIcon className="mr-2 h-4 w-4" size={16} weight="duotone" />
							Delete Account
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent className="max-w-xl border border-red-900/30 bg-slate-950">
						<AlertDialogHeader className="pt-6">
							<AlertDialogTitle className="text-center text-red-400 text-xl">
								<div className="flex items-center justify-center gap-2 rounded-full bg-red-500 p-2 text-white">
									<WarningIcon
										className="h-6 w-6 bg-red-500 text-white"
										size={24}
										weight="duotone"
									/>
									Delete Your Account
								</div>
							</AlertDialogTitle>
							<AlertDialogDescription className="text-center text-slate-300">
								This action will schedule your account for deletion after a
								30-day grace period.
							</AlertDialogDescription>
						</AlertDialogHeader>

						<div className="my-4 rounded-md border border-red-900/20 bg-red-950/20 p-4">
							<div className="space-y-3 text-slate-300 text-sm">
								<div className="flex items-start">
									<InfoIcon
										className="mt-0.5 mr-2 h-4 w-4 flex-shrink-0 text-red-400"
										size={16}
										weight="duotone"
									/>
									<p>
										<span className="font-medium text-red-400">
											Immediate effects:
										</span>{' '}
										Your account will be deactivated and you&apos;ll be signed
										out from all devices.
									</p>
								</div>
								<div className="flex items-start">
									<InfoIcon
										className="mt-0.5 mr-2 h-4 w-4 flex-shrink-0 text-red-400"
										size={16}
										weight="duotone"
									/>
									<p>
										<span className="font-medium text-red-400">
											Recovery period:
										</span>{' '}
										You&apos;ll have 30 days to change your mind and recover
										your account.
									</p>
								</div>
								<div className="flex items-start">
									<InfoIcon
										className="mt-0.5 mr-2 h-4 w-4 flex-shrink-0 text-red-400"
										size={16}
										weight="duotone"
									/>
									<p>
										<span className="font-medium text-red-400">
											Permanent deletion:
										</span>{' '}
										After 30 days, all your data will be permanently deleted.
									</p>
								</div>
							</div>
						</div>

						<Separator className="bg-slate-800" />

						<Form {...form}>
							<form
								className="mt-5 space-y-5"
								onSubmit={form.handleSubmit(onSubmit)}
								ref={formRef}
							>
								<FormField
									control={form.control}
									name="email"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="text-slate-300">
												Confirm your email
											</FormLabel>
											<FormControl>
												<Input
													placeholder={session?.user?.email || 'your@email.com'}
													{...field}
													className="border-slate-700 bg-slate-900/60"
												/>
											</FormControl>
											<FormMessage className="text-red-400" />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="password"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="text-slate-300">
												Your password
											</FormLabel>
											<FormControl>
												<Input
													placeholder="••••••••"
													type="password"
													{...field}
													className="border-slate-700 bg-slate-900/60"
												/>
											</FormControl>
											<FormMessage className="text-red-400" />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="confirmText"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="text-slate-300">
												Type "DELETE" to confirm
											</FormLabel>
											<FormControl>
												<Input
													placeholder="DELETE"
													{...field}
													className="border-slate-700 bg-slate-900/60 font-medium text-red-400 tracking-wide"
												/>
											</FormControl>
											<FormMessage className="text-red-400" />
										</FormItem>
									)}
								/>

								<AlertDialogFooter className="gap-0 sm:gap-3">
									<AlertDialogCancel className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white">
										Cancel
									</AlertDialogCancel>
									<Button
										className="border-red-600 bg-red-700 text-white hover:bg-red-800"
										disabled={isLoading}
										type="submit"
										variant="destructive"
									>
										{isLoading ? (
											<>
												<ArrowClockwiseIcon
													className="mr-2 h-4 w-4 animate-spin"
													size={16}
													weight="fill"
												/>
												Processing...
											</>
										) : (
											'Confirm Deletion'
										)}
									</Button>
								</AlertDialogFooter>
							</form>
						</Form>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</div>
	);
}
