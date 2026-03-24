"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { Branding } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { NavLink } from "./nav-link";
import { navMenu } from "./navbar";
import { NavbarGithubDesktopLink } from "./navbar-github-desktop-link";
import { NavbarGithubMobileLink } from "./navbar-github-mobile-link";
import { NavbarMobileMenuButton } from "./navbar-mobile-menu-button";
import { contents } from "./sidebar-content";

export interface DocsNavbarProps {
	stars?: number | null;
}

export const DocsNavbar = ({ stars }: DocsNavbarProps) => {
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
	const [openSection, setOpenSection] = useState(0);

	const docsSecondaryNav = navMenu.filter((menu) => menu.name !== "Docs");

	const toggleSection = (index: number) => {
		setOpenSection(openSection === index ? -1 : index);
	};

	const githubDelayMs = (contents.length * 5 + docsSecondaryNav.length) * 30;

	return (
		<div className="sticky top-0 z-30 flex flex-col border-b bg-background/60 backdrop-blur-xl">
			<nav>
				<div className="mx-auto w-full px-2 md:px-6 lg:px-8">
					<div className="flex h-16 items-center justify-between">
						<Link
							className="flex shrink-0 items-center transition-opacity hover:opacity-90"
							href="/"
						>
							<Branding heightPx={28} priority variant="primary-logo" />
						</Link>

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
						? "max-h-[80vh] border-border/50 border-b opacity-100"
						: "max-h-0 opacity-0"
				}`}
			>
				<div className="bg-background/95 backdrop-blur-sm">
					<div className="mx-auto max-h-[70dvh] max-w-7xl overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
						<div className="space-y-2">
							{contents.map((section, sectionIndex) => (
								<div key={section.title}>
									<button
										className="flex w-full items-center justify-between rounded px-2 py-2 text-left hover:bg-muted/50 active:bg-muted/70"
										onClick={() => toggleSection(sectionIndex)}
										type="button"
									>
										<div className="flex items-center gap-2">
											<section.Icon
												className="size-4 text-foreground"
												weight="duotone"
											/>
											<h3 className="font-medium text-foreground text-sm">
												{section.title}
											</h3>
										</div>
										<motion.div
											animate={{
												rotate: openSection === sectionIndex ? 180 : 0,
											}}
											transition={{ duration: 0.2 }}
										>
											<CaretDownIcon
												className="size-4 text-muted-foreground"
												weight="duotone"
											/>
										</motion.div>
									</button>
									<AnimatePresence initial={false}>
										{openSection === sectionIndex && (
											<motion.div
												animate={{ opacity: 1, height: "auto" }}
												className="relative overflow-hidden"
												exit={{ opacity: 0, height: 0 }}
												initial={{ opacity: 0, height: 0 }}
												transition={{ duration: 0.3, ease: "easeInOut" }}
											>
												<div className="ml-6 space-y-1 pb-2">
													{section.list.map((item, itemIndex) => (
														<div key={item.title}>
															{item.group ? (
																<div className="px-2 py-1">
																	<p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
																		{item.title}
																	</p>
																</div>
															) : (
																<Link
																	className={`block transform rounded px-3 py-2 text-muted-foreground text-sm transition-all duration-200 hover:translate-x-1 hover:bg-muted/50 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 active:bg-muted/70 ${
																		isMobileMenuOpen
																			? "translate-x-0 opacity-100"
																			: "-translate-x-4 opacity-0"
																	}`}
																	href={item.href || "#"}
																	onClick={() => setIsMobileMenuOpen(false)}
																	style={{
																		transitionDelay: isMobileMenuOpen
																			? `${(sectionIndex * section.list.length + itemIndex) * 30}ms`
																			: "0ms",
																	}}
																>
																	<div className="flex items-center gap-2">
																		{item.icon ? (
																			<item.icon
																				className="size-4 shrink-0"
																				weight="duotone"
																			/>
																		) : null}
																		<span>{item.title}</span>
																		{item.isNew && (
																			<span className="rounded border border-border/40 bg-muted/40 px-1.5 py-0.5 text-foreground/80 text-xs">
																				New
																			</span>
																		)}
																	</div>
																</Link>
															)}
														</div>
													))}
												</div>
											</motion.div>
										)}
									</AnimatePresence>
								</div>
							))}
						</div>

						<div className="my-4 h-px bg-border" />

						<div className="space-y-1">
							{docsSecondaryNav.map((menu, index) => (
								<Link
									className={`block transform rounded px-3 py-2 font-medium text-sm transition-all duration-200 hover:translate-x-1 hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20 active:bg-muted/70 ${
										isMobileMenuOpen
											? "translate-x-0 opacity-100"
											: "-translate-x-4 opacity-0"
									}`}
									href={menu.path}
									key={menu.path}
									onClick={() => setIsMobileMenuOpen(false)}
									style={{
										transitionDelay: isMobileMenuOpen
											? `${(contents.length * 5 + index) * 30}ms`
											: "0ms",
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
								density="compact"
								isMenuOpen={isMobileMenuOpen}
								onCloseAction={() => setIsMobileMenuOpen(false)}
								stars={stars}
								transitionDelayMs={githubDelayMs}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};
