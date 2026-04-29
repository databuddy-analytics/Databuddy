"use client";

import { CaretDownIcon } from "@databuddy/ui/icons";
import {
	BugIcon,
	FlagIcon,
	GaugeIcon,
	HeartbeatIcon,
	LinkIcon,
	RobotIcon,
} from "@databuddy/ui/icons";
import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface FeatureItem {
	description: string;
	href: string;
	icon: ComponentType<SVGProps<SVGSVGElement>>;
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
		href: "/errors",
		icon: BugIcon,
	},
	{
		title: "Web Vitals",
		description: "LCP, INP, CLS scoring and monitoring",
		href: "/web-vitals",
		icon: GaugeIcon,
	},
	{
		title: "Feature Flags",
		description: "Safe rollouts with user targeting",
		href: "/feature-flags",
		icon: FlagIcon,
	},
	{
		title: "Short Links",
		description: "Branded links with click analytics",
		href: "/links",
		icon: LinkIcon,
	},
	{
		title: "Databunny",
		description: "AI agent, insights, and anomaly detection",
		href: "/databunny",
		icon: RobotIcon,
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
		<div className="relative">
			<button
				aria-expanded={open}
				aria-haspopup="true"
				className={cn(
					"flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-sm transition-colors",
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
				/>
			</button>

			<div
				className={cn(
					"absolute top-full left-1/2 z-50 -translate-x-1/2 pt-2 transition-all duration-200",
					open
						? "pointer-events-auto translate-y-0 opacity-100"
						: "pointer-events-none -translate-y-2 opacity-0"
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
				<div className="w-[42rem] rounded-xl border border-border bg-secondary p-1.5 shadow-2xl">
					<div className="grid grid-cols-3 gap-1.5">
						{FEATURE_ITEMS.map((item) => (
							<Link
								className="group flex items-start gap-3 rounded-lg bg-background p-3.5 transition-colors hover:bg-muted"
								href={item.href}
								key={item.href}
								onClick={handleItemClick}
								role="menuitem"
							>
								<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary transition-colors group-hover:bg-background">
									<item.icon
										aria-hidden
										className="size-4 text-muted-foreground transition-colors group-hover:text-foreground"
									/>
								</div>
								<div className="min-w-0 pt-0.5">
									<p className="font-medium text-foreground text-sm">
										{item.title}
									</p>
									<p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
										{item.description}
									</p>
								</div>
							</Link>
						))}
					</div>
				</div>
			</div>
		</div>
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
				className={cn(
					"flex w-full items-center justify-between rounded-md px-3 py-2 font-medium text-sm transition-all duration-200 hover:bg-muted",
					isMenuOpen ? "translate-x-0 opacity-100" : "-translate-x-4 opacity-0"
				)}
				onClick={() => setExpanded((prev) => !prev)}
				style={{
					transitionDelay: isMenuOpen ? `${baseDelayIndex * 40}ms` : "0ms",
				}}
				type="button"
			>
				Features
				<CaretDownIcon
					className={cn(
						"size-3 text-muted-foreground transition-transform duration-200",
						expanded && "rotate-180"
					)}
				/>
			</button>

			<div
				className={cn(
					"overflow-hidden transition-all duration-200 ease-out",
					expanded ? "max-h-80 opacity-100" : "max-h-0 opacity-0"
				)}
			>
				<div className="space-y-0.5 py-1 pl-3">
					{FEATURE_ITEMS.map((item) => (
						<Link
							className="block rounded-md px-3 py-2 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
							href={item.href}
							key={item.href}
							onClick={onCloseAction}
						>
							{item.title}
						</Link>
					))}
				</div>
			</div>
		</div>
	);
}
