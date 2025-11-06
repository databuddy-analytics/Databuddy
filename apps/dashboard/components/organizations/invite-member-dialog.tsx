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

interface InviteMemberDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
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
		<Dialog onOpenChange={handleClose} open={open}>
			<DialogContent className="max-w-md p-4">
				<div className="mb-3 flex items-center gap-3">
					<div className="rounded border border-primary/20 bg-primary/10 p-2">
						<UserPlusIcon className="h-4 w-4 text-primary" weight="duotone" />
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

						<div className="flex justify-end gap-2 pt-2">
							<Button
								className="h-8 px-3 text-xs"
								disabled={isInviting}
								onClick={handleClose}
								type="button"
								variant="outline"
							>
								Cancel
							</Button>
							<Button
								className="h-8 px-3 text-xs"
								disabled={isInviting}
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
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
