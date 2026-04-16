import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
	title: {
		template: "%s | Status",
		default: "System Status",
	},
	description: "Real-time system status and uptime monitoring",
	robots: {
		index: true,
		follow: true,
	},
};

export default function StatusLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <TooltipProvider>{children}</TooltipProvider>;
}
