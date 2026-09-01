"use client";

import type { CancelInvitation } from "@/hooks/use-organizations";
import type { Invitation } from "@/hooks/use-organization-invitations";
import {
	ArrowClockwiseIcon,
	DotsThreeIcon,
	EnvelopeIcon,
	XCircleIcon,
} from "@databuddy/ui/icons";
import { useState } from "react";
import { Dialog, DropdownMenu } from "@databuddy/ui/client";
import { Badge, Button, Text, dayjs } from "@databuddy/ui";

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
	isResending,
	onConfirmCancel,
	onResend,
}: {
	invitation: Invitation;
	isCancellingInvitation: boolean;
	isResending: boolean;
	onConfirmCancel: (inv: InvitationToCancel) => void;
	onResend: (invitation: Invitation) => void;
}) {
	const { label, variant, isPending } = resolveStatus(invitation);
	const isExpired = !isPending && invitation.status === "pending";
	const showActions = isPending || isExpired;

	return (
		<div className="flex items-center gap-3 px-5 py-3">
			<div className="flex size-8 items-center justify-center rounded-full bg-secondary">
				<EnvelopeIcon className="text-muted-foreground" size={14} />
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
			{showActions ? (
				<DropdownMenu>
					<DropdownMenu.Trigger
						className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
						disabled={isCancellingInvitation || isResending}
					>
						<DotsThreeIcon size={16} />
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" side="bottom">
						<DropdownMenu.Item onClick={() => onResend(invitation)}>
							<ArrowClockwiseIcon size={14} />
							Resend invitation
						</DropdownMenu.Item>
						{isPending && (
							<DropdownMenu.Item
								onClick={() =>
									onConfirmCancel({
										id: invitation.id,
										email: invitation.email,
									})
								}
								variant="destructive"
							>
								<XCircleIcon size={14} />
								Cancel invitation
							</DropdownMenu.Item>
						)}
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
	onResendInvitation,
	isResending,
}: {
	invitations: Invitation[];
	onCancelInvitationAction: CancelInvitation;
	isCancellingInvitation: boolean;
	onResendInvitation: (invitation: Invitation) => void;
	isResending: boolean;
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
						isResending={isResending}
						key={invitation.id}
						onConfirmCancel={setInvitationToCancel}
						onResend={onResendInvitation}
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
							tone="destructive"
						>
							Cancel Invitation
						</Button>
					</Dialog.Footer>
				</Dialog.Content>
			</Dialog>
		</>
	);
}
