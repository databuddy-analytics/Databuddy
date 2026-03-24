"use client";

import Link from "next/link";
import { useState } from "react";
import { BrandContextMenu } from "@/components/brand-context-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "./logo";
import { NavLink } from "./nav-link";
import { NavbarGithubDesktopLink } from "./navbar-github-desktop-link";
import { NavbarGithubMobileLink } from "./navbar-github-mobile-link";
import { NavbarMobileMenuButton } from "./navbar-mobile-menu-button";

export interface NavbarProps {
	stars?: number | null;
}

export const Navbar = ({ stars }: NavbarProps) => {
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

	return (
		<div className="sticky top-0 z-30 flex flex-col border-b bg-background/60 backdrop-blur-xl">
			<nav>
				<div className="mx-auto w-full px-2 md:px-6 lg:px-8">
					<div className="flex h-16 items-center justify-between">
						<BrandContextMenu>
							<div className="shrink-0 transition-opacity hover:opacity-90">
								<Logo />
							</div>
						</BrandContextMenu>

						<div className="hidden md:block">
							<ul className="flex items-center gap-1">
								{navMenu.map((menu) => (
									<NavLink
										external={menu.external}
										href={menu.path}
										key={menu.path}
									>
										{menu.name}
									</NavLink>
								))}
								<NavbarGithubDesktopLink stars={stars} />
								<li className="ml-2">
									<ThemeToggle />
								</li>
							</ul>
						</div>

						<NavbarMobileMenuButton
							isOpen={isMobileMenuOpen}
							onToggleAction={() => setIsMobileMenuOpen((open) => !open)}
						/>
					</div>
				</div>
			</nav>

			<div
				className={`overflow-hidden transition-all duration-300 ease-out md:hidden ${
					isMobileMenuOpen
						? "max-h-96 border-border/50 border-b opacity-100"
						: "max-h-0 opacity-0"
				}`}
			>
				<div className="bg-background/95 backdrop-blur-sm">
					<div className="mx-auto max-w-7xl space-y-1 px-4 py-4 sm:px-6 lg:px-8">
						{navMenu.map((menu, index) => (
							<Link
								className={`block transform rounded px-4 py-3 font-medium text-base transition-all duration-200 hover:translate-x-1 hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20 active:bg-muted/70 ${
									isMobileMenuOpen
										? "translate-x-0 opacity-100"
										: "-translate-x-4 opacity-0"
								}`}
								href={menu.path}
								key={menu.path}
								onClick={() => setIsMobileMenuOpen(false)}
								style={{
									transitionDelay: isMobileMenuOpen ? `${index * 50}ms` : "0ms",
								}}
								{...(menu.external && {
									target: "_blank",
									rel: "noopener noreferrer",
								})}
							>
								{menu.name}
							</Link>
						))}
						<NavbarGithubMobileLink
							isMenuOpen={isMobileMenuOpen}
							onCloseAction={() => setIsMobileMenuOpen(false)}
							stars={stars}
							transitionDelayMs={navMenu.length * 50}
						/>
					</div>
				</div>
			</div>
		</div>
	);
};

export type NavMenuItem = {
	name: string;
	path: string;
	external?: boolean;
};

export const navMenu: NavMenuItem[] = [
	{ name: "Docs", path: "/docs" },
	{
		name: "Dashboard",
		path: "https://app.databuddy.cc/login",
		external: true,
	},
	{ name: "Pricing", path: "/pricing" },
	{ name: "Changelog", path: "/changelog" },
	{ name: "Contact", path: "/contact" },
];
