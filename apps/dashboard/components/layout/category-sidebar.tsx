"use client";

import { useFlags } from "@databuddy/sdk/react";
import {
	BookOpenIcon,
	BuildingOffice2Icon,
	Cog6ToothIcon,
	ComputerDesktopIcon,
	CreditCardIcon,
	HeartIcon,
	HomeIcon,
	QuestionMarkCircleIcon,
} from "@heroicons/react/24/outline";
import {
	HeartIcon as HeartIconSolid,
	HomeIcon as HomeIconSolid,
} from "@heroicons/react/24/solid";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWebsites } from "@/hooks/use-websites";
import { cn } from "@/lib/utils";
import {
	categoryConfig,
	createLoadingWebsitesNavigation,
	createWebsitesNavigation,
	filterCategoriesForRoute,
	getContextConfig,
	getDefaultCategory,
} from "./navigation/navigation-config";
import { ProfileButtonClient } from "./profile-button-client";
import { ThemeToggle } from "./theme-toggle";

const HelpDialog = dynamic(
	() => import("./help-dialog").then((mod) => mod.HelpDialog),
	{
		ssr: false,
		loading: () => null,
	}
);

interface User {
	name?: string | null;
	email?: string | null;
	image?: string | null;
}

interface CategorySidebarProps {
	onCategoryChangeAction?: (categoryId: string) => void;
	selectedCategory?: string;
	user: User | null;
}

// Map category IDs to heroicons
const categoryIconMap: Record<
	string,
	{ outline: React.ComponentType<{ className?: string }>; solid: React.ComponentType<{ className?: string }> }
> = {
	home: { outline: HomeIcon, solid: HomeIconSolid },
	favorites: { outline: HeartIcon, solid: HeartIconSolid },
	settings: { outline: Cog6ToothIcon, solid: Cog6ToothIcon },
	organizations: { outline: BuildingOffice2Icon, solid: BuildingOffice2Icon },
	billing: { outline: CreditCardIcon, solid: CreditCardIcon },
};

