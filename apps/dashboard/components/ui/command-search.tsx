"use client";

import type { Icon } from "@phosphor-icons/react";
import {
	ArrowSquareOutIcon,
	CommandIcon,
	GlobeIcon,
	MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { useDebouncedCallback } from "@tanstack/react-pacer";
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
	homeNavigation,
	resourcesNavigation,
	settingsNavigation,
	websiteNavigation,
	websiteSettingsNavigation,
} from "@/components/layout/navigation/navigation-config";
import type {
	NavigationEntry,
	NavigationItem,
	NavigationSection,
} from "@/components/layout/navigation/types";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useWebsites } from "@/hooks/use-websites";
import { cn } from "@/lib/utils";

interface SearchItem {
	alpha?: boolean;
	badge?: { text: string };
	disabled?: boolean;
	external?: boolean;
	icon: Icon;
	name: string;
	path: string;
	tag?: string;
}

interface SearchGroup {
	category: string;
	items: SearchItem[];
}

const ALL_NAVIGATION: NavigationSection[] = [
	...settingsNavigation,
	...resourcesNavigation,
];

function toSearchItem(item: NavigationItem, pathPrefix = ""): SearchItem {
	const path =
		item.rootLevel === false ? `${pathPrefix}${item.href}` : item.href;
	return {
		name: item.name,
		path: path || pathPrefix,
		icon: item.icon,
		disabled: item.disabled,
		tag: item.tag,
		external: item.external,
		alpha: item.alpha,
		badge: item.badge,
	};
}

const isSection = (entry: NavigationEntry): entry is NavigationSection =>
	"items" in entry;

function toSearchGroups(
	entries: NavigationEntry[],
	pathPrefix = ""
): SearchGroup[] {
	const groups: SearchGroup[] = [];
	const standaloneItems: SearchItem[] = [];

	for (const entry of entries) {
		if (isSection(entry)) {
			groups.push({
				category: entry.title,
				items: entry.items
					.filter((item) => !item.hideFromDemo)
					.map((item) => toSearchItem(item, pathPrefix)),
			});
		} else if (!entry.hideFromDemo) {
			standaloneItems.push(toSearchItem(entry, pathPrefix));
		}
	}

	if (standaloneItems.length > 0) {
		groups.unshift({
			category: "Quick Access",
			items: standaloneItems,
		});
	}

	return groups;
}

function mergeGroups(groups: SearchGroup[]): SearchGroup[] {
	const merged = new Map<string, SearchItem[]>();

	for (const group of groups) {
		const existing = merged.get(group.category) ?? [];
		const existingPaths = new Set(existing.map((i) => i.path));
		const newItems = group.items.filter((i) => !existingPaths.has(i.path));
		merged.set(group.category, [...existing, ...newItems]);
	}

	return [...merged.entries()].map(([category, items]) => ({
		category,
		items,
	}));
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
	const router = useRouter();
	const pathname = usePathname();
	const { websites } = useWebsites({ enabled: open });

	const currentWebsiteId = pathname.startsWith("/websites/")
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

	const groups = useMemo(() => {
		const result: SearchGroup[] = [];
		const websitePrefix = currentWebsiteId
			? `/websites/${currentWebsiteId}`
			: "";

		// Static home navigation (overview, websites link, observability)
		result.push(...toSearchGroups(homeNavigation));

		// Individual websites as search items
		if (websites.length > 0) {
			result.push({
				category: "Websites",
				items: websites.map((w) => ({
					name: w.name || w.domain,
					path: `/websites/${w.id}`,
					icon: GlobeIcon,
				})),
			});
		}

		if (currentWebsiteId) {
			result.push(...toSearchGroups(websiteNavigation, websitePrefix));
			result.push(...toSearchGroups(websiteSettingsNavigation, websitePrefix));
		}

		result.push(...toSearchGroups(ALL_NAVIGATION));

		return mergeGroups(result);
	}, [websites, pathname, currentWebsiteId]);

	const filteredGroups = useMemo(() => {
		if (!debouncedSearch.trim()) {
			return groups;
		}

		const query = debouncedSearch.toLowerCase();
		return groups
			.map((group) => ({
				...group,
				items: group.items.filter(
					(item) =>
						item.name.toLowerCase().includes(query) ||
						item.path.toLowerCase().includes(query)
				),
			}))
			.filter((group) => group.items.length > 0);
	}, [groups, debouncedSearch]);

	const handleSelect = useCallback(
		(item: SearchItem) => {
			if (item.disabled) {
				return;
			}
			setOpen(false);
			setSearch("");
			setDebouncedSearch("");
			if (item.external || item.path.startsWith("http")) {
				window.open(item.path, "_blank", "noopener,noreferrer");
			} else {
				router.push(item.path);
			}
		},
		[router]
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
				<DialogHeader className="sr-only">
					<DialogTitle>Command Search</DialogTitle>
					<DialogDescription>
						Search for pages, settings, and websites
					</DialogDescription>
				</DialogHeader>
				<DialogContent
					className="gap-0 overflow-hidden p-0 sm:max-w-xl"
					showCloseButton={false}
				>
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
											key={`${group.category}-${item.path}`}
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
				</DialogContent>
			</Dialog>
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

	return (
		<CommandPrimitive.Item
			className={cn(
				"group relative flex cursor-pointer select-none items-center gap-3 rounded px-2 py-2 outline-none",
				"data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
				item.disabled && "pointer-events-none opacity-50"
			)}
			disabled={item.disabled}
			onSelect={() => onSelect(item)}
			value={`${item.name} ${item.path}`}
		>
			<div className="flex size-7 shrink-0 items-center justify-center rounded bg-accent group-data-[selected=true]:bg-background">
				<ItemIcon className="size-4 text-muted-foreground" weight="duotone" />
			</div>

			<div className="min-w-0 flex-1">
				<p className="truncate font-medium text-sm leading-tight">
					{item.name}
				</p>
				<p className="truncate text-muted-foreground text-xs">
					{item.path.startsWith("http") ? "External link" : item.path}
				</p>
			</div>

			<div className="flex shrink-0 items-center gap-1.5">
				{item.tag && (
					<Badge
						className="text-[10px]"
						variant={item.tag === "soon" ? "secondary" : "outline"}
					>
						{item.tag}
					</Badge>
				)}

				{item.alpha && (
					<Badge className="text-[10px]" variant="secondary">
						alpha
					</Badge>
				)}

				{item.badge && (
					<Badge className="text-[10px]" variant="secondary">
						{item.badge.text}
					</Badge>
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
