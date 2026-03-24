"use client";

import { BuildingsIcon, EnvelopeIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import dayjs from "@/lib/dayjs";
import { cn } from "@/lib/utils";
import { useUserInvitations } from "./hooks/use-user-invitations";

export function PendingInvitationsButton() {
	const [isOpen, setIsOpen] = useState(false);
	const { invitations, count, isLoading } = useUserInvitations();

	if (isLoading || count === 0) {
		return null;
	}

	return (
		<DropdownMenu onOpenChange={setIsOpen} open={isOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<Button
							className="relative flex size-8 items-center justify-center"
							type="button"
							variant="ghost"
						>
							<EnvelopeIcon className="size-5" weight="duotone" />
							<Badge
								className={cn(
									"absolute -top-1 -right-1 flex size-4 items-center justify-center p-0 text-[10px]",
									"zoom-in-50 animate-in duration-200"
								)}
								variant="destructive"
							>
								{count > 9 ? "9+" : count}
							</Badge>
						</Button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="right">
					{count} pending invitation{count === 1 ? "" : "s"}
				</TooltipContent>
			</Tooltip>

			<DropdownMenuContent align="start" className="w-72" side="right">
				<div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">
					Pending Invitations
				</div>
				{invitations.map((invitation) => (
					<DropdownMenuItem
						asChild
						className="cursor-pointer"
						key={invitation.id}
					>
						<Link
							className="flex items-start gap-3 py-2"
							href={`/invitations/${invitation.id}`}
							onClick={() => setIsOpen(false)}
						>
							<div className="flex size-8 shrink-0 items-center justify-center rounded bg-primary/10">
								<BuildingsIcon
									className="size-4 text-primary"
									weight="duotone"
								/>
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
						</Link>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
