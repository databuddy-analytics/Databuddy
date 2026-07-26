import type { Metadata } from "next";
import Link from "next/link";
import { Branding } from "@/components/logo/branding";
import { ClockIcon } from "@databuddy/ui/icons";
import { Button } from "@databuddy/ui";

export const metadata: Metadata = {
	title: "Link Expired - Databuddy",
	description: "This link has expired and is no longer available.",
};

export default function LinkExpiredPage() {
	return (
		<div className="flex min-h-dvh flex-col bg-background">
			<header className="mx-auto flex w-full max-w-5xl items-center p-6">
				<Link
					className="flex items-center gap-2 text-foreground"
					href="https://databuddy.cc"
				>
					<Branding priority variant="primary-logo" />
				</Link>
			</header>

			<main className="flex flex-1 flex-col items-center justify-center px-6">
				<div className="flex w-full max-w-sm flex-col items-center">
					<div className="mb-5 flex size-12 items-center justify-center rounded bg-accent">
						<ClockIcon
							className="size-6 text-muted-foreground"
							weight="duotone"
						/>
					</div>

					<p className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">
						Expired
					</p>
					<h1 className="mb-2 font-semibold text-foreground text-lg">
						Link has expired
					</h1>
					<p className="mb-6 text-balance text-center text-muted-foreground text-sm">
						The sender set this link to expire. Ask them to create and share a
						new link if you still need access.
					</p>

					<Button asChild className="w-full" variant="outline">
						<Link href="https://databuddy.cc">Learn about Databuddy</Link>
					</Button>
				</div>
			</main>

			<footer className="mx-auto flex w-full max-w-5xl items-center justify-center p-6">
				<p className="text-muted-foreground/60 text-xs">
					© {new Date().getFullYear()} Databuddy
				</p>
			</footer>
		</div>
	);
}
