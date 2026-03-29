import { BookOpenTextIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Branding } from "@/components/logo/branding";
import { Button } from "@/components/ui/button";
import { APP_URL } from "@/lib/app-url";

export function StatusNavbar() {
	return (
		<div className="sticky top-0 z-30 border-b bg-background/60 backdrop-blur-xl">
			<nav className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4 sm:px-6">
				<Link
					className="transition-opacity hover:opacity-90"
					href="https://www.databuddy.cc"
					rel="noopener noreferrer"
					target="_blank"
				>
					<Branding heightPx={24} priority variant="primary-logo" />
				</Link>

				<div className="flex items-center gap-1">
					<Button asChild size="sm" variant="ghost">
						<Link
							href="https://www.databuddy.cc/docs"
							rel="noopener noreferrer"
							target="_blank"
						>
							<BookOpenTextIcon className="size-4" weight="duotone" />
							<span className="hidden sm:inline">Docs</span>
						</Link>
					</Button>

					<ThemeToggle className="flex" />

					<Button asChild className="ml-1" size="sm">
						<Link
							href={`${APP_URL}/login`}
							rel="noopener noreferrer"
							target="_blank"
						>
							Get Started
						</Link>
					</Button>
				</div>
			</nav>
		</div>
	);
}
