"use client";

import {
	createContext,
	type ReactNode,
	use,
	useCallback,
	useEffect,
	useState,
} from "react";
import { SidebarLeftIcon } from "@databuddy/ui/icons";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "sidebar-open";
const SHORTCUT_KEY = "\\";

interface SidebarLayoutContextValue {
	open: boolean;
	setOpen: (open: boolean) => void;
	toggle: () => void;
}

const SidebarLayoutContext = createContext<SidebarLayoutContextValue | null>(
	null
);

export function useSidebarLayout() {
	const ctx = use(SidebarLayoutContext);
	if (!ctx) {
		throw new Error("useSidebarLayout must be used within SidebarLayout");
	}
	return ctx;
}

export function SidebarLayout({ children }: { children: ReactNode }) {
	const [open, setOpenState] = useState(true);
	const [hydrated, setHydrated] = useState(false);

	useEffect(() => {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === "false") {
			setOpenState(false);
		}
		setHydrated(true);
	}, []);

	const setOpen = useCallback((value: boolean) => {
		setOpenState(value);
		localStorage.setItem(STORAGE_KEY, String(value));
	}, []);

	const toggle = useCallback(() => {
		setOpen(!open);
	}, [open, setOpen]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === SHORTCUT_KEY && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				toggle();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [toggle]);

	return (
		<SidebarLayoutContext
			value={{ open: hydrated ? open : true, toggle, setOpen }}
		>
			{children}
		</SidebarLayoutContext>
	);
}

export function SidebarPanel({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	const { open } = useSidebarLayout();

	return (
		<nav
			className={cn(
				"fixed inset-y-0 left-0 z-50 hidden flex-col overflow-hidden border-sidebar-border/50 border-r bg-sidebar md:flex",
				open ? "w-64" : "w-12",
				className
			)}
		>
			{children}
		</nav>
	);
}

export function SidebarInset({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	const { open } = useSidebarLayout();

	return (
		<div
			className={cn(
				"relative flex min-h-0 flex-1 flex-col",
				open ? "md:pl-64" : "md:pl-12",
				className
			)}
		>
			{children}
		</div>
	);
}

export function SidebarTrigger({ className }: { className?: string }) {
	const { toggle } = useSidebarLayout();

	return (
		<button
			aria-label="Toggle sidebar"
			className={cn(
				"flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/65 transition-colors duration-(--duration-quick) ease-(--ease-smooth) hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
				className
			)}
			onClick={toggle}
			type="button"
		>
			<SidebarLeftIcon aria-hidden className="size-4" />
		</button>
	);
}