export function CategorySidebar({
	onCategoryChangeAction,
	selectedCategory,
	user = null,
}: CategorySidebarProps) {
	const pathname = usePathname();
	const { websites, isLoading: isLoadingWebsites } = useWebsites({
		enabled: user !== null,
	});
	const [helpOpen, setHelpOpen] = useState(false);
	const { isOn } = useFlags();

	const { categories, defaultCategory } = useMemo(() => {
		const baseConfig = getContextConfig(pathname);
		const config =
			baseConfig === categoryConfig.main
				? {
						...baseConfig,
						navigationMap: {
							...baseConfig.navigationMap,
							home: isLoadingWebsites
								? createLoadingWebsitesNavigation()
								: createWebsitesNavigation(websites),
						},
					}
				: baseConfig;

		const defaultCat = getDefaultCategory(pathname);
		const filteredCategories = filterCategoriesForRoute(
			config.categories,
			pathname
		).filter((category) => {
			if (category.flag && !isOn(category.flag)) {
				return false;
			}
			return true;
		});

		return { categories: filteredCategories, defaultCategory: defaultCat };
	}, [pathname, websites, isLoadingWebsites, isOn]);

	const activeCategory = selectedCategory || defaultCategory;

	// Split categories into top section and bottom section based on group
	const topCategories = categories.filter(
		(cat) => cat.id === "home" || cat.id === "favorites"
	);
	const middleCategories = categories.filter(
		(cat) =>
			cat.id !== "home" &&
			cat.id !== "favorites" &&
			cat.id !== "resources"
	);

	return (
		<div className="fixed inset-y-0 left-0 z-40 w-16 border-r border-border bg-background">
			<div className="flex h-full flex-col justify-between">
				{/* Top section */}
				<div className="flex flex-col">
					{/* Logo */}
					<div className="flex h-16 w-16 items-center justify-center border-b border-border">
						<Link
							className="relative shrink-0 transition-opacity hover:opacity-80"
							href="/websites"
						>
							<Image
								alt="Databuddy Logo"
								className="invert dark:invert-0"
								height={28}
								priority
								src="/logo.svg"
								width={28}
							/>
						</Link>
					</div>

					{/* Top navigation icons - Home & Favorites */}
					<div className="flex flex-col">
						{topCategories.map((category, idx) => {
							const isActive = activeCategory === category.id;
							const iconSet = categoryIconMap[category.id];
							const Icon = isActive ? iconSet?.solid : iconSet?.outline;
							const isLast = idx === topCategories.length - 1;

							if (!Icon) return null;

							return (
								<Tooltip delayDuration={300} key={category.id}>
									<TooltipTrigger asChild>
										<button
											className={cn(
												"relative flex h-16 w-full items-center justify-center border-b border-border transition-colors",
												"focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
												isActive
													? "bg-muted"
													: "hover:bg-muted/50"
											)}
											onClick={() => onCategoryChangeAction?.(category.id)}
											type="button"
										>
											<Icon
												className={cn(
													"size-7",
													isActive
														? "text-foreground"
														: "text-muted-foreground"
												)}
											/>
										</button>
									</TooltipTrigger>
									<TooltipContent side="right" sideOffset={8}>
										{category.name}
									</TooltipContent>
								</Tooltip>
							);
						})}
					</div>

					{/* Middle navigation icons - Settings, Organizations, Billing */}
					<div className="flex flex-col">
						{middleCategories.map((category, idx) => {
							const isActive = activeCategory === category.id;
							const iconSet = categoryIconMap[category.id];
							const Icon = iconSet?.outline || Cog6ToothIcon;
							const isLast = idx === middleCategories.length - 1;

							return (
								<Tooltip delayDuration={300} key={category.id}>
									<TooltipTrigger asChild>
										<button
											className={cn(
												"relative flex h-16 w-full items-center justify-center border-b border-border transition-colors",
												"focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
												isActive
													? "bg-muted"
													: "hover:bg-muted/50"
											)}
											onClick={() => onCategoryChangeAction?.(category.id)}
											type="button"
										>
											<Icon
												className={cn(
													"size-7",
													isActive
														? "text-foreground"
														: "text-muted-foreground"
												)}
											/>
										</button>
									</TooltipTrigger>
									<TooltipContent side="right" sideOffset={8}>
										{category.name}
									</TooltipContent>
								</Tooltip>
							);
						})}
					</div>
				</div>

				{/* Bottom section */}
				<div className="flex flex-col border-t border-border">
					{/* Documentation */}
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<a
								className="flex h-16 w-full items-center justify-center transition-colors hover:bg-muted/50"
								href="https://databuddy.cc/docs"
								rel="noopener noreferrer"
								target="_blank"
							>
								<BookOpenIcon className="size-7 text-muted-foreground" />
							</a>
						</TooltipTrigger>
						<TooltipContent side="right" sideOffset={8}>
							Documentation
						</TooltipContent>
					</Tooltip>

					{/* Theme Toggle */}
					<div className="flex h-16 w-full items-center justify-center">
						<ThemeToggle iconClassName="size-7" />
					</div>

					{/* Help */}
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								className="flex h-16 w-full items-center justify-center transition-colors hover:bg-muted/50"
								onClick={() => setHelpOpen(true)}
								type="button"
							>
								<QuestionMarkCircleIcon className="size-7 text-muted-foreground" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="right" sideOffset={8}>
							Help & Support
						</TooltipContent>
					</Tooltip>

					{/* User Avatar */}
					{user ? (
						<div className="flex h-16 w-full items-center justify-center">
							<ProfileButtonClient user={user} />
						</div>
					) : null}
				</div>

				<HelpDialog onOpenChangeAction={setHelpOpen} open={helpOpen} />
			</div>
		</div>
	);
}
