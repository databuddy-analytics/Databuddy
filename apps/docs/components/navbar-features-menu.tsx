"use client";

import type { IconProps } from "@phosphor-icons/react";
import {
	BugIcon,
	CaretDownIcon,
	FlagIcon,
	GaugeIcon,
	HeartbeatIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import type { ComponentType } from "react";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface FeatureItem {
	description: string;
	href: string;
	icon: ComponentType<IconProps>;
	title: string;
}

const FEATURE_ITEMS: FeatureItem[] = [
	{
		title: "Uptime Monitoring",
		description: "Status pages, 1-minute checks, and alerts",
		href: "/uptime",
		icon: HeartbeatIcon,
	},
	{
		title: "Error Tracking",
		description: "Stack traces, context, and real-time alerts",
		href: "/error-tracking",
		icon: BugIcon,
	},
	{
		title: "Web Vitals",
		description: "LCP, FID, CLS — Core Web Vitals monitoring",
		href: "/web-vitals",
		icon: GaugeIcon,
	},
	{
		title: "Feature Flags",
		description: "Safe rollouts with user targeting",
		href: "/feature-flags",
		icon: FlagIcon,
	},
];

const CLOSE_DELAY_MS = 150;

export function NavbarFeaturesMenu({
	onNavigateAction,
}: {
	onNavigateAction?: () => void;
}) {
	const [open, setOpen] = useState(false);
	const closeTimer = useRef<ReturnType<typeof setTimeout>>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);

	const clearClose = useCallback(() => {
		if (closeTimer.current) {
			clearTimeout(closeTimer.current);
			closeTimer.current = null;
		}
	}, []);

	const scheduleClose = useCallback(() => {
		clearClose();
		closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
	}, [clearClose]);

	const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			setOpen(false);
			triggerRef.current?.focus();
		}
	}, []);

	const handleItemClick = useCallback(() => {
		setOpen(false);
		onNavigateAction?.();
	}, [onNavigateAction]);

	return (
		<li className="relative">
			<button
				aria-expanded={open}
				aria-haspopup="true"
				className={cn(
					"flex items-center gap-1 px-4 py-4 font-medium text-sm transition-colors",
					open
						? "text-foreground"
						: "text-muted-foreground hover:text-foreground"
				)}
				onClick={() => setOpen((prev) => !prev)}
				onKeyDown={handleKeyDown}
				onMouseEnter={() => {
					clearClose();
					setOpen(true);
				}}
				onMouseLeave={scheduleClose}
				ref={triggerRef}
				type="button"
			>
				Features
				<CaretDownIcon
					className={cn(
						"size-3 transition-transform duration-200",
						open && "rotate-180"
					)}
					weight="bold"
				/>
			</button>

			<div
				className={cn(
					"absolute top-full left-0 pt-1 transition-all duration-200",
					open
						? "pointer-events-auto translate-y-0 opacity-100"
						: "pointer-events-none -translate-y-1 opacity-0"
				)}
				onKeyDown={handleKeyDown}
				onMouseEnter={() => {
					clearClose();
					setOpen(true);
				}}
				onMouseLeave={scheduleClose}
				ref={panelRef}
				role="menu"
			>
				<div className="w-80 rounded border border-border bg-background/95 p-1 shadow-lg backdrop-blur-xl">
					{FEATURE_ITEMS.map((item) => (
						<Link
							className="group flex items-start gap-3 rounded p-3 transition-colors hover:bg-muted/50"
							href={item.href}
							key={item.href}
							onClick={handleItemClick}
							role="menuitem"
						>
							<item.icon
								className="mt-0.5 size-5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
								weight="duotone"
							/>
							<div className="min-w-0">
								<p className="font-medium text-foreground text-sm">
									{item.title}
								</p>
								<p className="text-muted-foreground text-xs leading-relaxed">
									{item.description}
								</p>
							</div>
						</Link>
					))}
				</div>
			</div>
		</li>
	);
}

export function NavbarFeaturesMobileMenu({
	isMenuOpen,
	onCloseAction,
	baseDelayIndex,
}: {
	isMenuOpen: boolean;
	onCloseAction: () => void;
	baseDelayIndex: number;
}) {
	const [expanded, setExpanded] = useState(false);

	return (
		<div>
			<button
				className={`flex w-full items-center justify-between rounded px-4 py-3 font-medium text-base transition-all duration-200 hover:translate-x-1 hover:bg-muted/50 active:bg-muted/70 ${
					isMenuOpen ? "translate-x-0 opacity-100" : "-translate-x-4 opacity-0"
				}`}
				onClick={() => setExpanded((prev) => !prev)}
				style={{
					transitionDelay: isMenuOpen ? `${baseDelayIndex * 50}ms` : "0ms",
				}}
				type="button"
			>
				Features
				<CaretDownIcon
					className={cn(
						"size-3.5 text-muted-foreground transition-transform duration-200",
						expanded && "rotate-180"
					)}
					weight="bold"
				/>
			</button>

			<div
				className={cn(
					"overflow-hidden transition-all duration-200 ease-out",
					expanded ? "max-h-64 opacity-100" : "max-h-0 opacity-0"
				)}
			>
				<div className="space-y-1 py-1 pl-4">
					{FEATURE_ITEMS.map((item) => (
						<Link
							className="flex items-center gap-3 rounded px-4 py-2.5 text-muted-foreground text-sm transition-colors hover:bg-muted/50 hover:text-foreground"
							href={item.href}
							key={item.href}
							onClick={onCloseAction}
						>
							<item.icon className="size-4 shrink-0" weight="duotone" />
							{item.title}
						</Link>
					))}
				</div>
			</div>
		</div>
	);
}
