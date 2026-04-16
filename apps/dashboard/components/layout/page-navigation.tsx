"use client";

import type { Icon } from "@phosphor-icons/react";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface TabItem {
	count?: number;
	href: string;
	icon?: Icon;
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
			<div
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
						<ArrowLeftIcon className="size-3.5" weight="bold" />
					</span>
					<span>{props.breadcrumb.label}</span>
				</Link>
				<span className="text-muted-foreground/40">/</span>
				<span className="font-medium text-foreground text-sm">
					{props.currentPage}
				</span>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"flex h-10 shrink-0 border-border border-b bg-accent/30",
				props.className
			)}
		>
			{props.tabs.map((tab) => {
				const isActive = pathname === tab.href;
				const IconComponent = tab.icon;

				return (
					<Link
						className={cn(
							"relative flex cursor-pointer items-center gap-2 px-3 py-2.5 font-medium text-sm transition-colors",
							isActive
								? "text-foreground"
								: "text-muted-foreground hover:text-foreground"
						)}
						href={tab.href}
						key={tab.id}
					>
						{IconComponent && (
							<span className="inline-flex">
								<IconComponent
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
							<span
								className={cn(
									"flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 font-semibold text-xs tabular-nums transition-colors",
									isActive
										? "bg-primary text-primary-foreground"
										: "bg-muted text-foreground"
								)}
							>
								{tab.count}
							</span>
						)}
						{isActive && (
							<div className="absolute inset-x-0 bottom-0 h-0.5 bg-brand-purple" />
						)}
					</Link>
				);
			})}
		</div>
	);
}
