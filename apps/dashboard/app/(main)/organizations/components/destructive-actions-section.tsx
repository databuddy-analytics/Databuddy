"use client";

import { authClient } from "@databuddy/auth/client";
import { type Organization, useOrganizations } from "@/hooks/use-organizations";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TransferAssets } from "./transfer-assets";
import { Dialog } from "@databuddy/ui/client";
import {
	Button,
	Card,
	Field,
	Input,
	SettingsZone,
	SettingsZoneRow,
} from "@databuddy/ui";

export function DestructiveActionsSection({
	organization,
}: {
	organization: Organization;
}) {
	const router = useRouter();
	const { data: session } = authClient.useSession();
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const [showLeaveDialog, setShowLeaveDialog] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [isLeaving, setIsLeaving] = useState(false);
	const [isOwner, setIsOwner] = useState<boolean | null>(null);
	const [confirmText, setConfirmText] = useState("");

	const { deleteOrganization, leaveOrganization } = useOrganizations();

	useEffect(() => {
		const checkOwnership = async () => {
			if (!session?.user?.id) {
				return;
			}
			try {
				const { data: fullOrgData } =
					await authClient.organization.getFullOrganization({
						query: { organizationId: organization.id },
					});
				const member = fullOrgData?.members?.find(
					(m) => m.userId === session.user.id
				);
				setIsOwner(member?.role === "owner");
			} catch {
				setIsOwner(false);
			}
		};
		checkOwnership();
	}, [organization.id, session?.user?.id]);

	const handleDelete = () => {
		if (confirmText !== organization.name) {
			toast.error(
				"The name does not match. Type the organization name exactly as shown."
			);
			return;
		}
		setIsDeleting(true);
		deleteOrganization(organization.id, {
			onSuccess: () => {
				router.push("/organizations");
				setIsDeleting(false);
				setShowDeleteDialog(false);
				setConfirmText("");
			},
			onError: () => {
				setIsDeleting(false);
			},
		});
	};

	const handleLeave = () => {
		setIsLeaving(true);
		leaveOrganization(organization.id, {
			onSuccess: () => {
				router.push("/organizations");
				setIsLeaving(false);
				setShowLeaveDialog(false);
			},
			onError: () => {
				setIsLeaving(false);
			},
		});
	};

	return (
		<>
			<Card>
				<Card.Header>
					<Card.Title>Transfer assets</Card.Title>
					<Card.Description>
						Move websites from this organization to another
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<TransferAssets organizationId={organization.id} />
				</Card.Content>
			</Card>

			<SettingsZone title="Destructive actions" variant="destructive">
				<SettingsZoneRow
					action={{
						label: isOwner === null ? "Loading…" : isOwner ? "Delete" : "Leave",
						disabled: isOwner === null,
						onClick: () =>
							isOwner ? setShowDeleteDialog(true) : setShowLeaveDialog(true),
					}}
					description={
						isOwner === null
							? "Checking permissions…"
							: isOwner
								? "Permanently delete this organization and all data"
								: "You will lose access to all resources"
					}
					title={
						isOwner === null
							? "Loading…"
							: isOwner
								? "Delete organization"
								: "Leave organization"
					}
				/>
			</SettingsZone>

			<Dialog
				onOpenChange={(open) => {
					setShowDeleteDialog(open);
					if (!open) {
						setConfirmText("");
					}
				}}
				open={showDeleteDialog}
			>
				<Dialog.Content>
					<Dialog.Header>
						<Dialog.Title>Delete organization</Dialog.Title>
						<Dialog.Description>
							This will permanently delete "{organization.name}" and all
							associated data. This action cannot be undone.
						</Dialog.Description>
					</Dialog.Header>
					<Dialog.Body>
						<Field>
							<Field.Label>Type the organization name to confirm</Field.Label>
							<Input
								onChange={(e) => setConfirmText(e.target.value)}
								placeholder={organization.name}
								value={confirmText}
							/>
							<Field.Description>
								Type{" "}
								<span className="font-medium text-foreground">
									{organization.name}
								</span>{" "}
								to confirm
							</Field.Description>
						</Field>
					</Dialog.Body>
					<Dialog.Footer>
						<Button
							onClick={() => {
								setShowDeleteDialog(false);
								setConfirmText("");
							}}
							variant="secondary"
						>
							Cancel
						</Button>
						<Button
							disabled={confirmText !== organization.name}
							loading={isDeleting}
							onClick={handleDelete}
							tone="destructive"
						>
							Delete organization
						</Button>
					</Dialog.Footer>
					<Dialog.Close />
				</Dialog.Content>
			</Dialog>

			<Dialog onOpenChange={setShowLeaveDialog} open={showLeaveDialog}>
				<Dialog.Content>
					<Dialog.Header>
						<Dialog.Title>Leave organization</Dialog.Title>
						<Dialog.Description>
							You will lose access to "{organization.name}" and all its
							resources. This action cannot be undone.
						</Dialog.Description>
					</Dialog.Header>
					<Dialog.Footer>
						<Button
							onClick={() => setShowLeaveDialog(false)}
							variant="secondary"
						>
							Cancel
						</Button>
						<Button
							loading={isLeaving}
							onClick={handleLeave}
							tone="destructive"
						>
							Leave organization
						</Button>
					</Dialog.Footer>
					<Dialog.Close />
				</Dialog.Content>
			</Dialog>
		</>
	);
}
