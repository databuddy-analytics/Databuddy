"use client";

import { useFlags } from "@databuddy/sdk/react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWebsites } from "@/hooks/use-websites";
import { cn } from "@/lib/utils";
import {
	categoryConfig,
	createLoadingWebsitesNavigation,
	createWebsitesNavigation,
	filterCategoriesForRoute,
	getContextConfig,
	getDefaultCategory,
} from "./navigation-config";

interface User {
	name?: string | null;
	email?: string | null;
	image?: string | null;
}

interface MobileCategorySelectorProps {
	onCategoryChangeAction?: (categoryId: string) => void;
	selectedCategory?: string;
	user: User | null;
}

export function MobileCategorySelector({
	onCategoryChangeAction,
	selectedCategory,
	user,
}: MobileCategorySelectorProps) {
	const pathname = usePathname();
	const { websites, isLoading: isLoadingWebsites } = useWebsites({
		enabled: user !== null,
	});
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
			if (category.flag) {
				const flagState = isOn(category.flag);
				return flagState;
			}
			return true;
		});

		return { categories: filteredCategories, defaultCategory: defaultCat };
	}, [pathname, websites, isLoadingWebsites, isOn]);

	const activeCategory = selectedCategory || defaultCategory;
	const currentCategory = categories.find((cat) => cat.id === activeCategory);

	return (
		<div className="p-3 md:hidden">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						className="flex h-10 w-full items-center justify-between border-sidebar-border border-b px-3"
						type="button"
						variant="secondary"
					>
						<div className="flex items-center gap-2">
							{currentCategory?.icon ? (
								<currentCategory.icon
									className="size-4 text-sidebar-foreground"
									weight="duotone"
								/>
							) : null}
							<span className="text-sidebar-foreground text-sm">
								{currentCategory?.name || "Select Category"}
							</span>
						</div>
						<CaretDownIcon className="size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent className="z-120 w-full min-w-(--radix-dropdown-menu-trigger-width)">
					{categories.map((category) => {
						const Icon = category.icon;
						const isActive = activeCategory === category.id;
						return (
							<DropdownMenuItem
								className={cn(
									"flex cursor-pointer items-center gap-2",
									isActive
										? "bg-sidebar-accent text-sidebar-accent-foreground"
										: ""
								)}
								key={category.id}
								onClick={() => onCategoryChangeAction?.(category.id)}
							>
								<Icon
									className={cn(
										"size-4",
										isActive ? "text-sidebar-ring" : "text-muted-foreground"
									)}
									weight={isActive ? "fill" : "duotone"}
								/>
								<span>{category.name}</span>
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
