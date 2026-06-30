"use client";

import {
	createContext,
	type ReactNode,
	use,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { MagnifyingGlassIcon } from "@databuddy/ui/icons";
import { useCommandSearchOpenAction } from "@/components/ui/command-search";
import { PendingInvitationsButton } from "./pending-invitations-button";
import { SidebarTrigger } from "./sidebar-layout";
import { Button } from "@databuddy/ui";

type SlotMap = Map<string, ReactNode>;
type Listener = () => void;

interface TopBarStore {
	getSlot: (name: string) => ReactNode;
	removeSlot: (name: string, id: string) => void;
	setSlot: (name: string, id: string, node: ReactNode) => void;
	subscribe: (listener: Listener) => () => void;
}

function createTopBarStore(): TopBarStore {
	const slots: Record<string, SlotMap> = {};
	const listeners = new Set<Listener>();

	function notify() {
		for (const l of listeners) {
			l();
		}
	}

	return {
		getSlot(name: string) {
			const map = slots[name];
			if (!map || map.size === 0) {
				return null;
			}
			return Array.from(map.values()).at(-1) ?? null;
		},
		setSlot(name: string, id: string, node: ReactNode) {
			if (!slots[name]) {
				slots[name] = new Map();
			}
			slots[name].set(id, node);
			notify();
		},
		removeSlot(name: string, id: string) {
			slots[name]?.delete(id);
			if (slots[name]?.size === 0) {
				delete slots[name];
			}
			notify();
		},
		subscribe(listener: Listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

const TopBarStoreContext = createContext<TopBarStore | null>(null);

function useStore() {
	const store = use(TopBarStoreContext);
	if (!store) {
		throw new Error("TopBar slot must be used within TopBarProvider");
	}
	return store;
}

function useStoreSlot(name: string): ReactNode {
	const store = useStore();
	const [, forceUpdate] = useState(0);

	useEffect(() => store.subscribe(() => forceUpdate((n) => n + 1)), [store]);

	return store.getSlot(name);
}

function useTopBarSlot(name: string, content: ReactNode) {
	const store = useStore();
	const id = useId();
	const contentRef = useRef(content);
	contentRef.current = content;

	useEffect(() => {
		store.setSlot(name, id, contentRef.current);
		return () => store.removeSlot(name, id);
	}, [store, name, id]);

	useEffect(() => {
		store.setSlot(name, id, content);
	}, [store, name, id, content]);
}

function TopBarTitle({ children }: { children: ReactNode }) {
	const content = (
		<div className="flex min-w-0 items-center gap-2 [&_h1]:truncate [&_h1]:font-semibold [&_h1]:text-sm">
			{children}
		</div>
	);
	useTopBarSlot("title", content);
	return null;
}

function TopBarActions({ children }: { children: ReactNode }) {
	const content = (
		<div className="flex min-w-0 items-center gap-1.5">{children}</div>
	);
	useTopBarSlot("actions", content);
	return null;
}

interface BreadcrumbItem {
	href?: string;
	label: string;
}

function TopBarBreadcrumbs({
	items,
	icon,
}: {
	icon?: ReactNode;
	items: BreadcrumbItem[];
}) {
	const content = (
		<nav aria-label="breadcrumb" className="flex min-w-0 items-center gap-2">
			{icon && (
				<span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-sidebar-foreground/60">
					{icon}
				</span>
			)}
			<ol className="flex min-w-0 items-center gap-1.5">
				{items.map((item, i) => {
					const isLast = i === items.length - 1;
					return (
						<li className="flex min-w-0 items-center gap-1.5" key={item.label}>
							{i > 0 && (
								<span className="shrink-0 text-sidebar-foreground/30">/</span>
							)}
							{isLast || !item.href ? (
								<span className="truncate font-semibold text-foreground text-sm">
									{item.label}
								</span>
							) : (
								<a
									className="truncate text-sidebar-foreground/55 text-sm hover:text-sidebar-foreground"
									href={item.href}
								>
									{item.label}
								</a>
							)}
						</li>
					);
				})}
			</ol>
		</nav>
	);
	useTopBarSlot("title", content);
	return null;
}

export function TopBarProvider({ children }: { children: ReactNode }) {
	const storeRef = useRef<TopBarStore | null>(null);
	if (!storeRef.current) {
		storeRef.current = createTopBarStore();
	}

	return (
		<TopBarStoreContext value={storeRef.current}>{children}</TopBarStoreContext>
	);
}

export function TopBar() {
	const titleContent = useStoreSlot("title");
	const actionsContent = useStoreSlot("actions");
	const [hasMounted, setHasMounted] = useState(false);
	const openSearch = useCommandSearchOpenAction();

	useEffect(() => {
		setHasMounted(true);
	}, []);

	return (
		<header className="sticky top-0 z-40 hidden h-12 shrink-0 border-sidebar-border/60 border-b bg-sidebar/95 backdrop-blur supports-[backdrop-filter]:bg-sidebar/85 md:block">
			<div
				aria-label="Dashboard top bar"
				className="grid h-full w-full grid-cols-[3rem_minmax(0,1fr)_auto] items-center"
				role="toolbar"
			>
				<div className="flex h-full items-center justify-center border-sidebar-border/50 border-r">
					<SidebarTrigger />
				</div>

				<div className="flex min-w-0 items-center px-3">
					<div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
						{hasMounted ? titleContent : null}
					</div>
				</div>

				<div className="flex h-full min-w-0 items-center">
					{hasMounted && actionsContent ? (
						<div className="flex h-full min-w-0 items-center gap-1.5 overflow-hidden border-sidebar-border/50 border-l px-2">
							{actionsContent}
						</div>
					) : null}

					<div className="flex h-full shrink-0 items-center gap-1 border-sidebar-border/50 border-l px-2">
						<Button
							aria-label="Search"
							className="h-8 min-w-9 justify-start gap-2 rounded-md px-2.5 text-sidebar-foreground/65 hover:text-sidebar-foreground lg:min-w-40"
							onClick={() => openSearch()}
							size="sm"
							variant="secondary"
						>
							<MagnifyingGlassIcon className="size-4" />
							<span className="hidden text-xs lg:inline">Search…</span>
							<kbd className="ml-auto hidden rounded border bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-sidebar-foreground/50 xl:inline">
								⌘K
							</kbd>
						</Button>
						{hasMounted && <PendingInvitationsButton />}
					</div>
				</div>
			</div>
		</header>
	);
}

TopBar.Title = TopBarTitle;
TopBar.Actions = TopBarActions;
TopBar.Breadcrumbs = TopBarBreadcrumbs;
