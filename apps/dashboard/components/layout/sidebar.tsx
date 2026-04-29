"use client";

import {
	FEATURE_METADATA,
	type GatedFeatureId,
} from "@databuddy/shared/types/features";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useTransition,
} from "react";
import { Tooltip } from "@databuddy/ui";
import {
	ArrowLeftIcon,
	ArrowSquareOutIcon,
	CaretDownIcon,
	LockSimpleIcon,
	SpinnerIcon,
} from "@databuddy/ui/icons";
import { useBillingContext } from "@/components/providers/billing-provider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { MobileSidebar } from "./mobile-sidebar";
import { isNavItemActive } from "./navigation/nav-item-active";
import type { NavigationGroup, NavigationItem } from "./navigation/types";
import { OrganizationSelector } from "./organization-selector";
import { SidebarPanel, useSidebarLayout } from "./sidebar-layout";
import { useSidebarNavigation } from "./sidebar-navigation-provider";
import { SidebarUtilities } from "./sidebar-utilities";

const P = {
	outer: "px-2",
	outerCollapsed: "px-1.5",
	item: "px-2.5",
	icon: "size-4 shrink-0",
} as const;

function useDelayedPending(isPending: boolean, delayMs = 150) {
	const [show, setShow] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

	useEffect(() => {
		if (isPending) {
			timerRef.current = setTimeout(() => setShow(true), delayMs);
		} else {
			clearTimeout(timerRef.current);
			setShow(false);
		}
		return () => clearTimeout(timerRef.current);
	}, [isPending, delayMs]);

	return show;
}

function SidebarNavItem({
	item,
	pathname,
	currentWebsiteId,
	isDemo,
	isLocked,
	lockedPlanName,
	collapsed,
}: {
	collapsed: boolean;
	currentWebsiteId?: string | null;
	isDemo: boolean;
	isLocked: boolean;
	item: NavigationItem;
	lockedPlanName: string | null;
	pathname: string;
}) {
	const active = isNavItemActive(item, pathname, currentWebsiteId);
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const showSpinner = useDelayedPending(isPending);

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

	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			if (item.external || item.disabled) {
				return;
			}
			e.preventDefault();
			startTransition(() => {
				router.push(fullPath);
			});
		},
		[item.external, item.disabled, fullPath, router]
	);

	if (item.production === false && process.env.NODE_ENV === "production") {
		return null;
	}

	const Icon = item.icon;
	const base = cn(
		"flex min-w-0 items-center rounded text-sm",
		collapsed ? "size-9 justify-center" : "h-8 gap-2.5",
		collapsed ? "" : P.item
	);

	const iconEl = showSpinner ? (
		<SpinnerIcon aria-hidden className={cn(P.icon, "animate-spin")} />
	) : (
		<Icon aria-hidden className={P.icon} />
	);

	if (isLocked) {
		const el = (
			<div
				aria-disabled
				className={cn(base, "cursor-not-allowed text-sidebar-foreground/30")}
				title={lockedPlanName ? `Requires ${lockedPlanName} plan` : undefined}
			>
				<Icon aria-hidden className={P.icon} />
				{!collapsed && (
					<>
						<span className="min-w-0 flex-1 truncate">{item.name}</span>
						<LockSimpleIcon aria-hidden className="size-3.5 shrink-0" />
						{lockedPlanName && (
							<span className="rounded bg-sidebar-accent px-1.5 py-0.5 font-semibold text-[10px] text-sidebar-foreground/40 uppercase">
								{lockedPlanName}
							</span>
						)}
					</>
				)}
			</div>
		);
		return collapsed ? (
			<Tooltip content={`${item.name} (${lockedPlanName})`} side="right">
				{el}
			</Tooltip>
		) : (
			el
		);
	}

	if (item.disabled) {
		const el = (
			<div aria-disabled className={cn(base, "cursor-not-allowed opacity-25")}>
				<Icon aria-hidden className={P.icon} />
				{!collapsed && (
					<span className="min-w-0 flex-1 truncate">{item.name}</span>
				)}
			</div>
		);
		return collapsed ? (
			<Tooltip content={item.name} side="right">
				{el}
			</Tooltip>
		) : (
			el
		);
	}

	const LinkComponent = item.external ? "a" : Link;
	const linkProps = item.external
		? { href: item.href, target: "_blank", rel: "noopener noreferrer" }
		: { href: fullPath, prefetch: true as const };

	const el = (
		<LinkComponent
			{...linkProps}
			aria-current={active ? "page" : undefined}
			className={cn(
				base,
				"group",
				active
					? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
					: "text-sidebar-foreground/60 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
			)}
			onClick={item.external ? undefined : handleClick}
		>
			{iconEl}
			{!collapsed && (
				<>
					<span className="min-w-0 flex-1 truncate">{item.name}</span>
					{(item.alpha || item.tag || item.badge || item.external) && (
						<div className="flex shrink-0 items-center gap-1.5">
							{(item.alpha || item.tag) && (
								<span className="font-semibold text-[10px] text-sidebar-foreground/30 uppercase">
									{item.alpha ? "ALPHA" : item.tag}
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
						</div>
					)}
				</>
			)}
		</LinkComponent>
	);

	return collapsed ? (
		<Tooltip content={item.name} side="right">
			{el}
		</Tooltip>
	) : (
		el
	);
}

const COLLAPSED_GROUPS_KEY = "sidebar-collapsed-groups";

function useGroupCollapse(groupKey: string, hasActiveChild: boolean) {
	const [isCollapsed, setIsCollapsed] = useState(false);
	const initializedRef = useRef(false);

	useEffect(() => {
		if (initializedRef.current) {
			return;
		}
		initializedRef.current = true;
		try {
			const stored = JSON.parse(
				localStorage.getItem(COLLAPSED_GROUPS_KEY) || "{}"
			);
			if (stored[groupKey] === true && !hasActiveChild) {
				setIsCollapsed(true);
			}
		} catch {}
	}, [groupKey, hasActiveChild]);

	const toggle = useCallback(() => {
		setIsCollapsed((prev) => {
			const next = !prev;
			try {
				const stored = JSON.parse(
					localStorage.getItem(COLLAPSED_GROUPS_KEY) || "{}"
				);
				if (next) {
					stored[groupKey] = true;
				} else {
					delete stored[groupKey];
				}
				localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify(stored));
			} catch {}
			return next;
		});
	}, [groupKey]);

	return { isCollapsed, toggle };
}

