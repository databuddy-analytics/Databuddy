"use client";

import { EnvelopeIcon, TrashIcon } from "@phosphor-icons/react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import type { CancelInvitation, Invitation } from "@/hooks/use-organizations";
import { cn } from "@/lib/utils";

dayjs.extend(relativeTime);

type InvitationToCancel = {
	id: string;
	email: string;
};

type InvitationRowProps = {
	invitation: Invitation;
	isCancellingInvitation: boolean;
	onConfirmCancel: (inv: InvitationToCancel) => void;
};

function InvitationRow({
	invitation,
	isCancellingInvitation,
	onConfirmCancel,
}: InvitationRowProps) {
	const isExpired =
		invitation.status === "pending" &&
		dayjs(invitation.expiresAt).isBefore(dayjs());

	const isPending =
		invitation.status === "pending" &&
		dayjs(invitation.expiresAt).isAfter(dayjs());

	const statusConfig = {
		pending: {
			label: "Pending",
			className: "border-amber-500/20 bg-amber-500/10 text-amber-600",
		},
		accepted: {
			label: "Accepted",
			className: "border-green-500/20 bg-green-500/10 text-green-600",
		},
		expired: {
			label: "Expired",
			className: "border-secondary bg-secondary text-secondary-foreground",
		},
	};

	const actualStatus = isExpired
		? "expired"
		: ((invitation.status as keyof typeof statusConfig) ?? "expired");

	const status = statusConfig[actualStatus] ?? statusConfig.expired;

	return (
		<div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-4">
			<div className="flex size-8 items-center justify-center rounded-full bg-secondary">
				<EnvelopeIcon className="text-secondary-foreground" size={14} />
			</div>

			<div className="min-w-0">
				<p className="truncate font-medium">{invitation.email}</p>
				<p className="truncate text-muted-foreground text-sm">
					{invitation.role ?? "member"} ·{" "}
					{isExpired ? "Expired" : isPending ? "Expires" : "Expired"}{" "}
					{dayjs(invitation.expiresAt).fromNow()}
				</p>
			</div>

			<Badge className={cn(status.className, "h-7")} variant="secondary">
				{status.label}
			</Badge>

			{isPending ? (
				<Button
					className="size-7 p-0 hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
					disabled={isCancellingInvitation}
					onClick={() =>
						onConfirmCancel({ id: invitation.id, email: invitation.email })
					}
					size="sm"
					variant="outline"
				>
					<TrashIcon size={14} />
				</Button>
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

			<DeleteDialog
				cancelLabel="Keep"
				confirmLabel="Cancel Invitation"
				description={`Are you sure you want to cancel the invitation for ${invitationToCancel?.email}? This action cannot be undone.`}
				isDeleting={isCancellingInvitation}
				isOpen={!!invitationToCancel}
				itemName={invitationToCancel?.email}
				onClose={() => setInvitationToCancel(null)}
				onConfirm={handleCancel}
				title="Cancel Invitation"
			/>
		</>
	);
}
