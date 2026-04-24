"use client";

import { Button } from "@/components/ds/button";
import { FieldTriggerButton } from "@/components/ds/control-shell";
import { Dialog } from "@/components/ds/dialog";
import { DropdownMenu } from "@/components/ds/dropdown-menu";
import { Field } from "@/components/ds/field";
import { Input } from "@/components/ds/input";
import { useOrganizationInvitations } from "@/hooks/use-organization-invitations";
import { CaretUpDown, UserPlus } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";

interface InviteMemberDialogProps {
	onOpenChangeAction: (open: boolean) => void;
	open: boolean;
	organizationId: string;
}

export function InviteMemberDialog({
	open,
	onOpenChangeAction,
	organizationId,
}: InviteMemberDialogProps) {
	const { inviteMember, isInviting } =
		useOrganizationInvitations(organizationId);

	const [email, setEmail] = useState("");
	const [role, setRole] = useState<"member" | "admin">("member");
	const [error, setError] = useState("");

	const handleClose = () => {
		onOpenChangeAction(false);
		setEmail("");
		setRole("member");
		setError("");
	};

	const handleSubmit = async () => {
		if (!email?.includes("@")) {
			setError("Please enter a valid email address");
			return;
		}
		setError("");
		try {
			await inviteMember({ email, role, organizationId });
			handleClose();
		} catch {
			// Error handled by mutation toast
		}
	};

	return (
		<Dialog onOpenChange={handleClose} open={open}>
			<Dialog.Content>
				<Dialog.Close />
				<Dialog.Header>
					<div className="flex items-center gap-2">
						<div className="flex size-7 items-center justify-center rounded-md bg-primary/10">
							<UserPlus className="size-3.5 text-primary" weight="duotone" />
						</div>
						<div>
							<Dialog.Title>Invite Member</Dialog.Title>
							<Dialog.Description>
								Send an invitation to join this workspace
							</Dialog.Description>
						</div>
					</div>
				</Dialog.Header>
				<Dialog.Body>
					<div className="flex gap-2">
						<Field className="flex-1" error={!!error}>
							<Input
								onChange={(e) => setEmail(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										handleSubmit();
									}
								}}
								placeholder="email@company.com"
								type="email"
								value={email}
							/>
							{error && <Field.Error>{error}</Field.Error>}
						</Field>
						<DropdownMenu>
							<DropdownMenu.Trigger
								render={
									<FieldTriggerButton className="w-auto gap-1">
										{role === "admin" ? "Admin" : "Member"}
										<CaretUpDown className="size-3 shrink-0 text-muted-foreground" />
									</FieldTriggerButton>
								}
							/>
							<DropdownMenu.Content align="end" side="bottom">
								<DropdownMenu.RadioGroup
									onValueChange={(val) => setRole(val as "member" | "admin")}
									value={role}
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
					</div>
				</Dialog.Body>
				<Dialog.Footer>
					<Dialog.Close>
						<Button variant="secondary">Cancel</Button>
					</Dialog.Close>
					<Button disabled={!email} loading={isInviting} onClick={handleSubmit}>
						Send Invite
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog>
	);
}