function NavGroup({
	group,
	pathname,
	currentWebsiteId,
	isDemo,
	isFeatureEnabled,
	isBillingLoading,
	collapsed: sidebarCollapsed,
	isFirst,
}: {
	collapsed: boolean;
	currentWebsiteId?: string | null;
	group: NavigationGroup;
	isBillingLoading: boolean;
	isDemo: boolean;
	isFeatureEnabled: (feature: GatedFeatureId) => boolean;
	isFirst: boolean;
	pathname: string;
}) {
	const visibleItems = group.items.filter((item) => {
		if (item.production === false && process.env.NODE_ENV === "production") {
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

	const hasActiveChild = visibleItems.some((item) =>
		isNavItemActive(item, pathname, currentWebsiteId)
	);

	const isCollapsible = !sidebarCollapsed && !!group.label && !group.back;

	const { isCollapsed: groupCollapsed, toggle } = useGroupCollapse(
		group.label || "",
		hasActiveChild
	);

	if (visibleItems.length === 0) {
		return null;
	}

	const labelEl = (() => {
		if (sidebarCollapsed) {
			return isFirst ? null : (
				<div className="mx-auto my-1.5 h-px w-5 bg-sidebar-border/30" />
			);
		}
		if (!(group.label || group.back)) {
			return null;
		}

		const spacing = isFirst ? "pt-1 pb-1" : "pt-3 pb-1";

		if (group.back) {
			return (
				<div className={cn("flex items-center gap-1.5 px-3", spacing)}>
					<Link
						className="flex items-center gap-1 font-semibold text-[11px] text-sidebar-foreground/35 uppercase tracking-wider hover:text-sidebar-foreground/60"
						href={group.back.href}
					>
						<ArrowLeftIcon className="size-3 shrink-0" />
						{group.back.label}
					</Link>
					<span className="text-sidebar-foreground/15">/</span>
					<span className="font-semibold text-[11px] text-sidebar-foreground/35 uppercase tracking-wider">
						{group.label}
					</span>
				</div>
			);
		}

		if (isCollapsible) {
			return (
				<button
					className={cn(
						"flex w-full items-center justify-between px-3 font-semibold text-[11px] text-sidebar-foreground/35 uppercase tracking-wider hover:text-sidebar-foreground/50",
						spacing
					)}
					onClick={toggle}
					type="button"
				>
					{group.label}
					<CaretDownIcon
						className={cn(
							"size-3 shrink-0 transition-transform duration-200",
							groupCollapsed && "-rotate-90"
						)}
					/>
				</button>
			);
		}

		return (
			<div
				className={cn(
					"px-3 font-semibold text-[11px] text-sidebar-foreground/35 uppercase tracking-wider",
					spacing
				)}
			>
				{group.label}
			</div>
		);
	})();

	const itemsEl = visibleItems.map((item) => {
		const locked =
			!isBillingLoading &&
			item.gatedFeature != null &&
			!isFeatureEnabled(item.gatedFeature);

		return (
			<SidebarNavItem
				collapsed={sidebarCollapsed}
				currentWebsiteId={currentWebsiteId}
				isDemo={isDemo}
				isLocked={locked}
				item={item}
				key={`${item.name}::${item.href}`}
				lockedPlanName={
					locked && item.gatedFeature
						? (FEATURE_METADATA[item.gatedFeature]?.minPlan?.toUpperCase() ??
							null)
						: null
				}
				pathname={pathname}
			/>
		);
	});

	return (
		<div>
			{labelEl}
			<div
				className={cn(
					isCollapsible && "grid transition-[grid-template-rows] duration-200",
					isCollapsible &&
						(groupCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]")
				)}
			>
				<div
					className={cn(
						"flex flex-col gap-0.5 overflow-hidden",
						sidebarCollapsed ? cn("items-center", P.outerCollapsed) : P.outer
					)}
				>
					{itemsEl}
				</div>
			</div>
		</div>
	);
}

export function Sidebar() {
	const {
		navigation,
		currentWebsiteId,
		pathname,
		isDemo,
		navContext,
		transitionDirection,
	} = useSidebarNavigation();
	const { isFeatureEnabled, isLoading: isBillingLoading } = useBillingContext();
	const { open } = useSidebarLayout();

	const collapsed = !open;
	const topGroups = navigation.filter((g) => !g.pinToBottom);
	const bottomGroups = navigation.filter((g) => g.pinToBottom);

	const slideClass =
		transitionDirection === "left"
			? "animate-in fade-in slide-in-from-right-2 duration-150"
			: transitionDirection === "right"
				? "animate-in fade-in slide-in-from-left-2 duration-150"
				: undefined;

	const groupProps = {
		collapsed,
		currentWebsiteId,
		isBillingLoading,
		isDemo,
		isFeatureEnabled,
		pathname,
	};

	return (
		<>
			<SidebarPanel>
				<OrganizationSelector collapsed={collapsed} />

				<ScrollArea className="min-h-0 flex-1" key={navContext}>
					<div className={cn("flex flex-col", slideClass)}>
						{topGroups.map((group, i) => (
							<NavGroup
								group={group}
								isFirst={i === 0}
								key={group.label || "__top"}
								{...groupProps}
							/>
						))}
					</div>
				</ScrollArea>

				{bottomGroups.length > 0 && (
					<div className={cn("flex flex-col py-2", slideClass)}>
						{!collapsed && (
							<div className={P.outer}>
								<div className="mb-2 h-px bg-sidebar-border/30" />
							</div>
						)}
						{bottomGroups.map((group) => (
							<NavGroup
								group={group}
								isFirst
								key={group.label || "__pinned"}
								{...groupProps}
							/>
						))}
					</div>
				)}
				<SidebarUtilities collapsed={collapsed} />
			</SidebarPanel>
			<MobileSidebar />
		</>
	);
}
