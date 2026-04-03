"use client";

import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { useWebsitesLight } from "@/hooks/use-websites";
import dayjs from "@/lib/dayjs";

type RefreshFn = () => void;

interface LLMPageContextValue {
	dateRange: {
		start_date: string;
		end_date: string;
		granularity: "daily";
	};
	hasQueryId: boolean;
	isFetching: boolean;
	isLoadingOrg: boolean;
	isLoadingWebsites: boolean;
	queryOptions: { websiteId?: string; organizationId?: string };
	refresh: () => void;
	registerRefresh: (fn: RefreshFn) => () => void;
	selectedWebsite: { id: string; name: string; domain: string } | undefined;
	selectedWebsiteId: string | null;
	setIsFetching: (fetching: boolean) => void;
	setSelectedWebsiteId: (id: string | null) => void;
	websites: Array<{ id: string; name: string; domain: string }>;
}

const LLMPageContext = createContext<LLMPageContextValue | null>(null);

export const DEFAULT_DATE_RANGE = {
	start_date: dayjs().subtract(30, "day").format("YYYY-MM-DD"),
	end_date: dayjs().format("YYYY-MM-DD"),
	granularity: "daily" as const,
};

export function LLMPageProvider({ children }: { children: React.ReactNode }) {
	const {
		activeOrganization,
		activeOrganizationId,
		isLoading: isLoadingOrg,
	} = useOrganizationsContext();
	const { websites, isLoading: isLoadingWebsites } = useWebsitesLight();
	const [selectedWebsiteId, setSelectedWebsiteId] = useState<string | null>(
		null
	);
	const [isFetching, setIsFetching] = useState(false);
	const refreshFnsRef = useRef<Set<RefreshFn>>(new Set());

	const registerRefresh = useCallback((fn: RefreshFn) => {
		refreshFnsRef.current.add(fn);
		return () => {
			refreshFnsRef.current.delete(fn);
		};
	}, []);

	const refresh = useCallback(() => {
		for (const fn of refreshFnsRef.current) {
			fn();
		}
	}, []);

	const queryOptions = useMemo(() => {
		if (selectedWebsiteId) {
			return { websiteId: selectedWebsiteId };
		}
		return {};
	}, [selectedWebsiteId]);

	const hasQueryId = !!(
		selectedWebsiteId ||
		activeOrganization?.id ||
		activeOrganizationId
	);
	const selectedWebsite = websites.find((w) => w.id === selectedWebsiteId);

	const value = useMemo(
		() => ({
			selectedWebsiteId,
			setSelectedWebsiteId,
			selectedWebsite,
			websites,
			isLoadingWebsites,
			queryOptions,
			hasQueryId,
			dateRange: DEFAULT_DATE_RANGE,
			isLoadingOrg,
			registerRefresh,
			refresh,
			isFetching,
			setIsFetching,
		}),
		[
			selectedWebsiteId,
			selectedWebsite,
			websites,
			isLoadingWebsites,
			queryOptions,
			hasQueryId,
			isLoadingOrg,
			registerRefresh,
			refresh,
			isFetching,
		]
	);

	return (
		<LLMPageContext.Provider value={value}>{children}</LLMPageContext.Provider>
	);
}

export function useLLMPageContext() {
	const context = useContext(LLMPageContext);
	if (!context) {
		throw new Error("useLLMPageContext must be used within LLMPageProvider");
	}
	return context;
}
