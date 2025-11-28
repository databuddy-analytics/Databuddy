import { Sidebar } from "@/components/layout/sidebar";

export default function DemoLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="h-screen overflow-hidden text-foreground">
			<Sidebar />
			<div className="relative h-screen pl-0 md:pl-76 lg:pl-84">
				<div className="h-screen overflow-y-auto overflow-x-hidden pt-16 md:pt-0">
					{children}
				</div>
			</div>
		</div>
	);
}
