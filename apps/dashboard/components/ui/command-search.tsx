"use client";

import {
	FEATURE_METADATA,
	type GatedFeatureId,
} from "@databuddy/shared/types/features";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import { useQuery } from "@tanstack/react-query";
import { Command as CommandPrimitive } from "cmdk";
import { usePathname, useRouter } from "next/navigation";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import { useHotkeys } from "react-hotkeys-hook";
import {
	mainNavigation,
	settingsNavigation,
	websiteNavigation,
} from "@/components/layout/navigation/navigation-config";
import type {
	NavIcon,
	NavigationGroup,
	NavigationItem,
} from "@/components/layout/navigation/types";
import {
	formatMaskedApiKey,
	type ApiKeyListItem,
} from "@/components/organizations/api-key-types";
import { ApiKeySheet } from "@/components/organizations/api-key-sheet";
import { useBillingContext } from "@/components/providers/billing-provider";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { useWebsites } from "@/hooks/use-websites";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import {
	ArrowSquareOutIcon,
	CommandIcon,
	GlobeIcon,
	HeartbeatIcon,
	KeyIcon,
	LinkIcon,
	LockSimpleIcon,
	MagnifyingGlassIcon,
	OpenExternalIcon,
	PlusIcon,
} from "@databuddy/ui/icons";
import { Badge } from "@databuddy/ui";
import { Dialog } from "@databuddy/ui/client";

interface SearchItem {
	action?: () => void;
	alpha?: boolean;
	badge?: { text: string };
	disabled?: boolean;
	external?: boolean;
	gatedFeature?: GatedFeatureId;
	icon: NavIcon;
	id?: string;
	lockedPlanName?: string | null;
	name: string;
	parentName?: string;
	path?: string;
	searchTags?: string[];
	subtitle?: string;
	tag?: string;
}

interface SearchGroup {
	category: string;
	items: SearchItem[];
}

function resolveNavigationPath({
	href,
	parentPath,
	pathPrefix,
	rootLevel,
}: {
	href: string;
	parentPath?: string;
	pathPrefix: string;
	rootLevel?: boolean;
}) {
	if (href.startsWith("#") || href.startsWith("?")) {
		return `${parentPath ?? pathPrefix}${href}`;
	}
	if (href.startsWith("http")) {
		return href;
	}
	if (href === "") {
		return parentPath ?? (rootLevel ? href : pathPrefix);
	}
	return rootLevel ? href : `${pathPrefix}${href}`;
}

function toSearchItem(
	item: NavigationItem,
	pathPrefix = "",
	access?: {
		isBillingLoading: boolean;
		isFeatureEnabled: (feature: GatedFeatureId) => boolean;
	}
): SearchItem {
	const path = resolveNavigationPath({
		href: item.href,
		pathPrefix,
		rootLevel: item.rootLevel,
	});
	const locked =
		access != null &&
		!access.isBillingLoading &&
		item.gatedFeature != null &&
		!access.isFeatureEnabled(item.gatedFeature);

	return {
		name: item.name,
		path: path || pathPrefix,
		icon: item.icon,
		disabled: item.disabled || locked,
		tag: item.tag,
		searchTags: item.searchTags,
		external: item.external,
		alpha: item.alpha,
		badge: item.badge,
		gatedFeature: item.gatedFeature,
		lockedPlanName:
			locked && item.gatedFeature
				? (FEATURE_METADATA[item.gatedFeature]?.minPlan?.toUpperCase() ?? null)
				: null,
	};
}

function toSearchItems(
	item: NavigationItem,
	pathPrefix = "",
	access?: {
		isBillingLoading: boolean;
		isFeatureEnabled: (feature: GatedFeatureId) => boolean;
	}
): SearchItem[] {
	const parent = toSearchItem(item, pathPrefix, access);
	const sectionItems =
		item.searchItems?.map((section) => {
			const path = resolveNavigationPath({
				href: section.href ?? "",
				parentPath: parent.path,
				pathPrefix,
				rootLevel: section.rootLevel ?? item.rootLevel,
			});

			return {
				name: section.name,
				path,
				icon: section.icon ?? item.icon,
				disabled: parent.disabled || section.disabled,
				external: section.external ?? path.startsWith("http"),
				gatedFeature: parent.gatedFeature,
				lockedPlanName: parent.lockedPlanName,
				parentName: item.name,
				searchTags: [
					item.name,
					...(item.searchTags ?? []),
					...(section.searchTags ?? []),
				],
			};
		}) ?? [];

	return [parent, ...sectionItems];
}

