import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import Section from "@/components/landing/section";
import { Spotlight } from "@/components/landing/spotlight";
import { StructuredData } from "@/components/structured-data";
import OssForm from "./oss-form";

export const metadata: Metadata = {
	title: "Databuddy for open source",
	description:
		"One year of Databuddy Pro, free, for maintainers of active open source projects.",
	alternates: {
		canonical: "https://www.databuddy.cc/oss",
	},
	openGraph: {
		title: "Databuddy for open source",
		description:
			"One year of Databuddy Pro, free, for maintainers of active open source projects.",
		url: "https://www.databuddy.cc/oss",
		images: ["/og-image.png"],
	},
};

export default function OssPage() {
	const title = "Databuddy for open source";
	const description =
		"One year of Databuddy Pro, free, for maintainers of active open source projects.";
	const url = "https://www.databuddy.cc/oss";

	return (
		<div className="overflow-hidden">
			<StructuredData page={{ title, description, url }} />
			<Spotlight transform="translateX(-60%) translateY(-50%)" />

			<Section className="overflow-hidden" customPaddings id="oss">
				<div className="mx-auto w-full max-w-xl px-4 pt-20 pb-16 sm:px-6 sm:pt-24 sm:pb-20">
					<div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/40 px-3 py-1 font-medium text-muted-foreground text-xs backdrop-blur-sm">
						<span className="size-1.5 rounded-full bg-primary" />
						Open source program
					</div>

					<h1 className="mb-4 text-balance font-semibold text-3xl leading-[1.1] tracking-tight sm:text-4xl">
						Databuddy for{" "}
						<span className="text-muted-foreground">open source</span>
					</h1>

					<p className="mb-2 text-pretty text-muted-foreground leading-relaxed">
						One year of Databuddy Pro, free, for maintainers of active open
						source projects.
					</p>
					<p className="text-pretty text-muted-foreground leading-relaxed">
						We run on open source. This is how we pay some of it back.
					</p>

					<div className="mt-6 mb-10 flex flex-wrap items-center gap-x-3 gap-y-2 text-muted-foreground text-xs">
						<span>Full Pro plan</span>
						<span
							aria-hidden="true"
							className="size-1 rounded-full bg-border"
						/>
						<span>1 year free</span>
						<span
							aria-hidden="true"
							className="size-1 rounded-full bg-border"
						/>
						<span>No credit card</span>
					</div>

					<OssForm />

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
