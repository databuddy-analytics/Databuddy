"use client";

import { authClient, useSession } from "@databuddy/auth/client";
import {
	ArrowClockwiseIcon,
	CheckCircleIcon,
	EnvelopeSimpleIcon,
	LockKeyIcon,
	ShieldCheckIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { NoticeBanner } from "@/app/(main)/websites/_components/notice-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Define form schema with validation
const formSchema = z.object({
	newEmail: z.string().email("Please enter a valid email address"),
	password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof formSchema>;

export function EmailForm() {
	const { data: session } = useSession();
	const [isLoading, setIsLoading] = useState(false);

	const form = useForm<FormValues>({
		defaultValues: {
			newEmail: "",
			password: "",
		},
	});

	async function onSubmit(data: FormValues) {
		setIsLoading(true);
		try {
			const response = await authClient.changeEmail({
				newEmail: data.newEmail,
			});

			if (response.error) {
				toast.error(response.error.message || "Failed to update email");
			} else {
				form.reset();
				toast.success(
					"Email update request sent! Check your new email for verification."
				);
			}

			form.reset();
		} catch (error: any) {
			toast.error(error.message || "Failed to update email");
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<div className="fade-in slide-in-from-bottom-2 animate-in space-y-6 duration-300">
			{/* Current Email Display */}
			<Card className="bg-accent-brighter">
				<CardContent>
					<div className="flex flex-col-reverse items-center justify-between gap-2 lg:flex-row">
						<div className="flex items-center gap-3">
							<div className="flex size-10 items-center justify-center rounded-full bg-accent-foreground">
								<EnvelopeSimpleIcon
									className="size-5 text-accent"
									size={20}
									weight="duotone"
								/>
							</div>
							<div>
								<p className="font-medium text-sm">Current Email</p>
								<p className="text-[13px] text-muted-foreground">
									{session?.user?.email || "Not available"}
								</p>
							</div>
						</div>
						<div className="flex items-center gap-2">
							{session?.user?.emailVerified ? (
								<Badge className="text-xs" variant="secondary">
									<CheckCircleIcon className="size-3" size={12} weight="fill" />
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
			<NoticeBanner
				description="Changing your email requires verification. You'll receive a confirmation link at your new email address."
				icon={<ShieldCheckIcon size={16} weight="duotone" />}
				title="Security Notice"
			/>

			{/* Form */}
			<Form {...form}>
				<form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
					<FormField
						control={form.control}
						name="newEmail"
						render={({ field }) => (
							<FormItem className="gap-0">
								<FormLabel className="font-medium text-base">
									New Email Address
								</FormLabel>
								<FormDescription className="text-sm leading-relaxed">
									Change the email address you want to use for your account.
								</FormDescription>
								<FormControl>
									<div className="relative mt-3">
										<Input
											className={cn(
												"pl-9 transition-all duration-200",
												form.formState.errors.newEmail && "border-destructive"
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
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="password"
						render={({ field }) => (
							<FormItem className="gap-0">
								<FormLabel className="font-medium text-base">
									Current Password
								</FormLabel>
								<FormDescription className="text-sm leading-relaxed">
									Confirm your identity by entering your current password.
								</FormDescription>
								<FormControl>
									<div className="relative mt-3">
										<Input
											className={cn(
												"pl-9 transition-all duration-200",
												form.formState.errors.password && "border-destructive"
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
								<FormMessage />
							</FormItem>
						)}
					/>

					{/* Action Button */}
					<Button
						className="w-full transition-all duration-300 sm:w-fit"
						disabled={isLoading}
						type="submit"
					>
						{isLoading ? (
							<>
								<ArrowClockwiseIcon
									className="size-4 animate-spin"
									size={16}
									weight="fill"
								/>
								Sending Request...
							</>
						) : (
							<>
								<EnvelopeSimpleIcon
									className="size-4"
									size={16}
									weight="duotone"
								/>
								Update Email
							</>
						)}
					</Button>
				</form>
			</Form>
		</div>
	);
}
