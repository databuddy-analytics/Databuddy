"use client";

import type {
	OrganizationMember,
	UpdateMemberData,
} from "@/hooks/use-organizations";
import { authClient } from "@databuddy/auth/client";
import {
	ArrowsDownUpIcon,
	CrownIcon,
	MagnifyingGlassIcon,
} from "@databuddy/ui/icons";
import { useMemo, useState } from "react";
import { Avatar, Dialog, DropdownMenu } from "@databuddy/ui/client";
import {
	Badge,
	Button,
	Divider,
	EmptyState,
	Input,
	Text,
	fromNow,
} from "@databuddy/ui";

interface MemberListProps {
	isRemovingMember: boolean;
	isUpdatingMember: boolean;
	members: OrganizationMember[];
	onRemoveMember: (memberId: string) => void;
	onUpdateRole: (member: UpdateMemberData) => void;
	organizationId: string;
}

const ROLE_BADGE_VARIANT = {
	owner: "warning",
	admin: "default",
	member: "muted",
} as const;

function roleLabel(role: string) {
	return role.charAt(0).toUpperCase() + role.slice(1);
}

function MemberRow({
	member,
	isCurrentUser,
	onClick,
}: {
	isCurrentUser: boolean;
	member: OrganizationMember;
	onClick: () => void;
}) {
	return (
		<button
			className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-interactive-hover"
			onClick={onClick}
			type="button"
		>
			<Avatar
				alt={member.user.name}
				size="lg"
				src={member.user.image ?? undefined}
			/>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<Text className="truncate" variant="label">
						{member.user.name}
					</Text>
					{isCurrentUser && (
						<Text className="shrink-0" tone="muted" variant="caption">
							(you)
						</Text>
					)}
					{member.role === "owner" && (
						<CrownIcon className="shrink-0 text-warning" size={12} />
					)}
				</div>
				<Text className="truncate" tone="muted" variant="caption">
					{member.user.email} · Joined {fromNow(member.createdAt)}
				</Text>
			</div>
			<Badge
				variant={
					ROLE_BADGE_VARIANT[member.role as keyof typeof ROLE_BADGE_VARIANT] ??
					"muted"
				}
			>
				{roleLabel(member.role)}
			</Badge>
		</button>
	);
}

type DialogView = "detail" | "confirm-remove";

function MemberDetailDialog({
	member,
	canEditRoles,
	isCurrentUser,
	isUpdatingMember,
	isRemovingMember,
	organizationId,
	onUpdateRole,
	onRemoveMember,
	onClose,
}: {
	canEditRoles: boolean;
	isCurrentUser: boolean;
	isRemovingMember: boolean;
	isUpdatingMember: boolean;
	member: OrganizationMember;
	onClose: () => void;
	onRemoveMember: (memberId: string) => void;
	onUpdateRole: (member: UpdateMemberData) => void;
	organizationId: string;
}) {
	const [view, setView] = useState<DialogView>("detail");
	const canChangeRole =
		canEditRoles &&
		member.role !== "owner" &&
		!(isCurrentUser && member.role === "admin");
	const canRemove = canEditRoles && member.role !== "owner";

	const handleRemove = async () => {
		await onRemoveMember(member.id);
		onClose();
	};

	const handleClose = () => {
		setView("detail");
		onClose();
	};

	return (
		<Dialog
			onOpenChange={(open) => {
				if (!open) {
					handleClose();
				}
			}}
			open
		>
			<Dialog.Content>
				<Dialog.Close />
				{view === "confirm-remove" ? (
					<>
						<Dialog.Header>
							<Dialog.Title>Remove Member</Dialog.Title>
							<Dialog.Description>
								This will permanently remove {member.user.name} from the
								organization. This action cannot be undone.
							</Dialog.Description>
						</Dialog.Header>
						<Dialog.Footer>
							<Button onClick={() => setView("detail")} variant="secondary">
								Back
							</Button>
							<Button
								loading={isRemovingMember}
								onClick={handleRemove}
								tone="destructive"
							>
								Remove
							</Button>
						</Dialog.Footer>
					</>
				) : (
					<>
						<Dialog.Header>
							<div className="flex items-center gap-3">
								<Avatar
									alt={member.user.name}
									size="lg"
									src={member.user.image ?? undefined}
								/>
								<div>
									<Dialog.Title>{member.user.name}</Dialog.Title>
									<Dialog.Description>{member.user.email}</Dialog.Description>
								</div>
							</div>
						</Dialog.Header>
						<Dialog.Body className="space-y-4">
							<div className="flex items-center justify-between">
								<Text tone="muted" variant="caption">
									Joined {fromNow(member.createdAt)}
								</Text>
								<Badge
									variant={
										ROLE_BADGE_VARIANT[
											member.role as keyof typeof ROLE_BADGE_VARIANT
										] ?? "muted"
									}
								>
									{roleLabel(member.role)}
								</Badge>
							</div>

							{canChangeRole && (
								<>
									<Divider />
									<div className="space-y-1.5">
										<Text variant="label">Role</Text>
										<DropdownMenu>
											<DropdownMenu.Trigger
												className="flex h-8 w-full cursor-pointer items-center justify-between rounded-md bg-secondary px-3 font-medium text-foreground text-xs transition-colors hover:bg-interactive-hover disabled:pointer-events-none disabled:opacity-50"
												disabled={isUpdatingMember}
											>
												{roleLabel(member.role)}
												<ArrowsDownUpIcon className="size-3.5 text-muted-foreground" />
											</DropdownMenu.Trigger>
											<DropdownMenu.Content align="start" side="bottom">
												<DropdownMenu.RadioGroup
													onValueChange={(newRole) => {
														onUpdateRole({
															memberId: member.id,
															role: newRole as UpdateMemberData["role"],
															organizationId,
														});
													}}
													value={member.role}
												>
													<DropdownMenu.RadioItem value="admin">
														Admin
													</DropdownMenu.RadioItem>
													<DropdownMenu.RadioItem value="member">
														Member
													</DropdownMenu.RadioItem>
												</DropdownMenu.RadioGroup>
											</DropdownMenu.Content>
										</DropdownMenu>
										<Text tone="muted" variant="caption">
											Admins can manage settings and invite members. Members
											have read-only access to analytics.
										</Text>
									</div>
								</>
							)}

							{canRemove && (
								<>
									<Divider />
									<Button
										className="w-full"
										onClick={() => setView("confirm-remove")}
										tone="destructive"
										variant="secondary"
									>
										Remove from organization
									</Button>
								</>
							)}
						</Dialog.Body>
					</>
				)}
			</Dialog.Content>
		</Dialog>
	);
}

