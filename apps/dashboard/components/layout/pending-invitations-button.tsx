"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useUserInvitations } from "./hooks/use-user-invitations";
import { BuildingsIcon, EnvelopeIcon } from "@databuddy/ui/icons";
import { DropdownMenu } from "@databuddy/ui/client";
import { Badge, Tooltip, dayjs } from "@databuddy/ui";

export function PendingInvitationsButton() {
	const [isOpen, setIsOpen] = useState(false);
	const { invitations, count, isLoading } = useUserInvitations();

	if (isLoading || count === 0) {
		return null;
	}

	return (
		<DropdownMenu onOpenChange={setIsOpen} open={isOpen}>
			<Tooltip
				content={`${count} pending invitation${count === 1 ? "" : "s"}`}
				side="bottom"
			>
				<DropdownMenu.Trigger
					aria-label={`${count} pending invitations`}
					className={cn(
						"relative flex size-8 items-center justify-center rounded-md",
						"text-sidebar-foreground/65 transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
						"hover:bg-sidebar-accent hover:text-sidebar-foreground",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
					)}
				>
					<EnvelopeIcon className="size-4" />
					<Badge
						className={cn(
							"absolute -top-1 -right-1 flex size-4 items-center justify-center bg-destructive p-0 text-[10px] text-destructive-foreground",
							"zoom-in-50 animate-in duration-200"
						)}
					>
						{count > 9 ? "9+" : count}
					</Badge>
				</DropdownMenu.Trigger>
			</Tooltip>

			<DropdownMenu.Content align="end" className="w-72">
				<DropdownMenu.Group>
					<DropdownMenu.GroupLabel>Pending Invitations</DropdownMenu.GroupLabel>
				</DropdownMenu.Group>
				{invitations.map((invitation) => (
					<DropdownMenu.Item
						className="h-auto items-start gap-3 py-2"
						key={invitation.id}
						render={
							<Link
								href={`/invitations/${invitation.id}`}
								onClick={() => setIsOpen(false)}
							/>
						}
					>
						<div className="flex size-8 shrink-0 items-center justify-center rounded bg-primary/10">
							<BuildingsIcon className="size-4 text-primary" />
						</div>
						<div className="min-w-0 flex-1">
							<p className="truncate font-medium text-sm">
								{invitation.organizationName}
							</p>
							<p className="text-muted-foreground text-xs">
								{invitation.role} · expires{" "}
								{dayjs(invitation.expiresAt).fromNow()}
							</p>
						</div>
					</DropdownMenu.Item>
				))}
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}
