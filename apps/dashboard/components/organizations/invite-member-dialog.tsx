"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlusIcon } from "@phosphor-icons/react";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from "@/components/ui/form";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useOrganizationInvitations } from "@/hooks/use-organization-invitations";

interface InviteMemberDialogProps {
	onOpenChange: (open: boolean) => void;
	open: boolean;
	organizationId: string;
}

const formSchema = z.object({
	email: z.email("Please enter a valid email address"),
	role: z.enum(["admin", "member"]).refine((val) => val !== undefined, {
		message: "Please select a role",
	}),
});

type FormData = z.infer<typeof formSchema>;

export function InviteMemberDialog({
	open,
	onOpenChange,
	organizationId,
}: InviteMemberDialogProps) {
	const { inviteMember, isInviting } =
		useOrganizationInvitations(organizationId);

	const form = useForm<FormData>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			email: "",
			role: "member",
		},
	});

	const handleClose = () => {
		onOpenChange(false);
		form.reset();
	};

	const onSubmit = async (values: FormData) => {
		try {
			await inviteMember({
				email: values.email,
				role: values.role,
				organizationId,
			});
			handleClose();
		} catch {
			// Error is handled by the mutation toast
		}
	};

	return (
		<FormDialog
			description="Send invitation to join organization"
			icon={
				<UserPlusIcon
					className="size-5 text-accent-foreground"
					weight="duotone"
				/>
			}
			isSubmitting={isInviting}
			onOpenChange={handleClose}
			onSubmit={form.handleSubmit(onSubmit)}
			open={open}
			size="sm"
			submitDisabled={!form.formState.isValid}
			submitLabel="Send Invite"
			title="Invite Member"
		>
			<Form {...form}>
				<div className="flex gap-2">
					<FormField
						control={form.control}
						name="email"
						render={({ field }) => (
							<FormItem className="flex-1">
								<FormControl>
									<Input
										className="text-sm"
										placeholder="email@company.com"
										type="email"
										{...field}
									/>
								</FormControl>
								<FormMessage className="text-xs" />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="role"
						render={({ field }) => (
							<FormItem>
								<Select
									defaultValue={field.value}
									onValueChange={field.onChange}
								>
									<FormControl>
										<SelectTrigger className="h-10 w-[100px] text-sm">
											<SelectValue />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										<SelectItem value="member">Member</SelectItem>
										<SelectItem value="admin">Admin</SelectItem>
									</SelectContent>
								</Select>
								<FormMessage className="text-xs" />
							</FormItem>
						)}
					/>
				</div>
			</Form>
		</FormDialog>
	);
}
