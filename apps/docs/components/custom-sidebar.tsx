"use client";

import { CaretDownIcon, MagnifyingGlassIcon } from "@databuddy/ui/icons";
import { useSearchContext } from "fumadocs-ui/provider";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
	docsNavActiveItem,
	docsNavBadge,
	docsNavControl,
	docsNavItem,
} from "@/components/docs-nav-styles";
import { AsideLink } from "@/components/ui/aside-link";
import { cn } from "@/lib/utils";
import {
	contents,
	type SidebarItem,
	type SidebarSection,
} from "./sidebar-content";

function itemMatchesPath(item: SidebarItem, pathname: string) {
	if (item.href === pathname) {
		return true;
	}
	return item.children?.some((child) => child.href === pathname) ?? false;
}

function getDefaultOpenState(pathname: string) {
	const defaultOpen = contents.findIndex((section) =>
		section.list.some((item) => itemMatchesPath(item, pathname))
	);
	const defaultNestedOpen = new Set<string>();

	for (const section of contents) {
		for (const item of section.list) {
			if (item.children?.some((child) => child.href === pathname)) {
				defaultNestedOpen.add(item.title);
			}
		}
	}

	return {
		defaultOpen: defaultOpen === -1 ? 0 : defaultOpen,
		defaultNestedOpen,
	};
}

export default function CustomSidebar() {
	const pathname = usePathname();
	const { setOpenSearch } = useSearchContext();

	return (
		<CustomSidebarContent
			key={pathname}
			onSearchAction={() => setOpenSearch(true)}
			pathname={pathname}
		/>
	);
}

function CustomSidebarContent({
	onSearchAction,
	pathname,
}: {
	onSearchAction: () => void;
	pathname: string;
}) {
	const { defaultOpen, defaultNestedOpen } = useMemo(
		() => getDefaultOpenState(pathname),
		[pathname]
	);

	const [currentOpen, setCurrentOpen] = useState<number>(defaultOpen);
	const [nestedOpen, setNestedOpen] = useState<Set<string>>(defaultNestedOpen);

	const toggleNested = (title: string) => {
		setNestedOpen((openItems) => {
			const next = new Set(openItems);
			if (next.has(title)) {
				next.delete(title);
			} else {
				next.add(title);
			}
			return next;
		});
	};

	return (
		<div className="fixed top-[calc(3.5rem+env(safe-area-inset-top,0px))] left-0 z-30 hidden h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px))] md:block">
			<aside className="flex h-full w-[268px] flex-col overflow-y-auto border-sidebar-border/50 border-t border-r bg-sidebar text-sidebar-foreground lg:w-[286px]">
				<div className="flex h-full flex-col">
					<div className="border-sidebar-border/30 border-b p-2">
						<button
							className={cn(
								docsNavControl,
								"h-9 w-full gap-2.5 bg-sidebar-accent/50 px-2.5 text-left text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground"
							)}
							onClick={onSearchAction}
							type="button"
						>
							<MagnifyingGlassIcon
								className="size-4 shrink-0"
								weight="duotone"
							/>
							<span className="min-w-0 flex-1 truncate">
								Search documentation&hellip;
							</span>
						</button>
					</div>

					<MotionConfig
						transition={{ duration: 0.26, type: "spring", bounce: 0 }}
					>
						<div className="flex flex-col gap-1 p-2">
							{contents.map((item, index) => (
								<SidebarSectionBlock
									isOpen={currentOpen === index}
									key={item.title}
									nestedOpen={nestedOpen}
									onNestedToggle={toggleNested}
									onToggle={() =>
										setCurrentOpen(currentOpen === index ? -1 : index)
									}
									section={item}
								/>
							))}
						</div>
					</MotionConfig>
				</div>
			</aside>
		</div>
	);
}

