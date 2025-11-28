"use client";

import { EnvelopeIcon, TrashIcon } from "@phosphor-icons/react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CancelInvitation, Invitation } from "@/hooks/use-organizations";

dayjs.extend(relativeTime);

interface InvitationToCancel {
	id: string;
	email: string;
}

interface InvitationRowProps {
	invitation: Invitation;
	isCancellingInvitation: boolean;
	onConfirmCancel: (inv: InvitationToCancel) => void;
}

function InvitationRow({
	invitation,
	isCancellingInvitation,
	onConfirmCancel,
}: InvitationRowProps) {
	const isPending =
		invitation.status === "pending" &&
		dayjs(invitation.expiresAt).isAfter(dayjs());

	const statusConfig = {
		pending: { label: "Pending", className: "border-amber-500/20 bg-amber-500/10 text-amber-600" },
		accepted: { label: "Accepted", className: "border-green-500/20 bg-green-500/10 text-green-600" },
		expired: { label: "Expired", className: "border-muted bg-muted text-muted-foreground" },
	};

	const status = statusConfig[invitation.status as keyof typeof statusConfig] ?? statusConfig.expired;

	return (
		<div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-4">
			<div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
				<EnvelopeIcon className="text-muted-foreground" size={14} />
			</div>

			<div className="min-w-0">
				<p className="truncate font-medium">{invitation.email}</p>
				<p className="truncate text-muted-foreground text-sm">
					{invitation.role ?? "member"} ·{" "}
					{invitation.status === "pending" ? "Expires" : "Expired"}{" "}
					{dayjs(invitation.expiresAt).fromNow()}
				</p>
			</div>

			<Badge className={status.className} variant="secondary">
				{status.label}
			</Badge>

			{isPending ? (
				<Button
					className="h-7 w-7 p-0 hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
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
				<div className="h-7 w-7" />
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
		if (!invitationToCancel) return;
		await onCancelInvitationAction(invitationToCancel.id);
		setInvitationToCancel(null);
	};

	if (invitations.length === 0) return null;

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

			<AlertDialog
				onOpenChange={(open) => !open && setInvitationToCancel(null)}
				open={!!invitationToCancel}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Cancel invitation for {invitationToCancel?.email}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							This action cannot be undone. The invitation will be cancelled.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={handleCancel}
						>
							Cancel Invitation
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
