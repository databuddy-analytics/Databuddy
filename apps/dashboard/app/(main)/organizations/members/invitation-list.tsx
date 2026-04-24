"use client";

import { Badge } from "@/components/ds/badge";
import { Button } from "@/components/ds/button";
import { Dialog } from "@/components/ds/dialog";
import { DropdownMenu } from "@/components/ds/dropdown-menu";
import { Text } from "@/components/ds/text";
import type { CancelInvitation } from "@/hooks/use-organizations";
import dayjs from "@/lib/dayjs";
import type { Invitation } from "@/hooks/use-organization-invitations";
import { DotsThree, Envelope, XCircle } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";

interface InvitationToCancel {
	email: string;
	id: string;
}

const STATUS_CONFIG = {
	pending: { label: "Pending", variant: "warning" as const },
	accepted: { label: "Accepted", variant: "success" as const },
	expired: { label: "Expired", variant: "muted" as const },
};

function resolveStatus(invitation: Invitation) {
	const isExpired =
		invitation.status === "pending" &&
		dayjs(invitation.expiresAt).isBefore(dayjs());

	if (isExpired) {
		return { ...STATUS_CONFIG.expired, isPending: false };
	}

	const isPending =
		invitation.status === "pending" &&
		dayjs(invitation.expiresAt).isAfter(dayjs());

	const key = (invitation.status as keyof typeof STATUS_CONFIG) ?? "expired";
	return {
		...(STATUS_CONFIG[key] ?? STATUS_CONFIG.expired),
		isPending,
	};
}

function InvitationRow({
	invitation,
	isCancellingInvitation,
	onConfirmCancel,
}: {
	invitation: Invitation;
	isCancellingInvitation: boolean;
	onConfirmCancel: (inv: InvitationToCancel) => void;
}) {
	const { label, variant, isPending } = resolveStatus(invitation);

	return (
		<div className="flex items-center gap-3 px-5 py-3">
			<div className="flex size-8 items-center justify-center rounded-full bg-secondary">
				<Envelope className="text-muted-foreground" size={14} />
			</div>
			<div className="min-w-0 flex-1">
				<Text className="truncate" variant="label">
					{invitation.email}
				</Text>
				<Text className="truncate" tone="muted" variant="caption">
					{invitation.role ?? "member"} · {isPending ? "Expires" : "Expired"}{" "}
					{dayjs(invitation.expiresAt).fromNow()}
				</Text>
			</div>
			<Badge variant={variant}>{label}</Badge>
			{isPending ? (
				<DropdownMenu>
					<DropdownMenu.Trigger
						className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
						disabled={isCancellingInvitation}
					>
						<DotsThree size={16} weight="bold" />
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" side="bottom">
						<DropdownMenu.Item
							onClick={() =>
								onConfirmCancel({
									id: invitation.id,
									email: invitation.email,
								})
							}
							variant="destructive"
						>
							<XCircle size={14} />
							Cancel invitation
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu>
			) : (
				<div className="size-7" />
			)}
		</div>
	);
}

export function InvitationList({
	invitations,
	onCancelInvitationAction,
	isCancellingInvitation,
}: {
	invitations: Invitation[];
	onCancelInvitationAction: CancelInvitation;
	isCancellingInvitation: boolean;
}) {
	const [invitationToCancel, setInvitationToCancel] =
		useState<InvitationToCancel | null>(null);

	const handleCancel = async () => {
		if (!invitationToCancel) {
			return;
		}
		await onCancelInvitationAction(invitationToCancel.id);
		setInvitationToCancel(null);
	};

	if (invitations.length === 0) {
		return null;
	}

	return (
		<>
			<div className="divide-y">
				{invitations.map((invitation) => (
					<InvitationRow
						invitation={invitation}
						isCancellingInvitation={isCancellingInvitation}
						key={invitation.id}
						onConfirmCancel={setInvitationToCancel}
					/>
				))}
			</div>

			<Dialog
				onOpenChange={(open) => {
					if (!open) {
						setInvitationToCancel(null);
					}
				}}
				open={!!invitationToCancel}
			>
				<Dialog.Content>
					<Dialog.Close />
					<Dialog.Header>
						<Dialog.Title>Cancel Invitation</Dialog.Title>
						<Dialog.Description>
							Are you sure you want to cancel the invitation for{" "}
							{invitationToCancel?.email}?
						</Dialog.Description>
					</Dialog.Header>
					<Dialog.Footer>
						<Dialog.Close>
							<Button variant="secondary">Keep</Button>
						</Dialog.Close>
						<Button
							loading={isCancellingInvitation}
							onClick={handleCancel}
							tone="danger"
						>
							Cancel Invitation
						</Button>
					</Dialog.Footer>
				</Dialog.Content>
			</Dialog>
		</>
	);
}
