"use client";

import { Button } from "@databuddy/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { BrandContextMenu } from "@/components/brand-context-menu";
import { Logo } from "./logo";
import {
	NavbarFeaturesMenu,
	NavbarFeaturesMobileMenu,
} from "./navbar-features-menu";
import { GithubNavMark, githubRepoUrl } from "./github-nav-mark";
import { NavbarMobileMenuButton } from "./navbar-mobile-menu-button";

const navLink =
	"rounded-md px-3 py-1.5 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground";

const iconBtn =
	"inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";

export interface NavbarProps {
	stars?: number | null;
}

export const Navbar = ({ stars }: NavbarProps) => {
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
	const [isScrolled, setIsScrolled] = useState(false);

	useEffect(() => {
		const onScroll = () => setIsScrolled(window.scrollY > 8);
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	return (
		<header
			className={cn(
				"fixed inset-x-0 top-0 z-40 pt-[env(safe-area-inset-top,0px)] transition-[background-color,border-color,backdrop-filter] duration-200",
				isScrolled
					? "border-border border-b bg-background backdrop-blur-xl"
					: "bg-transparent"
			)}
		>
			<nav className="mx-auto flex h-14 w-full max-w-400 items-center gap-4 px-4 sm:px-14 lg:px-20">
				<BrandContextMenu>
					<div className="shrink-0">
						<Logo />
					</div>
				</BrandContextMenu>

				<div className="hidden flex-1 justify-center md:flex">
					<div className="flex items-center gap-0.5">
						<NavbarFeaturesMenu />
						{navMenu.map((menu) => (
							<Link className={navLink} href={menu.path} key={menu.path}>
								{menu.name}
							</Link>
						))}
					</div>
				</div>

				<div className="ml-auto flex items-center gap-1 md:ml-0">
					<a
						className="hidden h-8 items-center gap-1.5 rounded-md px-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:inline-flex"
						href={githubRepoUrl}
						rel="noopener noreferrer"
						target="_blank"
					>
						<GithubNavMark className="size-4" />
						{typeof stars === "number" && (
							<span className="font-medium text-xs tabular-nums">
								{stars.toLocaleString()}
							</span>
						)}
					</a>

					<Button asChild className="hidden md:inline-flex" size="sm">
						<a href="https://app.databuddy.cc/register">Start free</a>
					</Button>

					<NavbarMobileMenuButton
						className={cn(iconBtn, "md:hidden")}
						isOpen={isMobileMenuOpen}
						onToggleAction={() => setIsMobileMenuOpen((o) => !o)}
					/>
				</div>
			</nav>

			<div
				className={cn(
					"overflow-hidden transition-all duration-300 ease-out md:hidden",
					isMobileMenuOpen ? "max-h-[80vh] opacity-100" : "max-h-0 opacity-0"
				)}
			>
				<div className="border-border border-t bg-background backdrop-blur-xl">
					<div className="mx-auto max-w-7xl space-y-1 px-4 py-3 sm:px-6">
						<NavbarFeaturesMobileMenu
							baseDelayIndex={0}
							isMenuOpen={isMobileMenuOpen}
							onCloseAction={() => setIsMobileMenuOpen(false)}
						/>
						{navMenu.map((menu, i) => (
							<Link
								className={cn(
									"block rounded-md px-3 py-2 font-medium text-sm transition-all duration-200 hover:bg-muted",
									isMobileMenuOpen
										? "translate-x-0 opacity-100"
										: "-translate-x-4 opacity-0"
								)}
								href={menu.path}
								key={menu.path}
								onClick={() => setIsMobileMenuOpen(false)}
								style={{
									transitionDelay: isMobileMenuOpen
										? `${(i + 1) * 40}ms`
										: "0ms",
								}}
							>
								{menu.name}
							</Link>
						))}

						<a
							className={cn(
								"flex items-center gap-2 rounded-md px-3 py-2 font-medium text-sm transition-all duration-200 hover:bg-muted",
								isMobileMenuOpen
									? "translate-x-0 opacity-100"
									: "-translate-x-4 opacity-0"
							)}
							href={githubRepoUrl}
							onClick={() => setIsMobileMenuOpen(false)}
							rel="noopener noreferrer"
							style={{
								transitionDelay: isMobileMenuOpen
									? `${(navMenu.length + 1) * 40}ms`
									: "0ms",
							}}
							target="_blank"
						>
							<GithubNavMark className="size-4" />
							GitHub
							{typeof stars === "number" && (
								<span className="text-muted-foreground tabular-nums">
									{stars.toLocaleString()}
								</span>
							)}
						</a>

						<div className="pt-2">
							<Button
								asChild
								className="w-full"
								onClick={() => setIsMobileMenuOpen(false)}
								size="sm"
							>
								<a href="https://app.databuddy.cc/register">Start free</a>
							</Button>
						</div>
					</div>
				</div>
			</div>
		</header>
	);
};

export { iconBtn as navIconBtn };

export interface NavMenuItem {
	name: string;
	path: string;
}

export const navMenu: NavMenuItem[] = [
	{ name: "Docs", path: "/docs" },
	{ name: "Pricing", path: "/pricing" },
	{ name: "Compare", path: "/compare" },
	{ name: "Changelog", path: "/changelog" },
];
