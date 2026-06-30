"use client";

import { authClient } from "@databuddy/auth/client";
import {
	FEATURE_METADATA,
	type GatedFeatureId,
} from "@databuddy/shared/types/features";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	ArrowSquareOutIcon,
	ListIcon,
	LockSimpleIcon,
	MagnifyingGlassIcon,
	MonitorIcon,
	MoonIcon,
	SignOutIcon,
	SunIcon,
} from "@databuddy/ui/icons";
import { useBillingContext } from "@/components/providers/billing-provider";
import { useCommandSearchOpenAction } from "@/components/ui/command-search";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Branding } from "./logo";
import { isNavItemActive } from "./navigation/nav-item-active";
import type { NavigationGroup, NavigationItem } from "./navigation/types";
import { OrganizationSelector } from "./organization-selector";
import { useSidebarNavigation } from "./sidebar-navigation-provider";
import { Button } from "@databuddy/ui";
import { Avatar } from "@databuddy/ui/client";

function MobileThemeToggle() {
	const { theme, setTheme } = useTheme();
	const current = theme ?? "system";

	const themes = [
		{ id: "light" as const, icon: SunIcon, label: "Light" },
		{ id: "dark" as const, icon: MoonIcon, label: "Dark" },
		{ id: "system" as const, icon: MonitorIcon, label: "System" },
	];

	return (
		<div className="flex gap-0.5 rounded bg-sidebar-accent/40 p-0.5">
			{themes.map(({ id, icon: Icon, label }) => (
				<button
					className={cn(
						"flex h-8 flex-1 items-center justify-center gap-1.5 rounded font-semibold text-xs",
						current === id
							? "bg-background text-sidebar-accent-foreground shadow-sm"
							: "text-sidebar-foreground/50 hover:text-sidebar-foreground"
					)}
					key={id}
					onClick={() => setTheme(id)}
					suppressHydrationWarning
					type="button"
				>
					<Icon className="size-4 shrink-0" suppressHydrationWarning />
					<span suppressHydrationWarning>{label}</span>
				</button>
			))}
		</div>
	);
}

function getInitials(
	name: string | null | undefined,
	email: string | null | undefined
) {
	if (name) {
		return name
			.split(" ")
			.map((n) => n.at(0))
			.join("")
			.toUpperCase()
			.slice(0, 2);
	}
	return email?.at(0)?.toUpperCase() || "U";
}

function MobileNavItem({
	item,
	pathname,
	currentWebsiteId,
	isDemo,
	isLocked,
	lockedPlanName,
}: {
	currentWebsiteId?: string | null;
	isDemo: boolean;
	isLocked: boolean;
	item: NavigationItem;
	lockedPlanName: string | null;
	pathname: string;
}) {
	const active = isNavItemActive(item, pathname, currentWebsiteId);

	const fullPath = useMemo(() => {
		if (item.rootLevel) {
			return item.href;
		}
		if (isDemo) {
			return item.href === ""
				? `/demo/${currentWebsiteId}`
				: `/demo/${currentWebsiteId}${item.href}`;
		}
		return `/websites/${currentWebsiteId}${item.href}`;
	}, [item.href, item.rootLevel, currentWebsiteId, isDemo]);

	if (item.production === false && process.env.NODE_ENV === "production") {
		return null;
	}

	const Icon = item.icon;
	const base = "flex h-9 min-w-0 items-center gap-3 rounded px-3 text-sm";

	if (isLocked) {
		return (
			<div
				aria-disabled
				className={cn(base, "cursor-not-allowed text-sidebar-foreground/30")}
			>
				<Icon aria-hidden className="size-[18px] shrink-0" />
				<span className="min-w-0 flex-1 truncate">{item.name}</span>
				<LockSimpleIcon aria-hidden className="size-3.5 shrink-0" />
				{lockedPlanName && (
					<span className="rounded bg-sidebar-accent px-1.5 py-0.5 font-semibold text-[10px] text-sidebar-foreground/40 uppercase">
						{lockedPlanName}
					</span>
				)}
			</div>
		);
	}

	if (item.disabled) {
		return (
			<div aria-disabled className={cn(base, "cursor-not-allowed opacity-25")}>
				<Icon aria-hidden className="size-[18px] shrink-0" />
				<span className="min-w-0 flex-1 truncate">{item.name}</span>
			</div>
		);
	}

	const LinkComponent = item.external ? "a" : Link;
	const linkProps = item.external
		? { href: item.href, target: "_blank", rel: "noopener noreferrer" }
		: { href: fullPath, prefetch: true as const };

	return (
		<LinkComponent
			{...linkProps}
			aria-current={active ? "page" : undefined}
			className={cn(
				base,
				"group",
				active
					? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
					: "text-sidebar-foreground/60 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
			)}
		>
			<Icon aria-hidden className="size-[18px] shrink-0" />
			<span className="min-w-0 flex-1 truncate">{item.name}</span>
			{item.alpha && (
				<span className="font-semibold text-[10px] text-sidebar-foreground/30 uppercase">
					ALPHA
				</span>
			)}
			{item.badge && (
				<span
					className={cn(
						"rounded px-1.5 py-0.5 font-semibold text-[10px]",
						item.badge.variant === "orange"
							? "bg-amber-500/10 text-amber-600 dark:text-amber-500"
							: item.badge.variant === "red"
								? "bg-destructive/10 text-destructive"
								: "bg-accent text-accent-foreground"
					)}
				>
					{item.badge.text}
				</span>
			)}
			{item.external && (
				<ArrowSquareOutIcon
					aria-hidden
					className="size-3.5 shrink-0 text-sidebar-foreground/25 opacity-0 group-hover:opacity-100"
				/>
			)}
		</LinkComponent>
	);
}

