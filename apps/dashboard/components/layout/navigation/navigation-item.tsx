import { ArrowSquareOutIcon } from "@phosphor-icons/react";
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
}

export function NavigationItem({
	name,
	icon: Icon,
	href,
	alpha,
	isActive,
	isRootLevel,
	isExternal,
	production,
	currentWebsiteId,
	domain,
	disabled,
	sectionName,
	badge,
}: NavigationItemProps) {
	const pathname = usePathname();

	const fullPath = useMemo(() => {
		if (isRootLevel) {
			return href;
		}
		if (currentWebsiteId === "sandbox") {
			return href === "" ? "/sandbox" : `/sandbox${href}`;
		}

		if (
			pathname.startsWith("/observability/database/") &&
			pathname !== "/observability/database" &&
			pathname !== "/observability/database/"
		) {
			return href === ""
				? `/observability/database/${currentWebsiteId}`
				: `/observability/database/${currentWebsiteId}${href}`;
		}

		if (pathname.startsWith("/demo/")) {
			return href === ""
				? `/demo/${currentWebsiteId}`
				: `/demo/${currentWebsiteId}${href}`;
		}

		return `/websites/${currentWebsiteId}${href}`;
	}, [href, isRootLevel, currentWebsiteId, pathname]);

	const LinkComponent = isExternal ? "a" : Link;

	if (production === false && process.env.NODE_ENV === "production") {
		return null;
	}

	const linkProps = isExternal
		? { href, target: "_blank", rel: "noopener noreferrer" }
		: {
				href: fullPath,
				prefetch: true,
			};

	const content = (
		<>
			{domain ? (
				<FaviconImage
					className="rounded"
					domain={domain}
					fallbackIcon={
						<Icon
							aria-hidden="true"
							className="size-5 flex-shrink-0"
							weight="duotone"
						/>
					}
					size={20}
				/>
			) : (
				<Icon
					aria-hidden="true"
					className="size-5 flex-shrink-0"
					weight="duotone"
				/>
			)}
			<span className="flex-1">{name}</span>
		</>
	);

	if (disabled) {
		return (
			<div
				aria-disabled="true"
				className={cn(
					"group flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
					"cursor-not-allowed text-sidebar-foreground/30"
				)}
			>
				{content}
			</div>
		);
	}

	return (
		<LinkComponent
			{...linkProps}
			aria-current={isActive ? "page" : undefined}
			aria-label={`${name}${isExternal ? " (opens in new tab)" : ""}`}
			className={cn(
				"group flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
				isActive
					? "border-sidebar-ring border-r-2 bg-sidebar-accent font-medium text-sidebar-accent-foreground"
					: "text-sidebar-foreground/70"
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
				{badge && (
					<span
						className={cn(
							"rounded px-1.5 py-0.5 font-medium text-xs",
							badge.variant === "purple" && "bg-accent text-accent-foreground",
							badge.variant === "blue" && "bg-accent text-accent-foreground",
							badge.variant === "green" && "bg-accent text-accent-foreground",
							badge.variant === "orange" && "bg-muted text-muted-foreground",
							badge.variant === "red" && "bg-destructive/10 text-destructive"
						)}
					>
						{badge.text}
					</span>
				)}
				{isExternal && (
					<ArrowSquareOutIcon
						aria-hidden="true"
						className="h-3 w-3 text-sidebar-ring opacity-0 transition-opacity duration-200 group-hover:opacity-100"
						weight="duotone"
					/>
				)}
			</div>
		</LinkComponent>
	);
}
