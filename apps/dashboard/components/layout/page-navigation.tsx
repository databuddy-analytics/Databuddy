"use client";

import type { Icon } from "@phosphor-icons/react";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface TabItem {
	id: string;
	label: string;
	href: string;
	icon?: Icon;
	count?: number;
}

interface BreadcrumbItem {
	label: string;
	href: string;
}

interface PageNavigationTabsProps {
	variant: "tabs";
	tabs: TabItem[];
	className?: string;
}

interface PageNavigationBreadcrumbProps {
	variant: "breadcrumb";
	breadcrumb: BreadcrumbItem;
	currentPage: string;
	className?: string;
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
					"box-border flex h-10 shrink-0 items-center gap-2 border-border border-b bg-accent/30 px-3",
					props.className
				)}
			>
				<Link
					className="group flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
					href={props.breadcrumb.href}
				>
					<motion.span
						className="inline-flex"
						transition={{ type: "spring", stiffness: 400, damping: 25 }}
						whileHover={{ x: -2 }}
					>
						<ArrowLeftIcon className="size-3.5" weight="bold" />
					</motion.span>
					<span>{props.breadcrumb.label}</span>
				</Link>
				<motion.span
					animate={{ opacity: 1 }}
					className="text-muted-foreground/40"
					initial={{ opacity: 0 }}
					transition={{ delay: 0.1 }}
				>
					/
				</motion.span>
				<motion.span
					animate={{ opacity: 1, x: 0 }}
					className="font-medium text-foreground text-sm"
					initial={{ opacity: 0, x: -8 }}
					transition={{
						type: "spring",
						stiffness: 300,
						damping: 25,
						delay: 0.05,
					}}
				>
					{props.currentPage}
				</motion.span>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"box-border flex h-10 shrink-0 border-border border-b bg-accent/30",
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
							<motion.span
								animate={{ scale: isActive ? 1 : 0.95 }}
								className="inline-flex"
								transition={{ type: "spring", stiffness: 400, damping: 25 }}
							>
								<IconComponent
									className={cn(
										"size-4 transition-colors",
										isActive && "text-primary"
									)}
									weight={isActive ? "fill" : "duotone"}
								/>
							</motion.span>
						)}
						{tab.label}
						{tab.count !== undefined && tab.count > 0 && (
							<motion.span
								animate={{
									scale: 1,
									backgroundColor: isActive ? "var(--primary)" : "var(--muted)",
								}}
								className={cn(
									"flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 font-semibold text-xs tabular-nums",
									isActive ? "text-primary-foreground" : "text-foreground"
								)}
								initial={{ scale: 0.8 }}
								transition={{ type: "spring", stiffness: 400, damping: 25 }}
							>
								{tab.count}
							</motion.span>
						)}
						{isActive && (
							<motion.div
								className="absolute inset-x-0 bottom-0 h-0.5 bg-primary"
								layoutId="page-nav-indicator"
								transition={{ type: "spring", stiffness: 400, damping: 30 }}
							/>
						)}
					</Link>
				);
			})}
		</div>
	);
}