function SidebarSectionBlock({
	isOpen,
	nestedOpen,
	onNestedToggle,
	onToggle,
	section,
}: {
	isOpen: boolean;
	nestedOpen: Set<string>;
	onNestedToggle: (title: string) => void;
	onToggle: () => void;
	section: SidebarSection;
}) {
	const Icon = section.Icon;

	return (
		<div>
			<button
				aria-expanded={isOpen}
				className={cn(
					docsNavControl,
					"h-8 w-full gap-2.5 px-2.5 text-left font-medium",
					isOpen
						? "bg-sidebar-accent/70 text-sidebar-foreground"
						: "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
				)}
				onClick={onToggle}
				type="button"
			>
				<Icon className="size-4 shrink-0" weight="duotone" />
				<span className="min-w-0 flex-1 truncate">{section.title}</span>
				{section.isNew ? <NewBadge /> : null}
				<motion.div animate={{ rotate: isOpen ? 180 : 0 }} className="shrink-0">
					<CaretDownIcon
						className="size-3.5 text-sidebar-foreground/35"
						weight="duotone"
					/>
				</motion.div>
			</button>

			<AnimatePresence initial={false}>
				{isOpen ? (
					<motion.div
						animate={{ opacity: 1, height: "auto" }}
						className="relative overflow-hidden"
						exit={{ opacity: 0, height: 0 }}
						initial={{ opacity: 0, height: 0 }}
					>
						<motion.div className="my-1 rounded bg-sidebar-accent/20 py-1 ring-1 ring-sidebar-border/25">
							{section.list.map((item) => (
								<DocSidebarItem
									item={item}
									key={item.title}
									nestedOpen={nestedOpen}
									onNestedToggle={onNestedToggle}
								/>
							))}
						</motion.div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}

function DocSidebarItem({
	item,
	nestedOpen,
	onNestedToggle,
}: {
	item: SidebarItem;
	nestedOpen: Set<string>;
	onNestedToggle: (title: string) => void;
}) {
	if (item.group) {
		return (
			<div className="px-2.5 pt-2 pb-1">
				<p className="font-semibold text-[11px] text-sidebar-foreground/35 uppercase">
					{item.title}
				</p>
			</div>
		);
	}

	if (item.children) {
		const isOpen = nestedOpen.has(item.title);
		const Icon = item.icon;

		return (
			<div>
				<button
					aria-expanded={isOpen}
					className={cn(docsNavControl, docsNavItem, "w-full text-left")}
					onClick={() => onNestedToggle(item.title)}
					type="button"
				>
					{Icon ? <Icon className="size-4 shrink-0" weight="duotone" /> : null}
					<span className="min-w-0 flex-1 truncate">{item.title}</span>
					{item.isNew ? <NewBadge /> : null}
					<motion.div
						animate={{ rotate: isOpen ? 90 : 0 }}
						className="shrink-0"
					>
						<CaretDownIcon
							className="size-3 text-sidebar-foreground/35"
							weight="duotone"
						/>
					</motion.div>
				</button>

				<AnimatePresence initial={false}>
					{isOpen ? (
						<motion.div
							animate={{ opacity: 1, height: "auto" }}
							className="relative overflow-hidden"
							exit={{ opacity: 0, height: 0 }}
							initial={{ opacity: 0, height: 0 }}
						>
							<div className="mx-2 mb-1 ml-5 border-sidebar-border/40 border-l pl-2">
								{item.children.map((child) => (
									<SidebarLink item={child} key={child.title} nested />
								))}
							</div>
						</motion.div>
					) : null}
				</AnimatePresence>
			</div>
		);
	}

	return <SidebarLink item={item} />;
}

function SidebarLink({
	item,
	nested = false,
}: {
	item: SidebarItem;
	nested?: boolean;
}) {
	const Icon = item.icon;

	return (
		<AsideLink
			activeClassName={docsNavActiveItem}
			className={cn(
				docsNavControl,
				nested
					? "h-8 gap-2 px-2 text-sidebar-foreground/55 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
					: docsNavItem
			)}
			href={item.href || "#"}
			startWith="/docs"
			title={item.title}
		>
			{Icon ? <Icon className="size-4 shrink-0" weight="duotone" /> : null}
			<span className="min-w-0 flex-1 truncate">{item.title}</span>
			{item.isNew ? <NewBadge /> : null}
		</AsideLink>
	);
}

function NewBadge({ isSelected }: { isSelected?: boolean }) {
	return (
		<div className="flex shrink-0 items-center justify-end">
			<span
				className={cn(
					docsNavBadge,
					isSelected && "bg-sidebar-primary/15 text-sidebar-primary"
				)}
			>
				New
			</span>
		</div>
	);
}
