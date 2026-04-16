"use client";

import { cn } from "@/lib/utils";
import { useSidebarNavigation } from "../sidebar-navigation-provider";
import { isNavItemActive } from "./nav-item-active";
import { NavigationItem } from "./navigation-item";
import { NavigationSection } from "./navigation-section";
import type {
	NavigationEntry,
	NavigationItem as NavigationItemType,
	NavigationSection as NavigationSectionType,
} from "./types";

const isSection = (entry: NavigationEntry): entry is NavigationSectionType =>
	"items" in entry;

const isItem = (entry: NavigationEntry): entry is NavigationItemType =>
	"href" in entry && !("items" in entry);

export function NavigationRenderer({ className }: { className?: string }) {
	const { navigation, currentWebsiteId, pathname, accordionStates } =
		useSidebarNavigation();

	return (
		<nav
			aria-label="Main navigation"
			className={cn("flex flex-col", className)}
		>
			{navigation.map((entry, idx) => {
				if (isSection(entry)) {
					return (
						<NavigationSection
							accordionStates={accordionStates}
							className={cn(
								navigation.length > 1 && idx === navigation.length - 1
									? "border-t"
									: idx === 0 && navigation.length < 2
										? "border-b"
										: idx !== 0 && navigation.length > 1
											? "border-t"
											: "border-transparent"
							)}
							currentWebsiteId={currentWebsiteId}
							flag={entry.flag}
							icon={entry.icon}
							items={entry.items}
							key={entry.title}
							pathname={pathname}
							title={entry.title}
						/>
					);
				}

				if (isItem(entry)) {
					return (
						<div className={cn(idx !== 0 && "border-t")} key={entry.name}>
							<NavigationItem
								alpha={entry.alpha}
								badge={entry.badge}
								currentWebsiteId={currentWebsiteId}
								disabled={entry.disabled}
								domain={entry.domain}
								href={entry.href}
								icon={entry.icon}
								isActive={isNavItemActive(entry, pathname, currentWebsiteId)}
								isExternal={entry.external}
								isLocked={false}
								isRootLevel={!!entry.rootLevel}
								lockedPlanName={null}
								name={entry.name}
								pathname={pathname}
								production={entry.production}
								sectionName="main"
								tag={entry.tag}
							/>
						</div>
					);
				}

				return null;
			})}
		</nav>
	);
}
