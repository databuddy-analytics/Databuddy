"use client";

import {
	ArrowLeftIcon,
	CommandIcon,
	HouseIcon,
	MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { Command as CommandPrimitive } from "cmdk";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
	billingNavigation,
	organizationNavigation,
	personalNavigation,
	resourcesNavigation,
} from "@/components/layout/navigation/navigation-config";
import type {
	NavigationItem,
	NavigationSection,
} from "@/components/layout/navigation/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const ALL_NAVIGATION: NavigationSection[] = [
	...organizationNavigation,
	...billingNavigation,
	...personalNavigation,
	...resourcesNavigation,
];

interface SearchItem {
	name: string;
	path: string;
	icon: typeof MagnifyingGlassIcon;
}

function toSearchItem(item: NavigationItem): SearchItem | null {
	if (item.disabled || item.hideFromDemo || !item.href) {
		return null;
	}
	return {
		name: item.name,
		path: item.href,
		icon: item.icon || MagnifyingGlassIcon,
	};
}

function flattenNavigation(sections: NavigationSection[]): SearchItem[] {
	const items: SearchItem[] = [];
	for (const section of sections) {
		for (const item of section.items) {
			const searchItem = toSearchItem(item);
			if (searchItem) {
				items.push(searchItem);
			}
		}
	}
	return items;
}

export default function NotFound() {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const searchItems = useMemo(() => {
		const items = flattenNavigation(ALL_NAVIGATION);
		if (!search.trim()) {
			return items;
		}
		const query = search.toLowerCase();
		return items.filter(
			(item) =>
				item.name.toLowerCase().includes(query) ||
				item.path.toLowerCase().includes(query)
		);
	}, [search]);

	const handleSelect = (item: SearchItem) => {
		setOpen(false);
		setSearch("");
		router.push(item.path);
	};

	const canGoBack = typeof window !== "undefined" && window.history.length > 1;

	return (
		<div className="flex min-h-dvh flex-col items-center justify-center bg-background p-4 sm:p-6 lg:p-8">
			<Card className="flex w-full max-w-md flex-1 flex-col items-center justify-center rounded border-none bg-transparent shadow-none">
				<CardContent className="flex flex-col items-center justify-center px-6 py-12 text-center sm:px-8 sm:py-14 lg:px-12">
					<div
						aria-hidden="true"
						className="flex size-12 items-center justify-center rounded-2xl bg-accent"
						role="img"
					>
						<MagnifyingGlassIcon
							aria-hidden="true"
							className="size-6 text-muted-foreground"
							size={24}
							weight="fill"
						/>
					</div>

					<div className="mt-6 w-full max-w-sm space-y-4">
						<h1 className="font-semibold text-foreground text-lg">
							Page Not Found
						</h1>
						<p className="text-balance text-muted-foreground text-sm leading-relaxed">
							We&apos;ve lost this page in the data stream.
						</p>
					</div>

					<Button
						className="mt-6 w-full max-w-xs"
						onClick={() => setOpen(true)}
						variant="outline"
					>
						<MagnifyingGlassIcon className="mr-2 size-4" weight="duotone" />
						Search pages, settings...
						<kbd className="ml-auto hidden items-center gap-1 rounded border bg-background px-1.5 py-0.5 font-mono text-muted-foreground text-xs sm:flex">
							<CommandIcon className="size-3" weight="bold" />
							<span>K</span>
						</kbd>
					</Button>

					<Dialog onOpenChange={setOpen} open={open}>
						<DialogHeader className="sr-only">
							<DialogTitle>Search</DialogTitle>
							<DialogDescription>
								Search for pages and settings
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
										onValueChange={setSearch}
										placeholder="Search pages, settings..."
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
									{searchItems.map((item) => {
										const ItemIcon = item.icon;
										return (
											<CommandPrimitive.Item
												className={cn(
													"group relative flex cursor-pointer select-none items-center gap-3 rounded px-2 py-2 outline-none",
													"data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
												)}
												key={item.path}
												onSelect={() => handleSelect(item)}
												value={`${item.name} ${item.path}`}
											>
												<div className="flex size-7 shrink-0 items-center justify-center rounded bg-accent group-data-[selected=true]:bg-background">
													<ItemIcon
														className="size-4 text-muted-foreground"
														weight="duotone"
													/>
												</div>
												<div className="min-w-0 flex-1">
													<p className="truncate font-medium text-sm leading-tight">
														{item.name}
													</p>
													<p className="truncate text-muted-foreground text-xs">
														{item.path}
													</p>
												</div>
											</CommandPrimitive.Item>
										);
									})}
								</CommandPrimitive.List>
							</CommandPrimitive>
						</DialogContent>
					</Dialog>

					<div className="mt-6 flex w-full max-w-xs flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
						{canGoBack && (
							<Button
								className="flex-1"
								onClick={() => router.back()}
								variant="outline"
							>
								<ArrowLeftIcon className="mr-2 size-4" weight="duotone" />
								Go Back
							</Button>
						)}
						<Button
							asChild
							className={
								canGoBack
									? "flex-1 bg-primary hover:bg-primary/90"
									: "w-full bg-primary hover:bg-primary/90"
							}
							variant="default"
						>
							<Link href="/websites">
								<HouseIcon className="mr-2 size-4" weight="duotone" />
								Back to Websites
							</Link>
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
