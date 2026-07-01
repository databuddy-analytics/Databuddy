import { ArrowLeftIcon } from "@databuddy/ui/icons";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { getDemoEmbedBaseUrl, hostFromNextHeaders } from "@/lib/demo-embed-url";

export const metadata: Metadata = {
	title: "Live Demo | Databuddy",
	description:
		"Experience Databuddy analytics in action with our live demo dashboard. See real-time analytics, insights, and privacy-first tracking.",
};

export default async function DemoPage() {
	const headerList = await headers();
	const iframeSrc = getDemoEmbedBaseUrl(hostFromNextHeaders(headerList));
	const prompts = [
		"Why did signups dip?",
		"Show funnel drop-offs",
		"Which pages got slower?",
	];

	return (
		<div className="fixed inset-0 h-full w-full">
			{/* Floating Navigation Header */}
			<div className="absolute top-4 right-4 left-4 z-50 flex items-center justify-between">
				<Link
					className="group flex items-center gap-2 rounded border border-border bg-card/90 px-4 py-2 font-medium text-sm shadow-lg backdrop-blur-sm hover:bg-card"
					href="/"
				>
					<ArrowLeftIcon
						className="size-4 text-foreground transition-transform group-hover:-translate-x-0.5"
						weight="fill"
					/>
					<span className="text-foreground">Back to Home</span>
				</Link>

				<div className="flex items-center gap-2">
					<div className="flex items-center gap-2 rounded border border-border bg-card/90 px-3 py-2 shadow-lg backdrop-blur-sm">
						<div className="size-2 animate-pulse rounded-full bg-green-500" />
						<span className="font-medium text-foreground text-xs">
							Live Demo
						</span>
					</div>

					<Link
						className="group flex items-center gap-2 rounded border border-border bg-primary/90 px-4 py-2 font-medium text-primary-foreground text-sm shadow-lg backdrop-blur-sm hover:bg-primary"
						href="https://app.databuddy.cc/register"
						rel="noopener"
						target="_blank"
					>
						<span>Get Started Free</span>
						<ArrowLeftIcon
							className="size-4 rotate-180 transition-transform group-hover:translate-x-0.5"
							weight="fill"
						/>
					</Link>
				</div>
			</div>

			<div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 border-border/70 border-t bg-background/94 shadow-[0_-18px_70px_rgba(0,0,0,0.35)] backdrop-blur-md">
				<div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
					<div className="max-w-2xl">
						<div className="mb-2 font-mono text-muted-foreground text-xs uppercase tracking-[0.16em]">
							Live AI analytics demo
						</div>
						<h1 className="text-balance font-semibold text-2xl text-foreground leading-tight md:text-4xl">
							Ask why your metrics changed
						</h1>
						<p className="mt-2 max-w-xl text-muted-foreground text-sm leading-6 md:text-base">
							Explore real traffic, funnels, errors, vitals, and feature flags.
							Databuddy turns the dashboard into answers your team can act on.
						</p>
					</div>

					<div className="flex flex-col gap-3 md:items-end">
						<div className="flex flex-wrap gap-2">
							{prompts.map((prompt) => (
								<span
									className="rounded border border-border/70 bg-card/80 px-2.5 py-1 font-mono text-muted-foreground text-xs"
									key={prompt}
								>
									{prompt}
								</span>
							))}
						</div>
						<Link
							className="pointer-events-auto inline-flex items-center justify-center gap-2 rounded border border-primary/70 bg-primary px-4 py-2.5 font-medium text-primary-foreground text-sm shadow-lg transition hover:bg-primary/90"
							href="https://app.databuddy.cc/register"
							rel="noopener"
							target="_blank"
						>
							Create free account
							<ArrowLeftIcon
								className="size-4 rotate-180 transition-transform"
								weight="fill"
							/>
						</Link>
					</div>
				</div>
			</div>

			{/* Demo iframe */}
			<iframe
				allow="fullscreen"
				className="h-full w-full border-0"
				loading="lazy"
				src={iframeSrc}
				style={{
					colorScheme: "light dark",
				}}
				title="Databuddy Analytics Demo Dashboard"
			/>
		</div>
	);
}
