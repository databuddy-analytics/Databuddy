"use client";

import { Button } from "@databuddy/ui";
import { useEffect, useState } from "react";
import {
	docsNavIconButton,
	docsNavTopLink,
} from "@/components/docs-nav-styles";
import { cn } from "@/lib/utils";
import { BrandContextMenu } from "@/components/brand-context-menu";
import { Logo } from "./logo";
import { NavLink } from "./nav-link";
import {
	NavbarFeaturesMenu,
	NavbarFeaturesMobileMenu,
} from "./navbar-features-menu";
import { GithubNavMark, githubRepoUrl } from "./github-nav-mark";
import { NavbarMobileMenuButton } from "./navbar-mobile-menu-button";

const navLink = docsNavTopLink;

const iconBtn = docsNavIconButton;

export interface NavbarProps {
	stars?: number | null;
	variant?: "default" | "solid";
}

export const Navbar = ({ stars, variant = "default" }: NavbarProps) => {
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
	const [isScrolled, setIsScrolled] = useState(false);
	const isSolid = variant === "solid" || isScrolled;

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
				isSolid
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
							<NavLink
								className={navLink}
								href={menu.path}
								key={menu.path}
								navItem={menu.trackId}
							>
								{menu.name}
							</NavLink>
						))}
					</div>
				</div>

				<div className="ml-auto flex items-center gap-1 md:ml-0">
					<NavLink
						className={cn(docsNavTopLink, "hidden gap-1.5 px-2 md:inline-flex")}
						external
						href={githubRepoUrl}
						navItem="github"
					>
						<GithubNavMark className="size-4" />
						{typeof stars === "number" && (
							<span className="font-medium text-xs tabular-nums">
								{stars.toLocaleString()}
							</span>
						)}
					</NavLink>

					<Button asChild className="hidden md:inline-flex" size="sm">
						<a
							data-destination="register"
							data-placement="navbar"
							data-track="cta_clicked"
							href="https://app.databuddy.cc/register"
						>
							Start free
						</a>
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
							<NavLink
								className={cn(
									"block rounded px-3 py-2 font-medium text-sm transition-all duration-200 hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
									isMobileMenuOpen
										? "translate-x-0 opacity-100"
										: "-translate-x-4 opacity-0"
								)}
								href={menu.path}
								key={menu.path}
								navItem={menu.trackId}
								onClick={() => setIsMobileMenuOpen(false)}
								section="navbar_mobile"
								style={{
									transitionDelay: isMobileMenuOpen
										? `${(i + 1) * 40}ms`
										: "0ms",
								}}
							>
								{menu.name}
							</NavLink>
						))}

						<NavLink
							className={cn(
								"flex items-center gap-2 rounded px-3 py-2 font-medium text-sm transition-all duration-200 hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
								isMobileMenuOpen
									? "translate-x-0 opacity-100"
									: "-translate-x-4 opacity-0"
							)}
							external
							href={githubRepoUrl}
							navItem="github"
							onClick={() => setIsMobileMenuOpen(false)}
							section="navbar_mobile"
							style={{
								transitionDelay: isMobileMenuOpen
									? `${(navMenu.length + 1) * 40}ms`
									: "0ms",
							}}
						>
							<GithubNavMark className="size-4" />
							GitHub
							{typeof stars === "number" && (
								<span className="text-muted-foreground tabular-nums">
									{stars.toLocaleString()}
								</span>
							)}
						</NavLink>

						<div className="pt-2">
							<Button
								asChild
								className="w-full"
								onClick={() => setIsMobileMenuOpen(false)}
								size="sm"
							>
								<a
									data-destination="register"
									data-placement="navbar_mobile"
									data-track="cta_clicked"
									href="https://app.databuddy.cc/register"
								>
									Start free
								</a>
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
	trackId: string;
}

export const navMenu: NavMenuItem[] = [
	{ name: "Docs", path: "/docs", trackId: "docs" },
	{ name: "Pricing", path: "/pricing", trackId: "pricing" },
	{ name: "Compare", path: "/compare", trackId: "compare" },
	{ name: "Changelog", path: "/changelog", trackId: "changelog" },
];