type SortKey = "name" | "role" | "joined";

const ROLE_ORDER: Record<string, number> = {
	owner: 0,
	admin: 1,
	member: 2,
	viewer: 3,
};

const SORT_LABELS: Record<SortKey, string> = {
	name: "Name",
	role: "Role",
	joined: "Joined",
};

function sortMembers(members: OrganizationMember[], key: SortKey) {
	return [...members].sort((a, b) => {
		switch (key) {
			case "name":
				return (a.user.name ?? "").localeCompare(b.user.name ?? "");
			case "role":
				return (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9);
			case "joined":
				return (
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
				);
			default:
				return 0;
		}
	});
}

export function MemberList({
	members,
	onRemoveMember,
	isRemovingMember,
	onUpdateRole,
	isUpdatingMember,
	organizationId,
}: MemberListProps) {
	const [selectedMember, setSelectedMember] =
		useState<OrganizationMember | null>(null);
	const [search, setSearch] = useState("");
	const [sortKey, setSortKey] = useState<SortKey>("role");
	const { data: session } = authClient.useSession();

	const currentUserMember = session?.user?.id
		? members.find((m) => m.userId === session.user.id)
		: null;

	const canEditRoles =
		currentUserMember?.role === "admin" || currentUserMember?.role === "owner";

	const filteredMembers = useMemo(() => {
		const q = search.toLowerCase().trim();
		const filtered = q
			? members.filter(
					(m) =>
						m.user.name?.toLowerCase().includes(q) ||
						m.user.email?.toLowerCase().includes(q)
				)
			: members;
		return sortMembers(filtered, sortKey);
	}, [members, search, sortKey]);

	return (
		<>
			{members.length > 5 && (
				<div className="flex items-center gap-2 border-b px-5 py-3">
					<div className="relative flex-1">
						<MagnifyingGlassIcon
							className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
							size={14}
						/>
						<Input
							className="pl-8"
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search members…"
							value={search}
						/>
					</div>
					<DropdownMenu>
						<DropdownMenu.Trigger className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-secondary px-3 text-muted-foreground text-xs transition-colors hover:bg-interactive-hover hover:text-foreground">
							<ArrowsDownUpIcon size={14} />
							{SORT_LABELS[sortKey]}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.RadioGroup
								onValueChange={(v) => setSortKey(v as SortKey)}
								value={sortKey}
							>
								<DropdownMenu.RadioItem value="name">
									Name
								</DropdownMenu.RadioItem>
								<DropdownMenu.RadioItem value="role">
									Role
								</DropdownMenu.RadioItem>
								<DropdownMenu.RadioItem value="joined">
									Joined
								</DropdownMenu.RadioItem>
							</DropdownMenu.RadioGroup>
						</DropdownMenu.Content>
					</DropdownMenu>
				</div>
			)}

			{filteredMembers.length === 0 && search ? (
				<div className="px-5 py-8">
					<EmptyState
						icon={<MagnifyingGlassIcon />}
						title={`No members matching "${search}"`}
					/>
				</div>
			) : (
				filteredMembers.map((member) => (
					<MemberRow
						isCurrentUser={member.userId === session?.user?.id}
						key={member.id}
						member={member}
						onClick={() => setSelectedMember(member)}
					/>
				))
			)}

			{selectedMember && (
				<MemberDetailDialog
					canEditRoles={canEditRoles}
					isCurrentUser={selectedMember.userId === session?.user?.id}
					isRemovingMember={isRemovingMember}
					isUpdatingMember={isUpdatingMember}
					member={selectedMember}
					onClose={() => setSelectedMember(null)}
					onRemoveMember={onRemoveMember}
					onUpdateRole={onUpdateRole}
					organizationId={organizationId}
				/>
			)}
		</>
	);
}
