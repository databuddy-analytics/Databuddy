"use client";

import { InfoIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { NotificationsPopover } from "@/components/notifications/notifications-popover";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDbConnections } from "@/hooks/use-db-connections";
import { useWebsites } from "@/hooks/use-websites";
import { cn } from "@/lib/utils";
import {
	categoryConfig,
	createDatabasesNavigation,
	createLoadingDatabasesNavigation,
	createLoadingWebsitesNavigation,
	createWebsitesNavigation,
	filterCategoriesForRoute,
	getContextConfig,
	getDefaultCategory,
} from "./navigation/navigation-config";
import { SignOutButton } from "./sign-out-button";
import { ThemeToggle } from "./theme-toggle";

const HelpDialog = dynamic(
	() => import("./help-dialog").then((mod) => mod.HelpDialog),
	{
		ssr: false,
		loading: () => null,
	}
);

interface CategorySidebarProps {
	onCategoryChange?: (categoryId: string) => void;
	selectedCategory?: string;
}

export function CategorySidebar({
	onCategoryChange,
	selectedCategory,
}: CategorySidebarProps) {
	const pathname = usePathname();
	const { websites, isLoading: isLoadingWebsites } = useWebsites();
	const { connections: databases, isLoading: isLoadingDatabases } =
		useDbConnections();
	const [helpOpen, setHelpOpen] = useState(false);

	const { categories, defaultCategory } = useMemo(() => {
		const baseConfig = getContextConfig(pathname);
		const config =
			baseConfig === categoryConfig.main
				? {
						...baseConfig,
						navigationMap: {
							...baseConfig.navigationMap,
							websites: isLoadingWebsites
								? createLoadingWebsitesNavigation()
								: createWebsitesNavigation(websites),
							observability: isLoadingDatabases
								? createLoadingDatabasesNavigation()
								: createDatabasesNavigation(databases),
						},
					}
				: baseConfig;

		const defaultCat = getDefaultCategory(pathname);
		const filteredCategories = filterCategoriesForRoute(
			config.categories,
			pathname
		);

		return { categories: filteredCategories, defaultCategory: defaultCat };
	}, [pathname, websites, isLoadingWebsites, databases, isLoadingDatabases]);

	const activeCategory = selectedCategory || defaultCategory;

	return (
		<div className="fixed inset-y-0 left-0 z-40 w-12 border-sidebar-border border-r bg-sidebar-primary">
			<div className="flex h-full flex-col">
				<div className="flex h-12 items-center justify-center border-sidebar-border border-b">
					<Link
						className="relative flex-shrink-0 transition-opacity hover:opacity-80"
						href="/websites"
					>
						<Image
							alt="DataBuddy Logo"
							className="drop-shadow-sm invert dark:invert-0"
							height={32}
							priority
							src="/logo.svg"
							width={32}
						/>
					</Link>
				</div>
				{categories.map((category) => {
					const Icon = category.icon;
					const isActive = activeCategory === category.id;

					return (
						<Tooltip delayDuration={500} key={category.id}>
							<TooltipTrigger asChild>
								<button
									className={cn(
										"flex cursor-pointer items-center justify-center px-3 py-2.5 hover:bg-sidebar-accent",
										"focus:outline-none",
										isActive &&
											"bg-sidebar-accent text-sidebar-accent-foreground"
									)}
									onClick={() => onCategoryChange?.(category.id)}
									type="button"
								>
									<Icon
										className={cn(
											"h-5 w-5 transition-colors",
											isActive
												? "text-sidebar-ring"
												: "text-sidebar-primary-foreground/70"
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

				<div className="space-y-2 border-sidebar-border border-t p-2 pb-4">
					<div className="flex justify-center">
						<div className="flex h-8 w-8 items-center justify-center">
							<NotificationsPopover />
						</div>
					</div>

					<div className="flex justify-center">
						<div className="flex h-8 w-8 items-center justify-center">
							<ThemeToggle />
						</div>
					</div>

					<div className="flex justify-center">
						<button
							className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-muted/50 focus:outline-none"
							onClick={() => setHelpOpen(true)}
							type="button"
						>
							<InfoIcon
								className="h-4 w-4 not-dark:text-primary"
								weight="duotone"
							/>
						</button>
					</div>

					<div className="flex justify-center">
						<SignOutButton />
					</div>
				</div>

				<HelpDialog onOpenChange={setHelpOpen} open={helpOpen} />
			</div>
		</div>
	);
}