function groupsToSearchGroups(
	groups: NavigationGroup[],
	pathPrefix = "",
	isDemoPath = false,
	access?: {
		isBillingLoading: boolean;
		isFeatureEnabled: (feature: GatedFeatureId) => boolean;
	}
): SearchGroup[] {
	const searchGroups: SearchGroup[] = [];

	for (const group of groups) {
		if (group.items.length === 0) {
			continue;
		}

		const items: SearchItem[] = [];
		for (const item of group.items) {
			if (item.production === false && process.env.NODE_ENV === "production") {
				continue;
			}
			if (item.hideFromDemo && isDemoPath) {
				continue;
			}
			if (item.showOnlyOnDemo && !isDemoPath) {
				continue;
			}
			items.push(...toSearchItems(item, pathPrefix, access));
		}

		if (items.length === 0) {
			continue;
		}

		searchGroups.push({
			category: group.label || "Quick Access",
			items,
		});
	}

	return searchGroups;
}

function mergeGroups(groups: SearchGroup[]): SearchGroup[] {
	const merged = new Map<string, SearchItem[]>();

	for (const group of groups) {
		const existing = merged.get(group.category) ?? [];
		const existingKeys = new Set(existing.map(getSearchItemKey));
		const nextItems = [...existing];

		for (const item of group.items) {
			const key = getSearchItemKey(item);
			if (!existingKeys.has(key)) {
				existingKeys.add(key);
				nextItems.push(item);
			}
		}

		merged.set(group.category, nextItems);
	}

	return [...merged.entries()].map(([category, items]) => ({
		category,
		items,
	}));
}

function getSearchItemKey(item: SearchItem) {
	return item.id ?? item.path ?? `${item.name}:${item.subtitle ?? ""}`;
}

function getSearchValue(item: SearchItem) {
	return [
		item.name,
		item.parentName,
		item.path,
		item.subtitle,
		item.tag,
		item.badge?.text,
		item.alpha ? "alpha" : undefined,
		...(item.searchTags ?? []),
	]
		.filter(Boolean)
		.join(" ");
}

function matchesSearchItem(item: SearchItem, rawQuery: string) {
	const query = rawQuery.trim().toLowerCase();
	if (!query) {
		return true;
	}

	const searchable = getSearchValue(item).toLowerCase();
	if (searchable.includes(query)) {
		return true;
	}

	return query
		.split(/\s+/)
		.filter(Boolean)
		.every((term) => searchable.includes(term));
}

type CommandSearchContextValue = {
	openCommandSearchAction: () => void;
};

const CommandSearchContext = createContext<CommandSearchContextValue | null>(
	null
);

export function useCommandSearchOpenAction(): () => void {
	const ctx = useContext(CommandSearchContext);
	if (!ctx) {
		return () => {};
	}
	return ctx.openCommandSearchAction;
}

