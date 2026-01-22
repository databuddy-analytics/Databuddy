import {
	ArrowTopRightOnSquareIcon,
	LockClosedIcon,
} from "@heroicons/react/24/outline";
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
		if (isRootLevel) {
			return href;
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
					className="shrink-0 rounded"
					domain={domain}
					fallbackIcon={
						<Icon aria-hidden className="size-5 shrink-0" />
					}
					size={20}
				/>
			) : (
				<Icon aria-hidden className="size-5 shrink-0" />
			)}
			<span className="min-w-0 flex-1 truncate text-base font-medium">{name}</span>
		</>
	);

	if (isLocked) {
		return (
			<div
				aria-disabled
				className="group flex h-16 min-w-0 cursor-not-allowed items-center gap-3 border-b border-border px-4 text-muted-foreground/50 text-base"
				title={lockedPlanName ? `Requires ${lockedPlanName} plan` : undefined}
			>
				{content}
				<div className="flex shrink-0 items-center gap-1.5">
					<LockClosedIcon aria-hidden className="size-3" />
					{lockedPlanName && (
						<span className="rounded bg-muted px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground uppercase">
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
				className="group flex h-16 min-w-0 cursor-not-allowed items-center gap-3 border-b border-border px-4 text-muted-foreground/40 text-base"
			>
				{content}
				{tag && (
					<span className="shrink-0 font-mono text-muted-foreground/40 text-xs uppercase">
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
				"group flex h-16 min-w-0 items-center gap-3 border-b border-border px-4 text-base transition-colors",
				isActive
					? "bg-muted font-medium text-foreground"
					: "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
			)}
			data-nav-href={href}
			data-nav-item={name}
			data-nav-section={sectionName || "main"}
			data-track="navigation-item-click"
			role="menuitem"
		>
			{content}
			<div className="flex shrink-0 items-center gap-1.5">
				{alpha && (
					<span className="font-mono text-muted-foreground text-xs">
						ALPHA
					</span>
				)}
				{tag && (
					<span className="font-mono text-muted-foreground text-xs uppercase">
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
					<ArrowTopRightOnSquareIcon
						aria-hidden
						className="size-3 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100"
					/>
				)}
			</div>
		</LinkComponent>
	);
}
