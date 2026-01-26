"use client";

import { useFlags } from "@databuddy/sdk/react";
import { ListIcon, XIcon } from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAccordionStates } from "@/hooks/use-persistent-state";
import { useWebsites } from "@/hooks/use-websites";
import { cn } from "@/lib/utils";
import { CategorySidebar } from "./category-sidebar";
import { MobileCategorySelector } from "./navigation/mobile-category-selector";
import {
	categoryConfig,
	createLoadingWebsitesNavigation,
	createWebsitesNavigation,
	getContextConfig,
	getDefaultCategory,
} from "./navigation/navigation-config";
import { NavigationItem } from "./navigation/navigation-item";
import { NavigationSection } from "./navigation/navigation-section";
import type {
	NavigationEntry,
	NavigationItem as NavigationItemType,
	NavigationSection as NavigationSectionType,
} from "./navigation/types";
import { WebsiteHeader } from "./navigation/website-header";
import { OrganizationSelector } from "./organization-selector";

interface NavigationConfig {
	navigation: NavigationEntry[];
	header: React.ReactNode;
	currentWebsiteId?: string | null;
}

interface User {
	name?: string | null;
	email?: string | null;
	image?: string | null;
}

interface SidebarProps {
	user: User | null;
}

const isNavigationSection = (
	entry: NavigationEntry
): entry is NavigationSectionType => {
	return "items" in entry;
};

const isNavigationItem = (
	entry: NavigationEntry
): entry is NavigationItemType => {
	return "href" in entry && !("items" in entry);
};

const isItemActive = (
	item: NavigationItemType,
	pathname: string,
	currentWebsiteId?: string | null
): boolean => {
	if (item.rootLevel) {
		return pathname === item.href;
	}

	const buildFullPath = (basePath: string, itemHref: string) =>
		itemHref === "" ? basePath : `${basePath}${itemHref}`;

	const fullPath = (() => {
		if (pathname.startsWith("/demo")) {
			return buildFullPath(`/demo/${currentWebsiteId}`, item.href);
		}
		return buildFullPath(`/websites/${currentWebsiteId}`, item.href);
	})();

	if (item.href === "") {
		return pathname === fullPath;
	}

	return pathname === fullPath || pathname.startsWith(`${fullPath}/`);
};

