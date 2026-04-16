"use client";

import { track } from "@databuddy/sdk";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	EnvelopeSimpleIcon,
	SpinnerIcon,
	UsersIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const formSchema = z.object({
	email: z.string().email("Enter a valid email address"),
	role: z.enum(["admin", "member"]),
});

type FormData = z.infer<typeof formSchema>;

interface SentInvite {
	email: string;
	role: string;
}

export function StepInviteTeam() {
	const { activeOrganization } = useOrganizationsContext();
	const organizationId = activeOrganization?.id ?? "";
	const { inviteMember, isInviting } =
		useOrganizationInvitations(organizationId);
	const [sentInvites, setSentInvites] = useState<SentInvite[]>([]);

	const form = useForm<FormData>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			email: "",
			role: "member",
		},
	});

	const handleSubmit = async (values: FormData) => {
		if (!organizationId) {
			toast.error("No active organization found.");
			return;
		}

		try {
			await inviteMember({
				email: values.email,
				role: values.role,
				organizationId,
			});
			setSentInvites((prev) => [
				...prev,
				{ email: values.email, role: values.role },
			]);
			form.reset();
			try {
				track("onboarding_invite_sent", {
					role: values.role,
					invite_count: sentInvites.length + 1,
				});
			} catch {}
		} catch {
			// Error handled by the hook's toast
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<div className="flex size-10 items-center justify-center rounded bg-primary/10">
					<UsersIcon className="size-5 text-primary" weight="duotone" />
				</div>
				<div>
					<h2 className="text-balance font-semibold text-lg">
						Invite your team
					</h2>
					<p className="text-pretty text-muted-foreground text-sm">
						Collaborate with your team on analytics insights.
					</p>
				</div>
			</div>

			<Form {...form}>
				<form className="flex gap-2" onSubmit={form.handleSubmit(handleSubmit)}>
					<FormField
						control={form.control}
						name="email"
						render={({ field }) => (
							<FormItem className="flex-1">
								<FormControl>
									<Input
										placeholder="teammate@company.com"
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
										<SelectTrigger className="h-9 w-[100px] text-sm">
											<SelectValue />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										<SelectItem value="member">Member</SelectItem>
										<SelectItem value="admin">Admin</SelectItem>
									</SelectContent>
								</Select>
							</FormItem>
						)}
					/>
					<Button
						disabled={isInviting || !form.formState.isValid}
						size="default"
						type="submit"
					>
						{isInviting ? (
							<SpinnerIcon className="size-4 animate-spin" />
						) : (
							"Invite"
						)}
					</Button>
				</form>
			</Form>

			{sentInvites.length > 0 && (
				<div className="space-y-2">
					<p className="font-medium text-muted-foreground text-xs">
						Invited ({sentInvites.length})
					</p>
					<div className="flex flex-wrap gap-2">
						{sentInvites.map((invite) => (
							<Badge
								className="gap-1.5 px-2 py-1"
								key={invite.email}
								variant="secondary"
							>
								<EnvelopeSimpleIcon className="size-3" weight="duotone" />
								<span className="text-xs">{invite.email}</span>
							</Badge>
						))}
					</div>
				</div>
			)}

			<p className="text-muted-foreground text-xs">
				You can always invite more people later from settings.
			</p>
		</div>
	);
}
