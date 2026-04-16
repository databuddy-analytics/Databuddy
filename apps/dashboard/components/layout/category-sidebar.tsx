"use client";

import { Branding } from "@/components/layout/logo";
import { useCommandSearchOpenAction } from "@/components/ui/command-search";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { authClient } from "@databuddy/auth/client";
import { InfoIcon } from "@phosphor-icons/react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { Button } from "../ui/button";
import { PendingInvitationsButton } from "./pending-invitations-button";
import { ProfileButtonClient } from "./profile-button-client";
import { useSidebarNavigation } from "./sidebar-navigation-provider";
import { ThemeToggle } from "./theme-toggle";

const HelpDialog = dynamic(
	() => import("./help-dialog").then((mod) => mod.HelpDialog),
	{
		ssr: false,
		loading: () => null,
	}
);

export function CategorySidebar() {
	const { data: session } = authClient.useSession();
	const user = session?.user ?? null;

	const { categories, activeCategory, setCategory } = useSidebarNavigation();
	const [helpOpen, setHelpOpen] = useState(false);
	const openCommandSearchAction = useCommandSearchOpenAction();

	return (
		<div className="fixed inset-y-0 left-0 z-40 w-12 border-r bg-transparent">
			<div className="flex h-full flex-col">
				<div className="flex h-12 shrink-0 items-center justify-center border-border border-b">
					<Link
						className="relative shrink-0 transition-opacity hover:opacity-80"
						href="/websites"
					>
						<Branding heightPx={28} priority variant="logomark" />
					</Link>
				</div>

				<div className="shrink-0">
					<Tooltip delayDuration={500}>
						<TooltipTrigger asChild>
							<button
								aria-label="Search"
								className="relative flex h-10 w-full cursor-pointer items-center justify-center border-border border-b hover:bg-sidebar-accent-brighter focus:outline-none"
								onClick={() => openCommandSearchAction()}
								type="button"
							>
								<MagnifyingGlassIcon
									className="size-5 text-sidebar-foreground/75"
									weight="duotone"
								/>
							</button>
						</TooltipTrigger>
						<TooltipContent
							className="max-w-xs text-balance"
							side="right"
							sideOffset={8}
						>
							Search
						</TooltipContent>
					</Tooltip>
				</div>

				{categories.map((category, idx) => {
					const Icon = category.icon;
					const isActive = activeCategory === category.id;
					const isLast = idx === categories.length - 1;
					const borderClass = isActive && !isLast ? "border-accent" : "";
					const hoverClass = isActive ? "" : "hover:bg-sidebar-accent-brighter";
					const boxClass = isLast
						? "border-border border-b"
						: "border-transparent";

					return (
						<Tooltip delayDuration={500} key={category.id}>
							<TooltipTrigger asChild>
								<button
									className={cn(
										borderClass,
										"relative flex h-10 w-full cursor-pointer items-center justify-center",
										"focus:outline-none",
										hoverClass,
										boxClass
									)}
									onClick={() => setCategory(category.id)}
									type="button"
								>
									{isActive ? (
										<div
											className={cn(
												"absolute top-0 left-0 -z-10 h-full w-full bg-sidebar-accent-brighter"
											)}
										/>
									) : null}
									<Icon
										className={cn(
											"size-5",
											isActive
												? "text-sidebar-ring"
												: "text-sidebar-foreground/75"
										)}
										weight={isActive ? "fill" : "duotone"}
									/>
								</button>
							</TooltipTrigger>
							<TooltipContent side="right" sideOffset={8}>
								{category.name}
							</TooltipContent>
						</Tooltip>
					);
				})}

				<div className="flex-1" />

				<div className="space-y-2 border-t p-2 pb-4">
					<div className="flex justify-center">
						<div className="flex size-8 items-center justify-center">
							<ThemeToggle tooltip />
						</div>
					</div>

					<div className="flex justify-center">
						<Button
							className="flex size-8 items-center justify-center"
							onClick={() => setHelpOpen(true)}
							suppressHydrationWarning
							type="button"
							variant="ghost"
						>
							<InfoIcon
								className="size-5 text-sidebar-foreground/75"
								weight="duotone"
							/>
						</Button>
					</div>

					{user ? (
						<div className="flex justify-center">
							<PendingInvitationsButton />
						</div>
					) : null}
					<div className="flex justify-center">
						<ProfileButtonClient user={user} />
					</div>
				</div>

				<HelpDialog onOpenChangeAction={setHelpOpen} open={helpOpen} />
			</div>
		</div>
	);
}