export function Sidebar({ user = null }: SidebarProps) {
	const pathname = usePathname();
	const [isMobileOpen, setIsMobileOpen] = useState(false);
	const [selectedCategory, setSelectedCategory] = useState<string | undefined>(
		undefined
	);

	const isDemo = pathname.startsWith("/demo");
	const isWebsite = pathname.startsWith("/websites/");

	const { websites, isLoading: isLoadingWebsites } = useWebsites({
		enabled: user !== null,
	});
	const accordionStates = useAccordionStates();
	const sidebarRef = useRef<HTMLDivElement>(null);
	const previousFocusRef = useRef<HTMLElement | null>(null);

	const websiteId = useMemo(
		() => (isDemo || isWebsite ? pathname.split("/")[2] : null),
		[isDemo, isWebsite, pathname]
	);

	const currentWebsite = useMemo(
		() => (websiteId ? websites?.find((site) => site.id === websiteId) : null),
		[websiteId, websites]
	);

	const closeSidebar = useCallback(() => {
		setIsMobileOpen(false);
	}, []);

	const openSidebar = useCallback(() => {
		previousFocusRef.current = document.activeElement as HTMLElement;
		setIsMobileOpen(true);
	}, []);

	const toggleSidebar = useCallback(() => {
		if (isMobileOpen) {
			closeSidebar();
		} else {
			openSidebar();
		}
	}, [isMobileOpen, closeSidebar, openSidebar]);

	const { isEnabled } = useFlags();

	const getNavigationConfig = useMemo((): NavigationConfig => {
		const baseConfig = getContextConfig(pathname);

		const populatedConfig =
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
		const activeCat = selectedCategory || defaultCat;

		const navSections =
			populatedConfig.navigationMap[
				activeCat as keyof typeof populatedConfig.navigationMap
			] ||
			populatedConfig.navigationMap[
				populatedConfig.defaultCategory as keyof typeof populatedConfig.navigationMap
			];

		let headerComponent: React.ReactNode;
		let currentId: string | null | undefined;

		if (isWebsite || isDemo) {
			headerComponent = (
				<WebsiteHeader showBackButton={!isDemo} website={currentWebsite} />
			);
			currentId = websiteId;
		} else {
			headerComponent = <OrganizationSelector />;
			currentId = undefined;
		}

		return {
			navigation: navSections
				.map((entry) => {
					if (isNavigationSection(entry)) {
						const filteredItems = entry.items.filter((item) => {
							if (item.flag) {
								const flagState = isEnabled(item.flag);
								return flagState.status === "ready" && flagState.on;
							}
							return true;
						});
						return { ...entry, items: filteredItems };
					}
					return entry;
				})
				.filter((entry) => {
					if (entry.flag) {
						const flagState = isEnabled(entry.flag);
						if (!(flagState.status === "ready" && flagState.on)) {
							return false;
						}
					}
					if (isNavigationSection(entry) && entry.items.length === 0) {
						return false;
					}
					return true;
				}),
			header: headerComponent,
			currentWebsiteId: currentId,
		};
	}, [
		pathname,
		selectedCategory,
		isWebsite,
		isDemo,
		websiteId,
		currentWebsite,
		websites,
		isLoadingWebsites,
		isEnabled,
	]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && isMobileOpen) {
				closeSidebar();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isMobileOpen, closeSidebar]);

	const defaultCategory = useMemo(
		() => getDefaultCategory(pathname),
		[pathname]
	);
	const previousDefaultCategoryRef = useRef<string | undefined>(undefined);

	useEffect(() => {
		if (
			previousDefaultCategoryRef.current !== undefined &&
			previousDefaultCategoryRef.current !== defaultCategory
		) {
			setSelectedCategory(undefined);
		}
		previousDefaultCategoryRef.current = defaultCategory;
	}, [defaultCategory]);

	useEffect(() => {
		if (isMobileOpen && sidebarRef.current) {
			const firstFocusableElement = sidebarRef.current.querySelector(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			) as HTMLElement;
			if (firstFocusableElement) {
				firstFocusableElement.focus();
			}
		} else if (!isMobileOpen && previousFocusRef.current) {
			previousFocusRef.current.focus();
		}
	}, [isMobileOpen]);

	const { navigation, header, currentWebsiteId } = getNavigationConfig;

	return (
		<>
			{/* Mobile Header */}
			<header className="fixed top-0 right-0 left-0 z-40 h-12 w-full border-b bg-background md:hidden">
				<div className="flex h-full items-center justify-between px-4">
					<div className="flex items-center gap-3">
						<Button
							aria-label="Toggle navigation menu"
							data-track="sidebar-toggle"
							onClick={toggleSidebar}
							size="icon"
							type="button"
							variant="ghost"
						>
							<ListIcon className="size-5" weight="duotone" />
						</Button>

						<Link
							className="flex select-none items-center gap-2 transition-opacity hover:opacity-80"
							data-track="logo-click"
							href="/websites"
						>
							<div className="flex items-center justify-center">
								<Image
									alt="Databuddy Logo"
									className="invert dark:invert-0"
									draggable={false}
									height={24}
									priority
									src="/logo.svg"
									width={24}
								/>
							</div>
							<span className="font-semibold text-lg">Databuddy</span>
						</Link>
					</div>
				</div>
			</header>

			{/* Category Sidebar - Desktop only */}
			<div className="hidden md:block">
				<CategorySidebar
					onCategoryChangeAction={setSelectedCategory}
					selectedCategory={selectedCategory}
					user={user}
				/>
			</div>

			{isMobileOpen ? (
				<button
					className="fixed inset-0 z-40 bg-black/20 md:hidden"
					onClick={closeSidebar}
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							closeSidebar();
						}
					}}
					tabIndex={0}
					type="button"
				/>
			) : null}

			<nav
				aria-hidden={!isMobileOpen}
				className={cn(
					"fixed inset-y-0 z-50 w-56 overflow-hidden bg-sidebar sm:w-60 md:w-64 lg:w-72",
					"border-r transition-transform duration-200 ease-out",
					"left-0 md:left-12",
					"pt-12 md:pt-0",
					"md:translate-x-0",
					isMobileOpen ? "translate-x-0" : "-translate-x-full"
				)}
				ref={sidebarRef}
			>
				<Button
					aria-label="Close sidebar"
					className="absolute top-3 right-3 size-8 p-0 md:hidden"
					data-track="sidebar-close"
					onClick={closeSidebar}
					size="sm"
					type="button"
					variant="ghost"
				>
					<XIcon className="size-4" size={32} />
					<span className="sr-only">Close sidebar</span>
				</Button>

				<ScrollArea className="h-full md:h-full">
					<div className="flex h-full flex-col">
						{header}

						{/* Mobile Category Selector */}
						<MobileCategorySelector
							onCategoryChangeAction={setSelectedCategory}
							selectedCategory={selectedCategory}
							user={user}
						/>

						<nav aria-label="Main navigation" className="flex flex-col">
							{navigation.map((entry, idx) => {
								if (isNavigationSection(entry)) {
									return (
										<NavigationSection
											accordionStates={accordionStates}
											className={cn(
												navigation.length > 1 && idx === navigation.length - 1
													? "border-t"
													: idx === 0 && navigation.length < 2
														? "box-content border-b"
														: idx !== 0 && navigation.length > 1
															? "border-t"
															: "border-transparent"
											)}
											currentWebsiteId={currentWebsiteId}
											flag={entry.flag}
											icon={entry.icon}
											items={entry.items}
											key={entry.title}
											pathname={pathname}
											title={entry.title}
										/>
									);
								}

								if (isNavigationItem(entry)) {
									return (
										<div
											className={cn(idx !== 0 && "border-t")}
											key={entry.name}
										>
											<NavigationItem
												alpha={entry.alpha}
												badge={entry.badge}
												currentWebsiteId={currentWebsiteId}
												disabled={entry.disabled}
												domain={entry.domain}
												href={entry.href}
												icon={entry.icon}
												isActive={isItemActive(
													entry,
													pathname,
													currentWebsiteId
												)}
												isExternal={entry.external}
												isLocked={false}
												isRootLevel={!!entry.rootLevel}
												lockedPlanName={null}
												name={entry.name}
												production={entry.production}
												sectionName="main"
												tag={entry.tag}
											/>
										</div>
									);
								}

								return null;
							})}
						</nav>
					</div>
				</ScrollArea>
			</nav>
		</>
	);
}
