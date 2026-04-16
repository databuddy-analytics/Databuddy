"use client";

import { authClient } from "@databuddy/auth/client";
import { useFlags } from "@databuddy/sdk/react";
import { usePathname } from "next/navigation";
import {
	createContext,
	type ReactNode,
	use,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import { useAccordionStates } from "@/hooks/use-persistent-state";
import { useWebsitesLight } from "@/hooks/use-websites";
import {
	filterCategoriesByFlags,
	filterCategoriesForRoute,
	getContextConfig,
	getDefaultCategory,
} from "./navigation/navigation-config";
import type { Category, NavigationEntry } from "./navigation/types";
import { WebsiteHeader } from "./navigation/website-header";
import { OrganizationSelector } from "./organization-selector";

interface SidebarNavigationContextValue {
	accordionStates: ReturnType<typeof useAccordionStates>;
	activeCategory: string;
	categories: Category[];
	currentWebsiteId: string | null | undefined;
	header: ReactNode;
	navigation: NavigationEntry[];
	pathname: string;
	setCategory: (id: string) => void;
}

const SidebarNavigationContext =
	createContext<SidebarNavigationContextValue | null>(null);

export function useSidebarNavigation() {
	const ctx = use(SidebarNavigationContext);
	if (!ctx) {
		throw new Error(
			"useSidebarNavigation must be used within SidebarNavigationProvider"
		);
	}
	return ctx;
}

export function SidebarNavigationProvider({
	children,
}: {
	children: ReactNode;
}) {
	const { data: session } = authClient.useSession();
	const user = session?.user ?? null;

	const pathname = usePathname();
	const { getFlag } = useFlags();
	const isHydrated = useHydrated();
	const accordionStates = useAccordionStates();

	const [selectedCategory, setSelectedCategory] = useState<string | undefined>(
		undefined
	);

	const isDemo = pathname.startsWith("/demo");
	const isWebsite = pathname.startsWith("/websites/");
	const websiteId = isDemo || isWebsite ? pathname.split("/")[2] : null;

	// Only fetch websites for the website header (when viewing a specific website)
	const { websites } = useWebsitesLight({
		enabled: user !== null && (isWebsite || isDemo),
	});

	const currentWebsite = useMemo(
		() => (websiteId ? websites?.find((site) => site.id === websiteId) : null),
		[websiteId, websites]
	);

	const config = useMemo(() => getContextConfig(pathname), [pathname]);

	const categories = useMemo(
		() =>
			filterCategoriesByFlags(
				filterCategoriesForRoute(config.categories, pathname),
				isHydrated,
				getFlag
			),
		[config.categories, pathname, isHydrated, getFlag]
	);

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

	const activeCategory = selectedCategory || defaultCategory;

	const navigation = useMemo(() => {
		const navSections =
			config.navigationMap[
				activeCategory as keyof typeof config.navigationMap
			] ||
			config.navigationMap[
				config.defaultCategory as keyof typeof config.navigationMap
			];

		const isFlagOn = (flag: string) => {
			if (!isHydrated) {
				return false;
			}
			const flagState = getFlag(flag);
			return flagState.status === "ready" && flagState.on;
		};

		return navSections
			.map((entry) => {
				if ("items" in entry) {
					const filteredItems = entry.items.filter(
						(item) => !item.flag || isFlagOn(item.flag)
					);
					return { ...entry, items: filteredItems };
				}
				return entry;
			})
			.filter((entry) => {
				if (entry.flag && !isFlagOn(entry.flag)) {
					return false;
				}
				if ("items" in entry && entry.items.length === 0) {
					return false;
				}
				return true;
			});
	}, [config, activeCategory, getFlag, isHydrated]);

	const header = useMemo(() => {
		if (isWebsite || isDemo) {
			return (
				<WebsiteHeader showBackButton={!isDemo} website={currentWebsite} />
			);
		}
		return <OrganizationSelector />;
	}, [isWebsite, isDemo, currentWebsite]);

	const currentWebsiteId = isWebsite || isDemo ? websiteId : undefined;

	const value = useMemo<SidebarNavigationContextValue>(
		() => ({
			navigation,
			categories,
			activeCategory,
			setCategory: setSelectedCategory,
			header,
			currentWebsiteId,
			pathname,
			accordionStates,
		}),
		[
			navigation,
			categories,
			activeCategory,
			header,
			currentWebsiteId,
			pathname,
			accordionStates,
		]
	);

	return (
		<SidebarNavigationContext value={value}>
			{children}
		</SidebarNavigationContext>
	);
}
