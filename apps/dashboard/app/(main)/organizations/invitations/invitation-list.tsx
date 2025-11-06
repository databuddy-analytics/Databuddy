"use client";

import { ClockIcon, EnvelopeIcon, TrashIcon } from "@phosphor-icons/react";
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
import { Button } from "@/components/ui/button";
import type { CancelInvitation, Invitation } from "@/hooks/use-organizations";

dayjs.extend(relativeTime);

interface InvitationToCancel {
	id: string;
	email: string;
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
			<div className="space-y-2">
				{invitations.map((invitation) => (
					<div
						className="flex items-center justify-between rounded border border-border/30 bg-muted/20 p-3"
						key={invitation.id}
					>
						<div className="flex items-center gap-3">
							<div className="flex-shrink-0 rounded-full border border-border/30 bg-accent p-2">
								<EnvelopeIcon
									className="h-3 w-3 text-muted-foreground"
									size={12}
								/>
							</div>
							<div className="min-w-0 flex-1">
								<p className="truncate font-medium text-sm">
									{invitation.email}
								</p>
								<div className="flex items-center gap-2">
									<p className="text-muted-foreground text-xs">
										Invited as {invitation.role || "member"}
									</p>
									<span
										className={`inline-flex rounded-full px-2 py-0.5 font-medium text-xs ${
											invitation.status === "pending"
												? "bg-yellow-100 text-yellow-800"
												: invitation.status === "accepted"
													? "bg-green-100 text-green-800"
													: "bg-gray-100 text-gray-800"
										}`}
									>
										{invitation.status}
									</span>
								</div>
								<p className="mt-1 flex items-center gap-1 text-muted-foreground text-xs">
									<ClockIcon className="h-3 w-3 flex-shrink-0" size={12} />
									{invitation.status === "pending" ? "Expires" : "Expired"}{" "}
									{dayjs(invitation.expiresAt).fromNow()}
								</p>
							</div>
						</div>
						<div className="flex flex-shrink-0 items-center gap-2">
							{invitation.status === "pending" &&
								dayjs(invitation.expiresAt).isAfter(dayjs()) && (
									<Button
										className="h-7 w-7 rounded p-0 hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
										disabled={isCancellingInvitation}
										onClick={() =>
											setInvitationToCancel({
												id: invitation.id,
												email: invitation.email,
											})
										}
										size="sm"
										variant="outline"
									>
										<TrashIcon className="h-3 w-3" size={12} />
									</Button>
								)}
						</div>
					</div>
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
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleCancel}>
							Confirm
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
