import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/app/util/constants";
import { CompetitorCard } from "@/components/compare/competitor-card";
import { SciFiButton } from "@/components/landing/scifi-btn";
import Section from "@/components/landing/section";
import { Spotlight } from "@/components/landing/spotlight";
import { StructuredData } from "@/components/structured-data";
import { competitors } from "@/lib/comparison-config";

const switchFromTitle =
	"Switch from Plausible, Fathom, Google Analytics & More | Databuddy";
const switchFromDescription =
	"Migration-focused comparison pages: what you keep, what you gain, and how pricing compares when you switch from major analytics tools to Databuddy.";
const switchFromUrl = `${SITE_URL}/switch-from`;

export const metadata: Metadata = {
	title: switchFromTitle,
	description: switchFromDescription,
	openGraph: {
		title: switchFromTitle,
		description: switchFromDescription,
		url: switchFromUrl,
	},
	alternates: { canonical: switchFromUrl },
};

export default function SwitchFromHubPage() {
	const entries = Object.entries(competitors);

	return (
		<div className="overflow-hidden">
			<StructuredData
				page={{
					title: switchFromTitle,
					description: switchFromDescription,
					url: switchFromUrl,
				}}
			/>
			<Spotlight transform="translateX(-60%) translateY(-50%)" />

			<div className="container mx-auto px-4 pt-8">
				<div className="flex items-center gap-2 text-muted-foreground text-sm">
					<Link className="transition-colors hover:text-foreground" href="/">
						Home
					</Link>
					<span>/</span>
					<span className="text-foreground">Switch from</span>
				</div>
			</div>

			<Section className="overflow-hidden" customPaddings id="switch-from-hero">
				<section className="relative w-full pt-12 pb-12 sm:pt-16 sm:pb-16 lg:pt-20 lg:pb-20">
					<div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
						<div className="text-center">
							<h1 className="mb-4 text-balance font-semibold text-3xl leading-tight tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
								Switch{" "}
								<span className="text-muted-foreground">from your tool</span>
							</h1>
							<p className="mx-auto max-w-2xl text-balance text-muted-foreground text-sm leading-relaxed sm:text-base">
								Already planning to leave your current analytics? Choose your
								tool below for pricing, feature parity, and what changes when
								you move to Databuddy. You can also browse{" "}
								<Link
									className="font-medium text-foreground underline-offset-4 hover:underline"
									href="/alternatives"
								>
									alternatives by tool
								</Link>{" "}
								or the{" "}
								<Link
									className="font-medium text-foreground underline-offset-4 hover:underline"
									href="/compare"
								>
									main comparison list
								</Link>
								.
							</p>
						</div>
					</div>
				</section>
			</Section>

			<Section
				className="border-border border-t border-b bg-background/50"
				id="switch-from-grid"
			>
				<div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{entries.map(([slug, data]) => (
							<CompetitorCard
								ctaLabel="View migration comparison"
								data={data}
								headline={`Switch from ${data.competitor.name}`}
								href={`/switch-from/${slug}`}
								key={slug}
							/>
						))}
					</div>

					<div className="mt-12 rounded border border-border bg-card/30 p-6 text-center backdrop-blur-sm sm:p-8">
						<h3 className="mb-2 font-semibold text-foreground text-lg">
							Start migrating today
						</h3>
						<p className="mb-5 text-pretty text-muted-foreground text-sm">
							Add the script, verify data, and turn off the old tool when you
							are ready.
						</p>
						<div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
							<SciFiButton asChild>
								<Link
									href="https://app.databuddy.cc/login"
									rel="noopener noreferrer"
									target="_blank"
								>
									Start Free — No Credit Card
								</Link>
							</SciFiButton>
							<Link
								className="group inline-flex items-center justify-center gap-2 rounded border border-border bg-foreground/5 px-5 py-2 font-medium text-foreground text-sm backdrop-blur-sm transition-colors hover:bg-foreground/10 active:scale-[0.98]"
								href="/demo"
							>
								View Live Demo
								<ArrowRightIcon
									className="size-3.5 transition-transform group-hover:translate-x-0.5"
									weight="fill"
								/>
							</Link>
						</div>
					</div>
				</div>
			</Section>
		</div>
	);
}
