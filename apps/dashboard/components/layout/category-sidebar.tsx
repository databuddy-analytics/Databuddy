"use client";

import { useFlags } from "@databuddy/sdk/react";
import { InfoIcon } from "@phosphor-icons/react";
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
import { Button } from "../ui/button";
import {
	categoryConfig,
	createLoadingWebsitesNavigation,
	createWebsitesNavigation,
	filterCategoriesForRoute,
	getContextConfig,
	getDefaultCategory,
} from "./navigation/navigation-config";
import { PendingInvitationsButton } from "./pending-invitations-button";
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
							websites: isLoadingWebsites
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

	return (
		<div className="fixed inset-y-0 left-0 z-40 w-12 border-r bg-transparent">
			<div className="flex h-full flex-col">
				<div className="flex h-12 items-center justify-center border-b">
					<Link
						className="relative shrink-0 transition-opacity hover:opacity-80"
						href="/websites"
					>
						<Image
							alt="Databuddy Logo"
							className="invert dark:invert-0"
							height={32}
							priority
							src="/logo.svg"
							width={32}
						/>
					</Link>
				</div>

				{categories.map((category, idx) => {
					const Icon = category.icon;
					const isActive = activeCategory === category.id;
					const isLast = idx === categories.length - 1;
					const borderClass = isActive && !isLast ? "border-accent" : "";
					const hoverClass = isActive ? "" : "hover:bg-sidebar-accent-brighter";
					const boxClass = isLast
						? "box-content border-border border-b"
						: "box-content border-transparent";

					return (
						<Tooltip delayDuration={500} key={category.id}>
							<TooltipTrigger asChild>
								<button
									className={cn(
										borderClass,
										"relative flex h-10 w-full cursor-pointer items-center justify-center",
										"focus:outline-none",
										hoverClass,
										boxClass
									)}
									onClick={() => onCategoryChangeAction?.(category.id)}
									type="button"
								>
									{isActive ? (
										<div
											className={cn(
												"absolute top-0 left-0 -z-10 box-border h-full w-full bg-sidebar-accent-brighter"
											)}
										/>
									) : null}
									<Icon
										className={cn(
											"size-5",
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

				<div className="space-y-2 border-t p-2 pb-4">
					<div className="flex justify-center">
						<div className="flex size-8 items-center justify-center">
							<ThemeToggle />
						</div>
					</div>

					<div className="flex justify-center">
						<Button
							className="flex size-8 items-center justify-center"
							onClick={() => setHelpOpen(true)}
							suppressHydrationWarning
							type="button"
							variant="ghost"
						>
							<InfoIcon className="size-5" weight="duotone" />
						</Button>
					</div>

					{user ? (
						<>
							<div className="flex justify-center">
								<PendingInvitationsButton />
							</div>
							<div className="flex justify-center">
								<ProfileButtonClient user={user} />
							</div>
						</>
					) : null}
				</div>

				<HelpDialog onOpenChangeAction={setHelpOpen} open={helpOpen} />
			</div>
		</div>
	);
}
