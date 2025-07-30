'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { useOrganizationMembers } from '@/hooks/use-organizations';

export function InviteMemberDialog({ isOpen, onClose, organizationId }: any) {
	const [inviteEmail, setInviteEmail] = useState('');
	const [inviteRole, setInviteRole] = useState<'owner' | 'admin' | 'member'>(
		'member'
	);
	const { inviteMember, isInvitingMember } =
		useOrganizationMembers(organizationId);

	const handleInvite = async () => {
		if (!inviteEmail.trim()) {
			return;
		}
		await inviteMember({
			email: inviteEmail.trim(),
			role: inviteRole,
			organizationId,
		});
		setInviteEmail('');
		onClose();
	};

	return (
		<Dialog onOpenChange={onClose} open={isOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Invite Team Member</DialogTitle>
					<DialogDescription>
						Enter the email address of the person you want to invite.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 py-4">
					<div className="space-y-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							onChange={(e) => setInviteEmail(e.target.value)}
							placeholder="name@example.com"
							type="email"
							value={inviteEmail}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="role">Role</Label>
						<Select
							onValueChange={(value) => setInviteRole(value as any)}
							value={inviteRole}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a role" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="member">Member</SelectItem>
								<SelectItem value="admin">Admin</SelectItem>
								<SelectItem value="owner">Owner</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>
				<DialogFooter>
					<Button onClick={onClose} variant="outline">
						Cancel
					</Button>
					<Button disabled={isInvitingMember} onClick={handleInvite}>
						{isInvitingMember ? 'Inviting...' : 'Send Invitation'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
