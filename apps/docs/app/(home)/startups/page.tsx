import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import Section from "@/components/landing/section";
import { StructuredData } from "@/components/structured-data";
import StartupsForm from "./startups-form";

export const metadata: Metadata = {
	title: "Databuddy for startups",
	description:
		"30% off any Databuddy plan for a full year, for early-stage startups.",
	alternates: {
		canonical: "https://www.databuddy.cc/startups",
	},
	openGraph: {
		title: "Databuddy for startups",
		description:
			"30% off any Databuddy plan for a full year, for early-stage startups.",
		url: "https://www.databuddy.cc/startups",
		images: ["/og-image.png"],
	},
};

export default function StartupsPage() {
	const title = "Databuddy for startups";
	const description =
		"30% off any Databuddy plan for a full year, for early-stage startups.";
	const url = "https://www.databuddy.cc/startups";

	return (
		<div className="overflow-hidden">
			<StructuredData page={{ title, description, url }} />

			<Section className="overflow-hidden" id="startups">
				<div className="mx-auto w-full max-w-xl px-4 pt-20 pb-16 sm:px-6 sm:pt-24 sm:pb-20">
					<div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/40 px-3 py-1 font-medium text-muted-foreground text-xs backdrop-blur-sm">
						<span className="size-1.5 rounded-full bg-primary" />
						Startup program
					</div>

					<h1 className="mb-4 text-balance font-semibold text-3xl leading-[1.1] tracking-tight sm:text-4xl">
						Databuddy for{" "}
						<span className="text-muted-foreground">startups</span>
					</h1>

					<p className="mb-2 text-pretty text-muted-foreground leading-relaxed">
						30% off any Databuddy plan for a full year.
					</p>
					<p className="text-pretty text-muted-foreground leading-relaxed">
						For teams founded in the last 5 years that have raised less than
						$5M.
					</p>

					<div className="mt-6 mb-10 flex flex-wrap items-center gap-x-3 gap-y-2 text-muted-foreground text-xs">
						<span>Any plan</span>
						<span
							aria-hidden="true"
							className="size-1 rounded-full bg-border"
						/>
						<span>30% off</span>
						<span
							aria-hidden="true"
							className="size-1 rounded-full bg-border"
						/>
						<span>12 months</span>
					</div>

					<StartupsForm />

					<p className="mt-4 text-muted-foreground text-xs">
						We review applications within a few days.
					</p>
				</div>
			</Section>

			<div className="w-full">
				<div className="mx-auto h-px max-w-6xl bg-linear-to-r from-transparent via-border/30 to-transparent" />
			</div>

			<Footer />

			<div className="w-full">
				<div className="mx-auto h-px max-w-6xl bg-linear-to-r from-transparent via-border/30 to-transparent" />
			</div>
		</div>
	);
}
