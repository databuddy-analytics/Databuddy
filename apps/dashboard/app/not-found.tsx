"use client";

import { ArrowLeftIcon } from "@phosphor-icons/react";
import { CommandIcon } from "@phosphor-icons/react";
import { HouseIcon } from "@phosphor-icons/react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Command as CommandPrimitive } from "cmdk";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
	resourcesNavigation,
	settingsNavigation,
} from "@/components/layout/navigation/navigation-config";
import type {
	NavigationItem,
	NavigationSection,
} from "@/components/layout/navigation/types";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const ALL_NAVIGATION: NavigationSection[] = [
	...settingsNavigation,
	...resourcesNavigation,
];

interface SearchItem {
	icon: typeof MagnifyingGlassIcon;
	name: string;
	path: string;
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
		<div className="flex min-h-dvh flex-col items-center justify-center bg-background p-4 sm:p-6">
			<div className="flex w-full max-w-sm flex-col items-center text-center">
				<div
					aria-hidden="true"
					className="flex size-12 items-center justify-center rounded bg-accent"
				>
					<MagnifyingGlassIcon
						className="size-6 text-muted-foreground"
						weight="duotone"
					/>
				</div>

				<div className="mt-6 space-y-2">
					<h1 className="text-balance font-semibold text-foreground text-lg">
						Page Not Found
					</h1>
					<p className="text-pretty text-muted-foreground text-sm leading-relaxed">
						We&apos;ve lost this page in the data stream.
					</p>
				</div>

				<Button
					className="mt-6 w-full"
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

				<div className="mt-3 flex w-full gap-3">
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
					<Button asChild className="flex-1" variant="default">
						<Link href="/websites">
							<HouseIcon className="mr-2 size-4" weight="duotone" />
							Back to Websites
						</Link>
					</Button>
				</div>
			</div>

			<Dialog onOpenChange={setOpen} open={open}>
				<DialogHeader className="sr-only">
					<DialogTitle>Search</DialogTitle>
					<DialogDescription>Search for pages and settings</DialogDescription>
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
		</div>
	);
}