function MobileNavGroup({
	group,
	pathname,
	currentWebsiteId,
	isDemo,
	isFeatureEnabled,
	isBillingLoading,
}: {
	currentWebsiteId?: string | null;
	group: NavigationGroup;
	isBillingLoading: boolean;
	isDemo: boolean;
	isFeatureEnabled: (feature: GatedFeatureId) => boolean;
	pathname: string;
}) {
	const visibleItems = group.items.filter((item) => {
		if (item.production === false && process.env.NODE_ENV === "production") {
			return false;
		}
		if (item.hideFromSidebar) {
			return false;
		}
		if (item.hideFromDemo && isDemo) {
			return false;
		}
		if (item.showOnlyOnDemo && !isDemo) {
			return false;
		}
		return true;
	});

	if (visibleItems.length === 0) {
		return null;
	}

	return (
		<div>
			{group.label && (
				<div className="px-4 pt-5 pb-2 font-semibold text-[11px] text-sidebar-foreground/35 uppercase tracking-wider">
					{group.label}
				</div>
			)}
			<div className="flex flex-col gap-0.5 px-2">
				{visibleItems.map((item) => {
					const locked =
						!isBillingLoading &&
						item.gatedFeature != null &&
						!isFeatureEnabled(item.gatedFeature);

					return (
						<MobileNavItem
							currentWebsiteId={currentWebsiteId}
							isDemo={isDemo}
							isLocked={locked}
							item={item}
							key={`${item.name}::${item.href}`}
							lockedPlanName={
								locked && item.gatedFeature
									? (FEATURE_METADATA[
											item.gatedFeature
										]?.minPlan?.toUpperCase() ?? null)
									: null
							}
							pathname={pathname}
						/>
					);
				})}
			</div>
		</div>
	);
}

export function MobileSidebar() {
	const { data: session } = authClient.useSession();
	const user = session?.user ?? null;

	const { navigation, currentWebsiteId, pathname, isDemo } =
		useSidebarNavigation();
	const { isFeatureEnabled, isLoading: isBillingLoading } = useBillingContext();

	const [isOpen, setIsOpen] = useState(false);
	const router = useRouter();
	const openSearch = useCommandSearchOpenAction();

	useEffect(() => {
		setIsOpen(false);
	}, [pathname]);

	const handleSignOut = useCallback(async () => {
		setIsOpen(false);
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					toast.success("Logged out successfully");
					router.push("/login");
				},
				onError: (error) => {
					router.push("/login");
					toast.error(error.error.message || "Failed to log out");
				},
			},
		});
	}, [router]);

	const topGroups = navigation.filter((g) => !g.pinToBottom);
	const bottomGroups = navigation.filter((g) => g.pinToBottom);

	const groupProps = {
		currentWebsiteId,
		isBillingLoading,
		isDemo,
		isFeatureEnabled,
		pathname,
	};

	return (
		<div className="md:hidden">
			<header className="fixed top-0 right-0 left-0 z-40 h-12 w-full border-b bg-sidebar">
				<div className="flex h-full items-center justify-between px-3">
					<div className="flex items-center gap-2.5">
						<Button
							aria-label="Open navigation menu"
							onClick={() => setIsOpen(true)}
							size="sm"
							variant="ghost"
						>
							<ListIcon className="size-[18px] shrink-0" />
						</Button>
						<Link
							className="flex min-w-0 select-none items-center gap-2 hover:opacity-80"
							href="/home"
						>
							<Branding heightPx={22} priority variant="primary-logo" />
						</Link>
					</div>
					<Button
						aria-label="Search"
						onClick={() => openSearch()}
						size="sm"
						variant="ghost"
					>
						<MagnifyingGlassIcon className="size-[18px] shrink-0" />
					</Button>
				</div>
			</header>

			<Drawer direction="left" onOpenChange={setIsOpen} open={isOpen}>
				<DrawerContent className="bg-sidebar">
					<div className="flex h-12 shrink-0 items-center border-b px-4">
						<Link
							className="flex select-none items-center gap-2 hover:opacity-80"
							href="/home"
							onClick={() => setIsOpen(false)}
						>
							<Branding heightPx={22} priority variant="primary-logo" />
						</Link>
					</div>

					<OrganizationSelector />

					<ScrollArea className="flex-1">
						<div className="flex flex-col pb-2">
							{topGroups.map((group) => (
								<MobileNavGroup
									group={group}
									key={group.label || "__top"}
									{...groupProps}
								/>
							))}
						</div>
					</ScrollArea>

					<div className="shrink-0 border-sidebar-border/40 border-t bg-sidebar">
						{bottomGroups.map((group) => (
							<MobileNavGroup
								group={group}
								key={group.label || "__bottom"}
								{...groupProps}
							/>
						))}

						<div className="px-3 py-2.5">
							<MobileThemeToggle />
						</div>

						{user && (
							<div className="flex items-center gap-3 border-sidebar-border/40 border-t px-3 py-3">
								<Avatar
									alt={user.name || "User"}
									className="size-9 shrink-0"
									fallback={getInitials(user.name, user.email)}
									src={user.image || undefined}
								/>
								<div className="min-w-0 flex-1">
									<p className="truncate font-semibold text-sidebar-foreground text-sm">
										{user.name || "User"}
									</p>
									<p className="truncate text-sidebar-foreground/40 text-xs">
										{user.email}
									</p>
								</div>
								<Button
									aria-label="Sign out"
									className="shrink-0 text-sidebar-foreground/40 hover:text-destructive"
									onClick={handleSignOut}
									size="sm"
									variant="ghost"
								>
									<SignOutIcon className="size-[18px] shrink-0" />
								</Button>
							</div>
						)}
					</div>
				</DrawerContent>
			</Drawer>
		</div>
	);
}
