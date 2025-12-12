"use client";

import { authClient } from "@databuddy/auth/client";
import { CrownIcon, TrashIcon } from "@phosphor-icons/react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type {
	OrganizationMember,
	UpdateMemberData,
} from "@/hooks/use-organizations";

dayjs.extend(relativeTime);

type MemberToRemove = {
	id: string;
	name: string;
};

type MemberListProps = {
	members: OrganizationMember[];
	onRemoveMember: (memberId: string) => void;
	isRemovingMember: boolean;
	onUpdateRole: (member: UpdateMemberData) => void;
	isUpdatingMember: boolean;
	organizationId: string;
};

type RoleSelectorProps = {
	member: OrganizationMember;
	onUpdateRole: MemberListProps["onUpdateRole"];
	isUpdatingMember: boolean;
	organizationId: string;
	canEditRoles: boolean;
	isCurrentUser: boolean;
};

function RoleSelector({
	member,
	onUpdateRole,
	isUpdatingMember,
	organizationId,
	canEditRoles,
	isCurrentUser,
}: RoleSelectorProps) {
	if (member.role === "owner") {
		return <Badge variant="amber">Owner</Badge>;
	}

	// If user doesn't have permission to edit roles, show badge instead
	if (!canEditRoles) {
		return (
			<Badge variant={member.role === "admin" ? "default" : "secondary"}>
				{member.role === "admin" ? "Admin" : "Member"}
			</Badge>
		);
	}

	// Prevent admins from changing their own role
	const isDisabled =
		isUpdatingMember || (isCurrentUser && member.role === "admin");

	return (
		<Select
			disabled={isDisabled}
			onValueChange={(newRole) =>
				onUpdateRole({
					memberId: member.id,
					role: newRole as UpdateMemberData["role"],
					organizationId,
				})
			}
			value={member.role}
		>
			<SelectTrigger className="h-7 w-24 text-xs">
				<SelectValue placeholder="Role" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="admin">Admin</SelectItem>
				<SelectItem value="member">Member</SelectItem>
			</SelectContent>
		</Select>
	);
}

type MemberRowProps = {
	member: OrganizationMember;
	onRemoveMember: MemberListProps["onRemoveMember"];
	isRemovingMember: boolean;
	onUpdateRole: MemberListProps["onUpdateRole"];
	isUpdatingMember: boolean;
	organizationId: string;
	onConfirmRemove: (member: MemberToRemove) => void;
	canEditRoles: boolean;
	isCurrentUser: boolean;
};

function MemberRow({
	member,
	isRemovingMember,
	onUpdateRole,
	isUpdatingMember,
	organizationId,
	onConfirmRemove,
	canEditRoles,
	isCurrentUser,
}: MemberRowProps) {
	return (
		<div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-4">
			<Avatar className="size-10">
				<AvatarImage
					alt={member.user.name}
					src={member.user.image ?? undefined}
				/>
				<AvatarFallback className="bg-accent text-sm">
					{member.user.name.charAt(0).toUpperCase()}
				</AvatarFallback>
			</Avatar>

			<div className="min-w-0">
				<div className="flex items-center gap-2">
					<p className="truncate font-medium">{member.user.name}</p>
					{member.role === "owner" && (
						<CrownIcon
							className="shrink-0 text-amber-500"
							size={14}
							weight="fill"
						/>
					)}
				</div>
				<p className="truncate text-muted-foreground text-sm">
					{member.user.email} · Joined {dayjs(member.createdAt).fromNow()}
				</p>
			</div>

			<RoleSelector
				canEditRoles={canEditRoles}
				isCurrentUser={isCurrentUser}
				isUpdatingMember={isUpdatingMember}
				member={member}
				onUpdateRole={onUpdateRole}
				organizationId={organizationId}
			/>

			{canEditRoles && member.role !== "owner" ? (
				<Button
					className="size-7 p-0 hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
					disabled={isRemovingMember}
					onClick={() =>
						onConfirmRemove({ id: member.id, name: member.user.name })
					}
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
	const { data: session } = authClient.useSession();

	// Find current user's member record
	const currentUserMember = session?.user?.id
		? members.find((m) => m.userId === session.user.id)
		: null;

	// Check if current user can edit roles (admin or owner)
	const canEditRoles =
		currentUserMember?.role === "admin" || currentUserMember?.role === "owner";

	const handleRemove = async () => {
		if (!memberToRemove) {
			return;
		}
		await onRemoveMember(memberToRemove.id);
		setMemberToRemove(null);
	};

	return (
		<>
			{members.map((member) => {
				const isCurrentUser = member.userId === session?.user?.id;
				return (
					<MemberRow
						canEditRoles={canEditRoles}
						isCurrentUser={isCurrentUser}
						isRemovingMember={isRemovingMember}
						isUpdatingMember={isUpdatingMember}
						key={member.id}
						member={member}
						onConfirmRemove={setMemberToRemove}
						onRemoveMember={onRemoveMember}
						onUpdateRole={onUpdateRole}
						organizationId={organizationId}
					/>
				);
			})}

			<DeleteDialog
				confirmLabel="Remove"
				description={`This action cannot be undone. This will permanently remove ${memberToRemove?.name} from the organization.`}
				isDeleting={isRemovingMember}
				isOpen={!!memberToRemove}
				itemName={memberToRemove?.name}
				onClose={() => setMemberToRemove(null)}
				onConfirm={handleRemove}
				title="Remove Member"
			/>
		</>
	);
}
