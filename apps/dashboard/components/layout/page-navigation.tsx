"use client";

import type { ComponentType, SVGProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getActivePageNavigationTabId } from "./page-navigation-active";
import { cn } from "@/lib/utils";
import { ArrowLeftIcon } from "@databuddy/ui/icons";

type IconComponent = ComponentType<
	SVGProps<SVGSVGElement> & { size?: number | string; weight?: string }
>;

interface TabItem {
	count?: number;
	countLabel?: string;
	countTone?: "attention" | "default";
	href: string;
	icon?: IconComponent;
	id: string;
	label: string;
}

interface BreadcrumbItem {
	href: string;
	label: string;
}

interface PageNavigationTabsProps {
	className?: string;
	tabs: TabItem[];
	variant: "tabs";
}

interface PageNavigationBreadcrumbProps {
	breadcrumb: BreadcrumbItem;
	className?: string;
	currentPage: string;
	variant: "breadcrumb";
}

type PageNavigationProps =
	| PageNavigationTabsProps
	| PageNavigationBreadcrumbProps;

export function PageNavigation(props: PageNavigationProps) {
	const pathname = usePathname();

	if (props.variant === "breadcrumb") {
		return (
			<nav
				aria-label="Breadcrumb"
				className={cn(
					"flex h-10 shrink-0 items-center gap-2 border-border border-b bg-accent/30 px-3",
					props.className
				)}
			>
				<Link
					className="group flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
					href={props.breadcrumb.href}
				>
					<span className="inline-flex transition-transform duration-200 group-hover:-translate-x-0.5">
						<ArrowLeftIcon aria-hidden className="size-3.5" weight="bold" />
					</span>
					<span>{props.breadcrumb.label}</span>
				</Link>
				<span className="text-muted-foreground/40">/</span>
				<span className="font-medium text-foreground text-sm">
					{props.currentPage}
				</span>
			</nav>
		);
	}

	const activeTabId = getActivePageNavigationTabId(props.tabs, pathname);

	return (
		<nav
			aria-label="Page sections"
			className={cn(
				"flex h-10 shrink-0 overflow-x-auto overscroll-x-contain border-border border-b bg-accent/30",
				props.className
			)}
		>
			{props.tabs.map((tab) => {
				const isActive = activeTabId === tab.id;
				const IconComponent = tab.icon;

				return (
					<Link
						aria-current={isActive ? "page" : undefined}
						className={cn(
							"relative flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap px-2.5 py-2.5 font-medium text-sm transition-colors sm:gap-2 sm:px-3",
							isActive
								? "text-foreground"
								: "text-muted-foreground hover:text-foreground"
						)}
						href={tab.href}
						key={tab.id}
					>
						{IconComponent && (
							<span className="hidden sm:inline-flex">
								<IconComponent
									aria-hidden
									className={cn(
										"size-4 transition-colors",
										isActive && "text-primary"
									)}
									weight={isActive ? "fill" : "duotone"}
								/>
							</span>
						)}
						{tab.label}
						{tab.count !== undefined && tab.count > 0 && (
							<>
								<span
									aria-hidden={tab.countLabel ? true : undefined}
									className={cn(
										"flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 font-semibold text-xs tabular-nums transition-colors",
										tab.countTone === "attention"
											? "bg-destructive text-destructive-foreground"
											: isActive
												? "bg-primary text-primary-foreground"
												: "bg-muted text-foreground"
									)}
								>
									{tab.count > 99 ? "99+" : tab.count}
								</span>
								{tab.countLabel ? (
									<span className="sr-only">{tab.countLabel}</span>
								) : null}
							</>
						)}
						{isActive && (
							<div className="absolute inset-x-0 bottom-0 h-0.5 bg-brand-purple" />
						)}
					</Link>
				);
			})}
		</nav>
	);
}
