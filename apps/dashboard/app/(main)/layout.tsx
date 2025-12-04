import { DevToolsDrawer } from "@/components/dev-tools/dev-tools-drawer";
import { Sidebar } from "@/components/layout/sidebar";
import { CommandSearch } from "@/components/ui/command-search";

export default function MainLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="h-screen overflow-hidden text-foreground">
			<Sidebar />
			<CommandSearch />
			<DevToolsDrawer />
			<div className="relative h-screen pl-0 md:pl-76 lg:pl-84">
				<div className="h-screen overflow-y-auto overflow-x-hidden pt-12 md:pt-0">
					{children}
				</div>
			</div>
		</div>
	);
}
