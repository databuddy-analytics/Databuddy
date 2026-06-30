"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useController, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { useOrganizationInvitations } from "@/hooks/use-organization-invitations";
import { APP_EVENTS, trackAppEvent } from "@/lib/app-events";
import {
	CaretUpDownIcon as CaretUpDown,
	EnvelopeSimpleIcon,
	UsersIcon,
} from "@databuddy/ui/icons";
import { Badge, Button, Field, Input } from "@databuddy/ui";
import { DropdownMenu } from "@databuddy/ui/client";

const formSchema = z.object({
	email: z.string().email("Enter a valid email address"),
	role: z.enum(["admin", "member"]),
});

type FormData = z.infer<typeof formSchema>;

interface SentInvite {
	email: string;
	role: string;
}

function roleLabel(role: FormData["role"]) {
	return role === "admin" ? "Admin" : "Member";
}

export function StepInviteTeam() {
	const { activeOrganization } = useOrganizationsContext();
	const organizationId = activeOrganization?.id ?? "";
	const { inviteMember, isInviting } =
		useOrganizationInvitations(organizationId);
	const [sentInvites, setSentInvites] = useState<SentInvite[]>([]);

	const form = useForm<FormData>({
		resolver: zodResolver(formSchema),
		mode: "onChange",
		defaultValues: {
			email: "",
			role: "member",
		},
	});
	const emailField = useController({
		control: form.control,
		name: "email",
	});
	const roleField = useController({
		control: form.control,
		name: "role",
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
			trackAppEvent(APP_EVENTS.onboardingInviteSent, {
				role: values.role,
				invite_count: sentInvites.length + 1,
			});
		} catch {
			// Error handled by the hook's toast
		}
	};

	return (
		<div className="mx-auto max-w-2xl space-y-6">
			<div className="flex items-center gap-3">
				<div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
					<UsersIcon className="size-5 text-primary" weight="duotone" />
				</div>
				<div>
					<h2 className="text-balance font-semibold text-lg">
						Invite your team
					</h2>
					<p className="text-pretty text-muted-foreground text-sm">
						Add a teammate now or skip ahead and handle invites later from
						settings.
					</p>
				</div>
			</div>

			<form
				className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_auto]"
				onSubmit={form.handleSubmit(handleSubmit)}
			>
				<Field className="sm:col-span-1" error={!!emailField.fieldState.error}>
					<Field.Label>Email address</Field.Label>
					<Input
						placeholder="teammate@company.com"
						type="email"
						{...emailField.field}
					/>
					{emailField.fieldState.error ? (
						<Field.Error>{emailField.fieldState.error.message}</Field.Error>
					) : null}
				</Field>

				<Field error={!!roleField.fieldState.error}>
					<Field.Label>Role</Field.Label>
					<DropdownMenu>
						<DropdownMenu.Trigger
							className="flex h-8 w-full cursor-pointer items-center justify-between rounded-md bg-secondary px-3 font-medium text-foreground text-xs transition-colors hover:bg-interactive-hover disabled:pointer-events-none disabled:opacity-50"
							disabled={isInviting}
							type="button"
						>
							{roleLabel(roleField.field.value)}
							<CaretUpDown className="size-3.5 text-muted-foreground" />
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="start" side="bottom">
							<DropdownMenu.RadioGroup
								onValueChange={(newRole) =>
									roleField.field.onChange(newRole as FormData["role"])
								}
								value={roleField.field.value}
							>
								<DropdownMenu.RadioItem value="member">
									Member
								</DropdownMenu.RadioItem>
								<DropdownMenu.RadioItem value="admin">
									Admin
								</DropdownMenu.RadioItem>
							</DropdownMenu.RadioGroup>
						</DropdownMenu.Content>
					</DropdownMenu>
					{roleField.fieldState.error ? (
						<Field.Error>{roleField.fieldState.error.message}</Field.Error>
					) : null}
				</Field>

				<div className="self-end">
					<Button
						className="w-full"
						disabled={!form.formState.isValid}
						loading={isInviting}
						type="submit"
					>
						Invite
					</Button>
				</div>
			</form>

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
								variant="muted"
							>
								<EnvelopeSimpleIcon className="size-3" weight="duotone" />
								<span className="text-xs">
									{invite.email} · {roleLabel(invite.role as FormData["role"])}
								</span>
							</Badge>
						))}
					</div>
				</div>
			)}

			<p className="text-muted-foreground text-xs">
				You can always invite more people later from organization settings.
			</p>
		</div>
	);
}
