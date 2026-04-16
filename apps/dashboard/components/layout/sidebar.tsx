"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { CategorySidebar } from "./category-sidebar";
import { MobileSidebar } from "./mobile-sidebar";
import { NavigationRenderer } from "./navigation/navigation-renderer";
import { useSidebarNavigation } from "./sidebar-navigation-provider";

export function Sidebar() {
	const { header } = useSidebarNavigation();

	return (
		<>
			<MobileSidebar />

			<div className="hidden md:block">
				<CategorySidebar />
			</div>

			<nav className="fixed inset-y-0 left-12 z-50 hidden w-64 overflow-hidden border-r bg-sidebar md:block lg:w-72">
				<ScrollArea className="h-full">
					<div className="flex h-full flex-col">
						{header}
						<NavigationRenderer />
					</div>
				</ScrollArea>
			</nav>
		</>
	);
}
