"use client";

import { authClient } from "@databuddy/auth/client";
import { useFlags } from "@databuddy/sdk/react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useHasMounted } from "@/hooks/use-has-mounted";
import { useMonitorsLight } from "@/hooks/use-monitors";
import { useAccordionStates } from "@/hooks/use-persistent-state";
import { useWebsitesLight } from "@/hooks/use-websites";
import { cn } from "@/lib/utils";
import { CategorySidebar } from "./category-sidebar";
import { MobileSidebar } from "./mobile-sidebar";
import { isNavItemActive } from "./navigation/nav-item-active";
import {
	categoryConfig,
	createLoadingMonitorsNavigation,
	createLoadingWebsitesNavigation,
	createMonitorsNavigation,
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
	currentWebsiteId?: string | null;
	header: React.ReactNode;
	navigation: NavigationEntry[];
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

export function Sidebar() {
	const { data: session } = authClient.useSession();
	const user = session?.user ?? null;

	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [selectedCategory, setSelectedCategory] = useState<string | undefined>(
		undefined
	);

	const isDemo = pathname.startsWith("/demo");
	const isWebsite = pathname.startsWith("/websites/");

	const { websites, isLoading: isLoadingWebsites } = useWebsitesLight({
		enabled: user !== null,
	});
	const { monitors, isLoading: isLoadingMonitors } = useMonitorsLight({
		enabled: user !== null,
	});
	const accordionStates = useAccordionStates();
	const hasMounted = useHasMounted();

	const websiteId = useMemo(
		() => (isDemo || isWebsite ? pathname.split("/")[2] : null),
		[isDemo, isWebsite, pathname]
	);

	const currentWebsite = useMemo(
		() => (websiteId ? websites?.find((site) => site.id === websiteId) : null),
		[websiteId, websites]
	);

	const { getFlag } = useFlags();

	const getNavigationConfig = useMemo((): NavigationConfig => {
		const baseConfig = getContextConfig(pathname);

		const populatedConfig =
			baseConfig === categoryConfig.main
				? {
						...baseConfig,
						navigationMap: {
							...baseConfig.navigationMap,
							home:
								!hasMounted || isLoadingWebsites
									? createLoadingWebsitesNavigation()
									: createWebsitesNavigation(websites),
							monitors:
								!hasMounted || isLoadingMonitors
									? createLoadingMonitorsNavigation()
									: createMonitorsNavigation(monitors),
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
								const flagState = getFlag(item.flag);
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
						const flagState = getFlag(entry.flag);
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
		monitors,
		isLoadingMonitors,
		hasMounted,
		getFlag,
	]);

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

	const { navigation, header, currentWebsiteId } = getNavigationConfig;

	return (
		<>
			<MobileSidebar
				accordionStates={accordionStates}
				currentWebsiteId={currentWebsiteId}
				header={header}
				navigation={navigation}
				onCategoryChangeAction={setSelectedCategory}
				searchParams={searchParams}
				selectedCategory={selectedCategory}
			/>

			<div className="hidden md:block">
				<CategorySidebar
					onCategoryChangeAction={setSelectedCategory}
					selectedCategory={selectedCategory}
				/>
			</div>

			<nav className="fixed inset-y-0 left-12 z-50 hidden w-64 overflow-hidden border-r bg-sidebar md:block lg:w-72">
				<ScrollArea className="h-full">
					<div className="flex h-full flex-col">
						{header}

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
														? "border-b"
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
											searchParams={searchParams}
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
												isActive={isNavItemActive(
													entry,
													pathname,
													searchParams,
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
