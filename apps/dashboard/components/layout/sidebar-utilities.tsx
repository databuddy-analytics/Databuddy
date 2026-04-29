"use client";

import { cn } from "@/lib/utils";
import { authClient } from "@databuddy/auth/client";
import { Skeleton, Tooltip } from "@databuddy/ui";
import { Avatar, DropdownMenu } from "@databuddy/ui/client";
import {
	BugIcon,
	CalendarIcon,
	EnvelopeIcon,
	LifebuoyIcon,
	MoonIcon,
	SunIcon,
} from "@databuddy/ui/icons";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { getInitials, ProfileDropdownContent } from "./profile-button-client";

const THEMES = [
	{ value: "light", icon: SunIcon, label: "Light" },
	{ value: "dark", icon: MoonIcon, label: "Dark" },
] as const;

function utilityTriggerClass(collapsed: boolean, active = false) {
	return cn(
		"flex min-w-0 items-center rounded text-sm transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
		collapsed ? "size-9 justify-center" : "h-8 w-full gap-2.5 px-2.5 text-left",
		active
			? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
			: "text-sidebar-foreground/60 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
	);
}

function UtilityTooltip({
	children,
	collapsed,
	label,
}: {
	children: ReactNode;
	collapsed: boolean;
	label: string;
}) {
	if (!collapsed) {
		return children;
	}

	return (
		<Tooltip content={label} side="right">
			{children}
		</Tooltip>
	);
}

function SupportMenu({ collapsed }: { collapsed: boolean }) {
	const router = useRouter();

	const trigger = (
		<DropdownMenu.Trigger
			aria-label="Support"
			className={utilityTriggerClass(collapsed)}
			render={<button type="button" />}
		>
			<LifebuoyIcon aria-hidden className="size-4 shrink-0" />
			{!collapsed && <span className="min-w-0 flex-1 truncate">Support</span>}
		</DropdownMenu.Trigger>
	);

	return (
		<DropdownMenu>
			<UtilityTooltip collapsed={collapsed} label="Support">
				{trigger}
			</UtilityTooltip>
			<DropdownMenu.Content
				align="end"
				className="w-52"
				side="right"
				sideOffset={8}
			>
				<DropdownMenu.Item onClick={() => router.push("/feedback")}>
					<EnvelopeIcon className="size-4 shrink-0" />
					Feedback
				</DropdownMenu.Item>
				<DropdownMenu.Item
					onClick={() => window.open("mailto:support@databuddy.cc", "_self")}
				>
					<LifebuoyIcon className="size-4 shrink-0" />
					Contact support
				</DropdownMenu.Item>
				<DropdownMenu.Item
					onClick={() =>
						window.open(
							"https://github.com/databuddy-analytics/Databuddy/issues",
							"_blank"
						)
					}
				>
					<BugIcon className="size-4 shrink-0" />
					Report a bug
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item
					onClick={() =>
						window.open("https://cal.com/izadoesdev", "_blank")
					}
				>
					<CalendarIcon className="size-4 shrink-0" />
					Book a meeting
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}

function ThemeCycleButton({ collapsed }: { collapsed: boolean }) {
	const { theme, setTheme } = useTheme();
	const currentIndex = THEMES.findIndex((t) => t.value === (theme ?? "light"));
	const nextIndex = (currentIndex + 1) % THEMES.length;
	const current = THEMES[currentIndex === -1 ? 0 : currentIndex];
	const CurrentIcon = current.icon;

	return (
		<Tooltip content={current.label} side="right">
			<button
				aria-label={`Theme: ${current.label}`}
				className={cn(
					"flex shrink-0 items-center justify-center rounded transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
					"text-sidebar-foreground/60 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
					collapsed ? "size-9" : "size-8"
				)}
				onClick={() => setTheme(THEMES[nextIndex].value)}
				type="button"
			>
				<CurrentIcon aria-hidden className="size-4" />
			</button>
		</Tooltip>
	);
}

function AccountMenu({ collapsed }: { collapsed: boolean }) {
	const { data: session, isPending } = authClient.useSession();
	const user = session?.user ?? null;
	const [isOpen, setIsOpen] = useState(false);

	if (isPending) {
		return (
			<div className={cn("px-2", collapsed && "px-1.5")}>
				<Skeleton
					className={cn("rounded", collapsed ? "size-9" : "h-10 w-full")}
				/>
			</div>
		);
	}

	if (!user) {
		return null;
	}

	const label = user.name || user.email || "Account";
	const trigger = (
		<DropdownMenu.Trigger
			aria-label="Account"
			className={cn(
				utilityTriggerClass(collapsed, isOpen),
				!collapsed && "h-10"
			)}
			render={<button type="button" />}
		>
			<Avatar
				alt={user.name || "User"}
				className="size-5 shrink-0"
				fallback={getInitials(user.name, user.email)}
				src={user.image || undefined}
			/>
			{!collapsed && (
				<div className="min-w-0 flex-1 text-left">
					<div className="truncate font-medium leading-tight">{label}</div>
					{user.email && (
						<div className="truncate text-[11px] text-sidebar-foreground/35 leading-tight">
							{user.email}
						</div>
					)}
				</div>
			)}
		</DropdownMenu.Trigger>
	);

	return (
		<DropdownMenu onOpenChange={setIsOpen} open={isOpen}>
			<UtilityTooltip collapsed={collapsed} label={label}>
				{trigger}
			</UtilityTooltip>
			<ProfileDropdownContent
				align="end"
				isOpen={isOpen}
				onClose={() => setIsOpen(false)}
				side="right"
				sideOffset={8}
				user={user}
			/>
		</DropdownMenu>
	);
}

export function SidebarUtilities({ collapsed }: { collapsed: boolean }) {
	return (
		<div
			className={cn(
				"flex shrink-0 flex-col gap-0.5 border-sidebar-border/30 border-t py-2",
				collapsed ? "items-center px-1.5" : "px-2"
			)}
		>
			<div className="flex items-center gap-0.5">
				<SupportMenu collapsed={collapsed} />
				<ThemeCycleButton collapsed={collapsed} />
			</div>
			<AccountMenu collapsed={collapsed} />
		</div>
	);
}
