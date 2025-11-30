"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlusIcon } from "@phosphor-icons/react";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useOrganizationInvitations } from "@/hooks/use-organization-invitations";

type InviteMemberDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
};

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
		<Dialog onOpenChange={handleClose} open={open}>
			<DialogContent className="max-w-md p-4">
				<div className="mb-3 flex items-center gap-3">
					<div className="rounded-full border bg-secondary p-2.5">
						<UserPlusIcon
							className="size-4 text-accent-foreground"
							weight="duotone"
						/>
					</div>
					<div>
						<DialogTitle className="font-medium text-base">
							Invite Member
						</DialogTitle>
						<DialogDescription className="text-muted-foreground text-xs">
							Send invitation to join organization
						</DialogDescription>
					</div>
				</div>

				<Form {...form}>
					<form className="space-y-3" onSubmit={form.handleSubmit(onSubmit)}>
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
												<SelectTrigger className="h-8 text-sm">
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
					</form>
				</Form>
				<DialogFooter>
					<Button
						className="flex-1"
						disabled={isInviting}
						onClick={handleClose}
						type="button"
						variant="secondary"
					>
						Cancel
					</Button>
					<Button
						className="flex-1"
						disabled={isInviting || !form.formState.isValid}
						type="submit"
					>
						{isInviting ? (
							<>
								<div className="mr-1 h-3 w-3 animate-spin rounded-full border border-primary-foreground/30 border-t-primary-foreground" />
								Sending...
							</>
						) : (
							<>
								<UserPlusIcon className="mr-1 h-3 w-3" weight="duotone" />
								Send Invite
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
