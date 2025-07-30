'use client';

import {
	ClockIcon,
	CrownIcon,
	TrashIcon,
	UserIcon,
	UsersIcon,
} from '@phosphor-icons/react';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import type {
	OrganizationMember,
	UpdateMemberData,
} from '@/hooks/use-organizations';

dayjs.extend(relativeTime);

interface MemberToRemove {
	id: string;
	name: string;
}

interface MemberListProps {
	members: OrganizationMember[];
	onRemoveMember: (memberId: string) => void;
	isRemovingMember: boolean;
	onUpdateRole: (member: UpdateMemberData) => void;
	isUpdatingMember: boolean;
	organizationId: string;
}

interface RoleSelectorProps {
	member: MemberListProps['members'][number];
	onUpdateRole: MemberListProps['onUpdateRole'];
	isUpdatingMember: MemberListProps['isUpdatingMember'];
	organizationId: MemberListProps['organizationId'];
}

function RoleSelector({
	member,
	onUpdateRole,
	isUpdatingMember,
	organizationId,
}: RoleSelectorProps) {
	if (member.role === 'owner') {
		return (
			<Badge
				className="border-amber-200 bg-amber-100 px-2 py-1 text-amber-800"
				variant="default"
			>
				Owner
			</Badge>
		);
	}

	return (
		<Select
			defaultValue={member.role}
			disabled={isUpdatingMember}
			onValueChange={(newRole) =>
				onUpdateRole({
					memberId: member.id,
					role: newRole as UpdateMemberData['role'],
					organizationId,
				})
			}
		>
			<SelectTrigger className="w-32 rounded">
				<SelectValue placeholder="Select a role" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="admin">Admin</SelectItem>
				<SelectItem value="member">Member</SelectItem>
			</SelectContent>
		</Select>
	);
}

export function MemberList({
	members,
	onRemoveMember,
	isRemovingMember,
	onUpdateRole,
	isUpdatingMember,
	organizationId,
}: MemberListProps) {
	const [memberToRemove, setMemberToRemove] = useState<MemberToRemove | null>(
		null
	);

	const handleRemove = async () => {
		if (!memberToRemove) {
			return;
		}
		await onRemoveMember(memberToRemove.id);
		setMemberToRemove(null);
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h3 className="flex items-center gap-2 font-semibold text-lg">
					<UsersIcon className="h-5 w-5" size={16} weight="duotone" />
					Team Members
				</h3>
				<Badge className="px-2 py-1" variant="outline">
					{members?.length || 0} active
				</Badge>
			</div>

			{members && members.length > 0 ? (
				<div className="space-y-3">
					{members.map((member) => (
						<div
							className="flex items-center justify-between rounded border border-border/50 bg-muted/30 p-4"
							key={member.id}
						>
							<div className="flex items-center gap-3">
								<Avatar className="h-12 w-12 border border-border/50">
									<AvatarImage
										alt={member.user.name}
										src={member.user.image || undefined}
									/>
									<AvatarFallback className="bg-accent font-medium text-sm">
										{member.user.name.charAt(0).toUpperCase()}
									</AvatarFallback>
								</Avatar>
								<div>
									<div className="flex items-center gap-2">
										<p className="font-medium">{member.user.name}</p>
										{member.role === 'owner' && (
											<CrownIcon className="h-4 w-4 text-amber-500" size={16} />
										)}
									</div>
									<p className="text-muted-foreground text-sm">
										{member.user.email}
									</p>
									<p className="mt-1 flex items-center gap-1 text-muted-foreground text-xs">
										<ClockIcon className="h-3 w-3" size={16} />
										Joined {dayjs(member.createdAt).fromNow()}
									</p>
								</div>
							</div>
							<div className="flex items-center gap-2">
								<RoleSelector
									isUpdatingMember={isUpdatingMember}
									member={member}
									onUpdateRole={onUpdateRole}
									organizationId={organizationId}
								/>
								{member.role !== 'owner' && (
									<Button
										className="rounded hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
										disabled={isRemovingMember}
										onClick={() =>
											setMemberToRemove({
												id: member.id,
												name: member.user.name,
											})
										}
										size="sm"
										variant="outline"
									>
										<TrashIcon className="h-3 w-3" size={16} />
									</Button>
								)}
							</div>
						</div>
					))}
				</div>
			) : (
				<div className="rounded border border-border/50 bg-muted/30 py-8 text-center">
					<UserIcon
						className="mx-auto mb-2 h-8 w-8 text-muted-foreground"
						size={32}
						weight="duotone"
					/>
					<p className="text-muted-foreground text-sm">No team members yet</p>
				</div>
			)}

			<AlertDialog
				onOpenChange={(open) => !open && setMemberToRemove(null)}
				open={!!memberToRemove}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove {memberToRemove?.name}?</AlertDialogTitle>
						<AlertDialogDescription>
							This action cannot be undone. This will permanently remove the
							member from the organization.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleRemove}>Remove</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
