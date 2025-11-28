"use client";

import {
	CrownIcon,
	TrashIcon,
} from "@phosphor-icons/react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
	member: OrganizationMember;
	onUpdateRole: MemberListProps["onUpdateRole"];
	isUpdatingMember: boolean;
	organizationId: string;
}

function RoleSelector({
	member,
	onUpdateRole,
	isUpdatingMember,
	organizationId,
}: RoleSelectorProps) {
	if (member.role === "owner") {
		return (
			<Badge className="border-amber-500/20 bg-amber-500/10 text-amber-600" variant="secondary">
				<CrownIcon className="mr-1" size={12} weight="fill" />
				Owner
			</Badge>
		);
	}

	return (
		<Select
			disabled={isUpdatingMember}
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

interface MemberRowProps {
	member: OrganizationMember;
	onRemoveMember: MemberListProps["onRemoveMember"];
	isRemovingMember: boolean;
	onUpdateRole: MemberListProps["onUpdateRole"];
	isUpdatingMember: boolean;
	organizationId: string;
	onConfirmRemove: (member: MemberToRemove) => void;
}

function MemberRow({
	member,
	isRemovingMember,
	onUpdateRole,
	isUpdatingMember,
	organizationId,
	onConfirmRemove,
}: MemberRowProps) {
	return (
		<div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-4">
			<Avatar className="h-10 w-10 border">
				<AvatarImage alt={member.user.name} src={member.user.image ?? undefined} />
				<AvatarFallback className="bg-accent text-sm">
					{member.user.name.charAt(0).toUpperCase()}
				</AvatarFallback>
			</Avatar>

			<div className="min-w-0">
				<div className="flex items-center gap-2">
					<p className="truncate font-medium">{member.user.name}</p>
					{member.role === "owner" && (
						<CrownIcon className="shrink-0 text-amber-500" size={14} weight="fill" />
					)}
				</div>
				<p className="truncate text-muted-foreground text-sm">
					{member.user.email} · Joined {dayjs(member.createdAt).fromNow()}
				</p>
			</div>

			<RoleSelector
				isUpdatingMember={isUpdatingMember}
				member={member}
				onUpdateRole={onUpdateRole}
				organizationId={organizationId}
			/>

			{member.role !== "owner" ? (
				<Button
					className="h-7 w-7 p-0 hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
					disabled={isRemovingMember}
					onClick={() =>
						onConfirmRemove({ id: member.id, name: member.user.name })
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

export function MemberList({
	members,
	onRemoveMember,
	isRemovingMember,
	onUpdateRole,
	isUpdatingMember,
	organizationId,
}: MemberListProps) {
	const [memberToRemove, setMemberToRemove] = useState<MemberToRemove | null>(null);

	const handleRemove = async () => {
		if (!memberToRemove) return;
		await onRemoveMember(memberToRemove.id);
		setMemberToRemove(null);
	};

	return (
		<>
			{members.map((member) => (
				<MemberRow
					isRemovingMember={isRemovingMember}
					isUpdatingMember={isUpdatingMember}
					key={member.id}
					member={member}
					onConfirmRemove={setMemberToRemove}
					onRemoveMember={onRemoveMember}
					onUpdateRole={onUpdateRole}
					organizationId={organizationId}
				/>
			))}

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
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={handleRemove}
						>
							Remove
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
