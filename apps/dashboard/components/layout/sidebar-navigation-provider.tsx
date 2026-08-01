"use client";

import { authClient } from "@databuddy/auth/client";
import { useQuery } from "@tanstack/react-query";
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
import { useWebsitesLight } from "@/hooks/use-websites";
import { insightQueries } from "@/lib/insight-api";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import {
	getNavContext,
	getNavDirection,
	getNavigation,
	type NavContext,
} from "./navigation/navigation-config";
import type { NavigationGroup } from "./navigation/types";

interface SidebarNavigationContextValue {
	currentWebsite: {
		id: string;
		name: string | null;
		domain: string;
		favicon?: string | null;
	} | null;
	currentWebsiteId: string | null | undefined;
	isDemo: boolean;
	isWebsite: boolean;
	navContext: NavContext;
	navigation: NavigationGroup[];
	pathname: string;
	transitionDirection: "left" | "right" | null;
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
	const { activeOrganizationId, isSwitchingOrganization } =
		useOrganizationsContext();

	const pathname = usePathname();

	const isDemo = pathname.startsWith("/demo");
	const isWebsite = pathname.startsWith("/websites/");
	const websiteId = isDemo || isWebsite ? pathname.split("/")[2] : null;

	const { websites } = useWebsitesLight({
		enabled: user !== null && (isWebsite || isDemo),
	});

	const currentWebsite = useMemo(
		() =>
			websiteId
				? (websites?.find((site) => site.id === websiteId) ?? null)
				: null,
		[websiteId, websites]
	);

	const navContext = getNavContext(pathname);
	const recommendationTotal = useQuery(
		insightQueries.recommendationTotal(
			navContext === "main" && !isSwitchingOrganization
				? (activeOrganizationId ?? undefined)
				: undefined
		)
	);
	const prevContextRef = useRef<NavContext>(navContext);
	const [transitionDirection, setTransitionDirection] = useState<
		"left" | "right" | null
	>(null);

	useEffect(() => {
		const prev = prevContextRef.current;
		if (prev !== navContext) {
			const dir = getNavDirection(prev, navContext);
			setTransitionDirection(dir);
			const timeout = setTimeout(() => setTransitionDirection(null), 200);
			prevContextRef.current = navContext;
			return () => clearTimeout(timeout);
		}
	}, [navContext]);

	const navigation = useMemo(() => {
		const baseNavigation = getNavigation(pathname);
		const count = recommendationTotal.data ?? 0;
		if (navContext !== "main" || isSwitchingOrganization || count === 0) {
			return baseNavigation;
		}

		return baseNavigation.map((group) => ({
			...group,
			items: group.items.map((item) =>
				item.href === "/insights"
					? {
							...item,
							badge: {
								label: `${count} current recommendation${count === 1 ? "" : "s"}`,
								text: count > 99 ? "99+" : count.toString(),
								variant: "red" as const,
							},
						}
					: item
			),
		}));
	}, [isSwitchingOrganization, navContext, pathname, recommendationTotal.data]);

	const currentWebsiteId = isWebsite || isDemo ? websiteId : undefined;

	const value = useMemo<SidebarNavigationContextValue>(
		() => ({
			navigation,
			currentWebsiteId,
			currentWebsite: currentWebsite ?? null,
			pathname,
			isDemo,
			isWebsite,
			navContext,
			transitionDirection,
		}),
		[
			navigation,
			currentWebsiteId,
			currentWebsite,
			pathname,
			isDemo,
			isWebsite,
			navContext,
			transitionDirection,
		]
	);

	return (
		<SidebarNavigationContext value={value}>
			{children}
		</SidebarNavigationContext>
	);
}
