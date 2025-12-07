import { ArrowSquareOutIcon, LockSimpleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { cn } from "@/lib/utils";
import type { NavigationItem as NavigationItemType } from "./types";

interface NavigationItemProps extends Omit<NavigationItemType, "icon"> {
	icon: NavigationItemType["icon"];
	isActive: boolean;
	isRootLevel: boolean;
	isExternal?: boolean;
	currentWebsiteId?: string | null;
	sectionName?: string;
	isLocked?: boolean;
	lockedPlanName?: string | null;
}

export function NavigationItem({
	name,
	icon: Icon,
	href,
	alpha,
	tag,
	isActive,
	isRootLevel,
	isExternal,
	production,
	currentWebsiteId,
	domain,
	disabled,
	sectionName,
	badge,
	isLocked = false,
	lockedPlanName,
}: NavigationItemProps) {
	const pathname = usePathname();

	const fullPath = useMemo(() => {
		if (isRootLevel) return href;
		if (currentWebsiteId === "sandbox") {
			return href === "" ? "/sandbox" : `/sandbox${href}`;
		}
		if (pathname.startsWith("/demo/")) {
			return href === ""
				? `/demo/${currentWebsiteId}`
				: `/demo/${currentWebsiteId}${href}`;
		}
		return `/websites/${currentWebsiteId}${href}`;
	}, [href, isRootLevel, currentWebsiteId, pathname]);

	if (production === false && process.env.NODE_ENV === "production") {
		return null;
	}

	const content = (
		<>
			{domain ? (
				<FaviconImage
					className="rounded"
					domain={domain}
					fallbackIcon={
						<Icon aria-hidden className="size-5 shrink-0" weight="duotone" />
					}
					size={20}
				/>
			) : (
				<Icon aria-hidden className="size-4 shrink-0" />
			)}
			<span className="flex-1">{name}</span>
		</>
	);

	if (isLocked) {
		return (
			<div
				aria-disabled
				className="group flex cursor-not-allowed items-center gap-3 px-4 py-2.5 text-sidebar-foreground/40 text-sm"
				title={lockedPlanName ? `Requires ${lockedPlanName} plan` : undefined}
			>
				{content}
				<div className="flex items-center gap-1.5">
					<LockSimpleIcon aria-hidden className="size-3" />
					{lockedPlanName && (
						<span className="rounded bg-sidebar-accent px-1.5 py-0.5 font-medium text-[10px] text-sidebar-foreground/50 uppercase">
							{lockedPlanName}
						</span>
					)}
				</div>
			</div>
		);
	}

	if (disabled) {
		return (
			<div
				aria-disabled
				className="group flex cursor-not-allowed items-center gap-3 px-4 py-2.5 text-sidebar-foreground/30 text-sm"
			>
				{content}
				{tag && (
					<span className="font-mono text-sidebar-foreground/30 text-xs uppercase">
						{tag}
					</span>
				)}
			</div>
		);
	}

	const LinkComponent = isExternal ? "a" : Link;
	const linkProps = isExternal
		? { href, target: "_blank", rel: "noopener noreferrer" }
		: { href: fullPath, prefetch: true };

	return (
		<LinkComponent
			{...linkProps}
			aria-current={isActive ? "page" : undefined}
			aria-label={`${name}${isExternal ? " (opens in new tab)" : ""}`}
			className={cn(
				"group flex items-center gap-3 border-transparent border-r-2 px-4 py-2.5 text-sm hover:text-sidebar-accent-foreground",
				isActive
					? "border-sidebar-ring bg-sidebar-accent font-medium text-sidebar-accent-foreground"
					: "text-sidebar-foreground/70 hover:bg-sidebar-accent"
			)}
			data-nav-href={href}
			data-nav-item={name}
			data-nav-section={sectionName || "main"}
			data-track="navigation-item-click"
			role="menuitem"
		>
			{content}
			<div className="flex items-center gap-1.5">
				{alpha && (
					<span className="font-mono text-sidebar-foreground/50 text-xs">
						ALPHA
					</span>
				)}
				{tag && (
					<span className="font-mono text-sidebar-foreground/50 text-xs uppercase">
						{tag}
					</span>
				)}
				{badge && (
					<span
						className={cn(
							"rounded px-1.5 py-0.5 font-medium text-xs",
							badge.variant === "purple" && "bg-accent text-accent-foreground",
							badge.variant === "blue" && "bg-accent text-accent-foreground",
							badge.variant === "green" && "bg-accent text-accent-foreground",
							badge.variant === "orange" &&
								"bg-amber-500/10 text-amber-600 dark:text-amber-500",
							badge.variant === "red" && "bg-destructive/10 text-destructive"
						)}
					>
						{badge.text}
					</span>
				)}
				{isExternal && (
					<ArrowSquareOutIcon
						aria-hidden
						className="size-3 text-sidebar-ring opacity-0 transition-opacity duration-200 group-hover:opacity-100"
						weight="duotone"
					/>
				)}
			</div>
		</LinkComponent>
	);
}
