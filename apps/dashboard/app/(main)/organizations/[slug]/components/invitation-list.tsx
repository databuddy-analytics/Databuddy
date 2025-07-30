'use client';

import { ClockIcon, EnvelopeIcon, TrashIcon } from '@phosphor-icons/react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useState } from 'react';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

dayjs.extend(relativeTime);

interface InvitationToCancel {
	id: string;
	email: string;
}

export function InvitationList({
	invitations,
	onCancelInvitation,
	isCancellingInvitation,
}: any) {
	const [invitationToCancel, setInvitationToCancel] =
		useState<InvitationToCancel | null>(null);

	const handleCancel = async () => {
		if (!invitationToCancel) {
			return;
		}
		await onCancelInvitation(invitationToCancel.id);
		setInvitationToCancel(null);
	};

	if (invitations.length === 0) {
		return null;
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h3 className="flex items-center gap-2 font-semibold text-lg">
					<EnvelopeIcon className="h-5 w-5" size={16} weight="duotone" />
					Pending Invitations
				</h3>
				<Badge className="px-2 py-1" variant="outline">
					{invitations.length} pending
				</Badge>
			</div>
			<div className="space-y-3">
				{invitations.map((invitation: any) => (
					<div
						className="flex items-center justify-between rounded border border-border/50 bg-muted/30 p-4"
						key={invitation.id}
					>
						<div className="flex items-center gap-3">
							<div className="rounded-full border border-border/50 bg-accent p-3">
								<EnvelopeIcon
									className="h-4 w-4 text-muted-foreground"
									size={16}
								/>
							</div>
							<div>
								<p className="font-medium">{invitation.email}</p>
								<p className="text-muted-foreground text-sm">
									Invited as {invitation.role} • {invitation.status}
								</p>
								<p className="mt-1 flex items-center gap-1 text-muted-foreground text-xs">
									<ClockIcon className="h-3 w-3" size={16} />
									Expires {dayjs(invitation.expiresAt).fromNow()}
								</p>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<Button
								className="rounded hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
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
								<TrashIcon className="h-3 w-3" size={16} />
							</Button>
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
		</div>
	);
}
