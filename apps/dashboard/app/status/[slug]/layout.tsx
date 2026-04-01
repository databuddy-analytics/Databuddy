import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StatusNavbar } from "./_components/status-navbar";

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
	return (
		<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
			<TooltipProvider>
				<div className="flex h-full flex-col overflow-hidden bg-background">
					<StatusNavbar />

					<main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
						<div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
							{children}
						</div>
					</main>

					<footer className="shrink-0 border-t">
						<div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4 sm:px-6">
							<p className="text-muted-foreground text-xs">
								Powered by{" "}
								<a
									className="font-medium text-foreground hover:underline"
									href="https://www.databuddy.cc"
									rel="noopener noreferrer dofollow"
									target="_blank"
								>
									Databuddy
								</a>
							</p>
						</div>
					</footer>
				</div>
			</TooltipProvider>
		</ThemeProvider>
	);
}