export function CommandSearchProvider({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [apiKeySheetOpen, setApiKeySheetOpen] = useState(false);
	const [selectedApiKey, setSelectedApiKey] = useState<ApiKeyListItem | null>(
		null
	);
	const { push } = useRouter();
	const pathname = usePathname();
	const { websites } = useWebsites({ enabled: open });
	const { isFeatureEnabled, isLoading: isBillingLoading } = useBillingContext();
	const { activeOrganization, activeOrganizationId, isSwitchingOrganization } =
		useOrganizationsContext();
	const organizationId = activeOrganization?.id ?? activeOrganizationId ?? null;

	const { data: apiKeys } = useQuery({
		...orpc.apikeys.list.queryOptions({
			input: { organizationId: organizationId ?? "" },
		}),
		enabled: open && !!organizationId && !isSwitchingOrganization,
		staleTime: 30_000,
	});

	const isDemoPath = pathname.startsWith("/demo/");
	const currentWebsiteId = pathname.startsWith("/websites/")
		? pathname.split("/")[2]
		: isDemoPath
			? pathname.split("/")[2]
			: undefined;

	useHotkeys(
		["mod+k", "/"],
		() => setOpen((o) => !o),
		{ preventDefault: true },
		[]
	);

	const handleSearchChange = useDebouncedCallback(
		(value: string) => {
			setDebouncedSearch(value);
		},
		{ wait: 200 }
	);

	const handleInputChange = useCallback(
		(value: string) => {
			setSearch(value);
			handleSearchChange(value);
		},
		[handleSearchChange]
	);

	const openCreateApiKey = useCallback(() => {
		if (!organizationId) {
			return;
		}
		setSelectedApiKey(null);
		setApiKeySheetOpen(true);
	}, [organizationId]);

	const openApiKey = useCallback((apiKey: ApiKeyListItem) => {
		setSelectedApiKey(apiKey);
		setApiKeySheetOpen(true);
	}, []);

	const groups = useMemo(() => {
		const result: SearchGroup[] = [];
		const websitePrefix = currentWebsiteId
			? `${isDemoPath ? "/demo" : "/websites"}/${currentWebsiteId}`
			: "";

		if (!isDemoPath) {
			result.push({
				category: "Actions",
				items: [
					{
						id: "action:create-api-key",
						name: "Create API Key",
						subtitle: activeOrganization
							? `Create a key for ${activeOrganization.name}`
							: "Create a workspace API key",
						icon: KeyIcon,
						action: openCreateApiKey,
						disabled: !(organizationId && !isSwitchingOrganization),
						searchTags: [
							"new api key",
							"api token",
							"access token",
							"node sdk",
							"server sdk",
							"automation key",
						],
					},
					{
						id: "action:create-link",
						name: "Create Short Link",
						subtitle: "Open the new link sheet",
						path: "/links?command=create-link",
						icon: LinkIcon,
						searchTags: ["new link", "short link", "tracking link"],
					},
					{
						id: "action:create-link-folder",
						name: "Create Link Folder",
						subtitle: "Organize links in a folder",
						path: "/links?command=create-folder",
						icon: LinkIcon,
						searchTags: ["new folder", "link folder"],
					},
					{
						id: "action:create-monitor",
						name: "Create Monitor",
						subtitle: "Add an uptime monitor",
						path: "/monitors?command=create-monitor",
						icon: HeartbeatIcon,
						searchTags: ["new monitor", "uptime", "availability"],
					},
					{
						id: "action:create-status-page",
						name: "Create Status Page",
						subtitle: "Set up a public status page",
						path: "/monitors/status-pages?command=create-status-page",
						icon: OpenExternalIcon,
						searchTags: ["new status page", "incident page", "uptime page"],
					},
				],
			});

			result.push(...groupsToSearchGroups(mainNavigation));
			result.push(...groupsToSearchGroups(settingsNavigation));
		}

		if (!isDemoPath && websites.length > 0) {
			result.push({
				category: "Websites",
				items: websites.map((w) => ({
					name: w.name || w.domain,
					path: `/websites/${w.id}`,
					icon: GlobeIcon,
					searchTags: [w.domain],
				})),
			});
		}

		if (!isDemoPath && apiKeys && apiKeys.length > 0) {
			result.push({
				category: "API Keys",
				items: (apiKeys as ApiKeyListItem[]).map((apiKey) => ({
					id: `api-key:${apiKey.id}`,
					name: apiKey.name,
					subtitle: `${formatMaskedApiKey(apiKey)} · ${apiKey.type} · ${
						apiKey.scopes.length
					} scope${apiKey.scopes.length === 1 ? "" : "s"}`,
					path: "/organizations/settings#api-keys",
					icon: KeyIcon,
					action: () => openApiKey(apiKey),
					searchTags: [
						"api key",
						"api token",
						apiKey.type,
						apiKey.prefix,
						apiKey.start,
						...apiKey.scopes,
						...(apiKey.tags ?? []),
					],
				})),
			});
		}

		if (currentWebsiteId) {
			result.push(
				...groupsToSearchGroups(websiteNavigation, websitePrefix, isDemoPath, {
					isBillingLoading,
					isFeatureEnabled,
				})
			);
		}

		return mergeGroups(result);
	}, [
		activeOrganization,
		apiKeys,
		websites,
		currentWebsiteId,
		isDemoPath,
		isBillingLoading,
		isFeatureEnabled,
		isSwitchingOrganization,
		openApiKey,
		openCreateApiKey,
		organizationId,
	]);

	const filteredGroups = useMemo(() => {
		if (!debouncedSearch.trim()) {
			return groups;
		}

		const query = debouncedSearch.toLowerCase();
		const nextGroups: SearchGroup[] = [];

		for (const group of groups) {
			const items = group.items.filter((item) => matchesSearchItem(item, query));
			if (items.length > 0) {
				nextGroups.push({ ...group, items });
			}
		}

		return nextGroups;
	}, [groups, debouncedSearch]);

	const handleSelect = useCallback(
		(item: SearchItem) => {
			if (item.disabled) {
				return;
			}
			setOpen(false);
			setSearch("");
			setDebouncedSearch("");
			if (item.action) {
				item.action();
				return;
			}
			if (!item.path) {
				return;
			}
			if (item.external || item.path.startsWith("http")) {
				window.open(item.path, "_blank", "noopener,noreferrer");
			} else {
				push(item.path);
			}
		},
		[push]
	);

	const totalResults = filteredGroups.reduce(
		(acc, g) => acc + g.items.length,
		0
	);

	const handleOpenChange = useCallback((isOpen: boolean) => {
		setOpen(isOpen);
		if (!isOpen) {
			setSearch("");
			setDebouncedSearch("");
		}
	}, []);

	const openCommandSearchAction = useCallback(() => {
		setOpen(true);
	}, []);

	const contextValue = useMemo(
		(): CommandSearchContextValue => ({
			openCommandSearchAction,
		}),
		[openCommandSearchAction]
	);

	return (
		<CommandSearchContext.Provider value={contextValue}>
			{children}
			<Dialog onOpenChange={handleOpenChange} open={open}>
				<Dialog.Content
					className="gap-0 overflow-hidden p-0 sm:max-w-xl"
				>
					<Dialog.Header className="sr-only">
						<Dialog.Title>Command Search</Dialog.Title>
						<Dialog.Description>
							Search for pages, settings, and websites
						</Dialog.Description>
					</Dialog.Header>
					<Dialog.Body className="p-0">
						<CommandPrimitive
							className="flex h-full w-full flex-col"
							loop
							onKeyDown={(e) => {
								if (e.key === "Escape") {
									setOpen(false);
								}
							}}
						>
							<div className="dotted-bg flex items-center gap-3 border-b bg-accent px-4 py-3">
								<div className="flex size-8 shrink-0 items-center justify-center rounded bg-background">
									<MagnifyingGlassIcon
										className="size-4 text-muted-foreground"
										weight="duotone"
									/>
								</div>
								<CommandPrimitive.Input
									className="h-8 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
									onValueChange={handleInputChange}
									placeholder="Search pages, settings, websites..."
									value={search}
								/>
								<kbd className="hidden items-center gap-1 rounded border bg-background px-1.5 py-0.5 font-mono text-muted-foreground text-xs sm:flex">
									<CommandIcon className="size-3" weight="bold" />
									<span>K</span>
								</kbd>
							</div>

							<CommandPrimitive.List className="max-h-80 scroll-py-2 overflow-y-auto p-2">
								<CommandPrimitive.Empty className="flex flex-col items-center justify-center gap-2 py-12 text-center">
									<MagnifyingGlassIcon
										className="size-8 text-muted-foreground/50"
										weight="duotone"
									/>
									<div>
										<p className="font-medium text-muted-foreground text-sm">
											No results found
										</p>
										<p className="text-muted-foreground/70 text-xs">
											Try searching for something else
										</p>
									</div>
								</CommandPrimitive.Empty>

								{filteredGroups.map((group) => (
									<CommandPrimitive.Group
										className="**:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:text-muted-foreground **:[[cmdk-group-heading]]:text-xs"
										heading={group.category}
										key={group.category}
									>
										{group.items.map((item) => (
											<SearchResultItem
												item={item}
												key={`${group.category}-${getSearchItemKey(item)}`}
												onSelect={handleSelect}
											/>
										))}
									</CommandPrimitive.Group>
								))}
							</CommandPrimitive.List>

							<div className="flex items-center justify-between border-t bg-accent/50 px-4 py-2">
								<div className="flex items-center gap-3">
									<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
										<kbd className="rounded border bg-background px-1 py-0.5 font-mono text-[10px]">
											↑↓
										</kbd>
										navigate
									</span>
									<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
										<kbd className="rounded border bg-background px-1 py-0.5 font-mono text-[10px]">
											↵
										</kbd>
										select
									</span>
									<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
										<kbd className="rounded border bg-background px-1 py-0.5 font-mono text-[10px]">
											esc
										</kbd>
										close
									</span>
								</div>
								<span className="font-medium text-muted-foreground text-xs tabular-nums">
									{totalResults} results
								</span>
							</div>
						</CommandPrimitive>
					</Dialog.Body>
				</Dialog.Content>
			</Dialog>
			{organizationId && (
				<ApiKeySheet
					apiKey={selectedApiKey}
					onOpenChangeAction={(nextOpen) => {
						setApiKeySheetOpen(nextOpen);
						if (!nextOpen) {
							setSelectedApiKey(null);
						}
					}}
					open={apiKeySheetOpen && !isSwitchingOrganization}
					organizationId={organizationId}
				/>
			)}
		</CommandSearchContext.Provider>
	);
}

function SearchResultItem({
	item,
	onSelect,
}: {
	item: SearchItem;
	onSelect: (item: SearchItem) => void;
}) {
	const ItemIcon = item.icon;
	const subtitle =
		item.subtitle ??
		(item.path
			? item.path.startsWith("http")
				? "External link"
				: item.path
			: "Run command");

	return (
		<CommandPrimitive.Item
			className={cn(
				"group relative flex cursor-pointer select-none items-center gap-3 rounded px-2 py-2 outline-none",
				"data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
				item.disabled && "pointer-events-none opacity-50"
			)}
			disabled={item.disabled}
			onSelect={() => onSelect(item)}
			value={getSearchValue(item)}
		>
			<div className="flex size-7 shrink-0 items-center justify-center rounded bg-accent group-data-[selected=true]:bg-background">
				<ItemIcon className="size-4 text-muted-foreground" />
			</div>

			<div className="min-w-0 flex-1">
				<p className="truncate font-medium text-sm leading-tight">
					{item.name}
				</p>
				<p className="truncate text-muted-foreground text-xs">{subtitle}</p>
			</div>

			<div className="flex shrink-0 items-center gap-1.5">
				{item.tag && (
					<Badge
						className="text-[10px]"
						variant={item.tag === "soon" ? "muted" : "default"}
					>
						{item.tag}
					</Badge>
				)}

				{item.alpha && (
					<Badge className="text-[10px]" variant="muted">
						alpha
					</Badge>
				)}

				{item.badge && (
					<Badge className="text-[10px]" variant="muted">
						{item.badge.text}
					</Badge>
				)}

				{item.lockedPlanName && (
					<>
						<LockSimpleIcon className="size-3.5 text-muted-foreground" />
						<Badge className="text-[10px]" variant="muted">
							{item.lockedPlanName}
						</Badge>
					</>
				)}

				{item.external && (
					<ArrowSquareOutIcon
						className="size-4 text-muted-foreground"
						weight="duotone"
					/>
				)}
			</div>
		</CommandPrimitive.Item>
	);
}
