"use client";

import type { Icon } from "@phosphor-icons/react";
import {
	ArrowSquareOutIcon,
	CommandIcon,
	MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { Command as CommandPrimitive } from "cmdk";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import {
	billingNavigation,
	createWebsitesNavigation,
	organizationNavigation,
	personalNavigation,
	resourcesNavigation,
	websiteNavigation,
	websiteSettingsNavigation,
} from "@/components/layout/navigation/navigation-config";
import type { NavigationItem, NavigationSection } from "@/components/layout/navigation/types";
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
	name: string;
	path: string;
	icon: Icon;
	disabled?: boolean;
	tag?: string;
	external?: boolean;
	alpha?: boolean;
	badge?: { text: string };
}

interface SearchGroup {
	category: string;
	items: SearchItem[];
}

const ALL_NAVIGATION: NavigationSection[] = [
	...organizationNavigation,
	...billingNavigation,
	...personalNavigation,
	...resourcesNavigation,
];

function toSearchItem(item: NavigationItem, pathPrefix = ""): SearchItem {
	const path = item.rootLevel === false ? `${pathPrefix}${item.href}` : item.href;
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

function toSearchGroups(sections: NavigationSection[], pathPrefix = ""): SearchGroup[] {
	return sections.map((section) => ({
		category: section.title,
		items: section.items
			.filter((item) => !item.hideFromDemo)
			.map((item) => toSearchItem(item, pathPrefix)),
	}));
}

function mergeGroups(groups: SearchGroup[]): SearchGroup[] {
	const merged = new Map<string, SearchItem[]>();

	for (const group of groups) {
		const existing = merged.get(group.category) ?? [];
		const existingPaths = new Set(existing.map((i) => i.path));
		const newItems = group.items.filter((i) => !existingPaths.has(i.path));
		merged.set(group.category, [...existing, ...newItems]);
	}

	return [...merged.entries()].map(([category, items]) => ({ category, items }));
}

export function CommandSearch() {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const router = useRouter();
	const pathname = usePathname();
	const { websites } = useWebsites();

	const currentWebsiteId = pathname.startsWith("/websites/")
		? pathname.split("/")[2]
		: undefined;

	useHotkeys(["mod+k", "/"], () => setOpen((o) => !o), { preventDefault: true }, []);

	const groups = useMemo(() => {
		const result: SearchGroup[] = [];
		const websitePrefix = currentWebsiteId ? `/websites/${currentWebsiteId}` : "";

		if (websites.length > 0) {
			const websitesNav = createWebsitesNavigation(
				websites.map((w) => ({ id: w.id, name: w.name, domain: "" }))
			);
			result.push(...toSearchGroups(websitesNav));
		}

		if (currentWebsiteId) {
			result.push(...toSearchGroups(websiteNavigation, websitePrefix));
			result.push(...toSearchGroups(websiteSettingsNavigation, websitePrefix));
		}

		result.push(...toSearchGroups(ALL_NAVIGATION));

		return mergeGroups(result);
	}, [websites, pathname, currentWebsiteId]);

	const handleSelect = useCallback(
		(item: SearchItem) => {
			if (item.disabled) return;
			setOpen(false);
			setSearch("");
			if (item.external || item.path.startsWith("http")) {
				window.open(item.path, "_blank", "noopener,noreferrer");
			} else {
				router.push(item.path);
			}
		},
		[router]
	);

	const totalResults = groups.reduce((acc, g) => acc + g.items.length, 0);

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogHeader className="sr-only">
				<DialogTitle>Command Search</DialogTitle>
				<DialogDescription>Search for pages, settings, and websites</DialogDescription>
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
					{/* Search Header */}
					<div className="dotted-bg flex items-center gap-3 border-b bg-accent px-4 py-3">
						<div className="flex size-8 shrink-0 items-center justify-center rounded bg-background">
							<MagnifyingGlassIcon
								className="size-4 text-muted-foreground"
								weight="duotone"
							/>
						</div>
						<CommandPrimitive.Input
							className="h-8 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
							onValueChange={setSearch}
							placeholder="Search pages, settings, websites..."
							value={search}
						/>
						<kbd className="hidden items-center gap-1 rounded border bg-background px-1.5 py-0.5 font-mono text-muted-foreground text-xs sm:flex">
							<CommandIcon className="size-3" weight="bold" />
							<span>K</span>
						</kbd>
					</div>

					{/* Results */}
					<CommandPrimitive.List className="max-h-80 overflow-y-auto scroll-py-2 p-2">
						<CommandPrimitive.Empty className="flex flex-col items-center justify-center gap-2 py-12 text-center">
							<MagnifyingGlassIcon
								className="size-8 text-muted-foreground/50"
								weight="duotone"
							/>
							<div>
								<p className="font-medium text-muted-foreground text-sm">No results found</p>
								<p className="text-muted-foreground/70 text-xs">
									Try searching for something else
								</p>
							</div>
						</CommandPrimitive.Empty>

						{groups.map((group) => (
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

					{/* Footer */}
					<div className="flex items-center justify-between border-t bg-accent/50 px-4 py-2">
						<div className="flex items-center gap-3">
							<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
								<kbd className="rounded border bg-background px-1 py-0.5 font-mono text-[10px]">↑↓</kbd>
								navigate
							</span>
							<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
								<kbd className="rounded border bg-background px-1 py-0.5 font-mono text-[10px]">↵</kbd>
								select
							</span>
							<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
								<kbd className="rounded border bg-background px-1 py-0.5 font-mono text-[10px]">esc</kbd>
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
				"group relative flex cursor-pointer select-none items-center gap-3 rounded px-2 py-2 outline-none  ",
				"data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
				item.disabled && "pointer-events-none opacity-50"
			)}
			disabled={item.disabled}
			onSelect={() => onSelect(item)}
			value={`${item.name} ${item.path}`}
		>
			<div className="flex size-7 shrink-0 items-center justify-center rounded bg-accent   group-data-[selected=true]:bg-background">
				<ItemIcon className="size-4 text-muted-foreground" weight="duotone" />
			</div>

			<div className="min-w-0 flex-1">
				<p className="truncate font-medium text-sm leading-tight">{item.name}</p>
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
