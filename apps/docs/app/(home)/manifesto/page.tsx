import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import Section from "@/components/landing/section";
import { StructuredData } from "@/components/structured-data";
import { ManifestoChapter } from "./manifesto-chapter";
import { manifestoSections } from "./manifesto-data";
import { ManifestoHero } from "./manifesto-hero";
import { ManifestoSignature } from "./manifesto-signature";

const title = "The Databuddy Manifesto | Databuddy";
const description =
	"Why we built Databuddy: analytics that respects users, connects context, and answers in plain language - without enterprise bloat or cookie theater.";
const url = "https://www.databuddy.cc/manifesto";

export const metadata: Metadata = {
	title,
	description,
	alternates: {
		canonical: url,
	},
	openGraph: {
		title,
		description,
		url,
		images: ["/og-image.png"],
	},
};

export default function ManifestoPage() {
	return (
		<div className="overflow-hidden">
			<StructuredData
				page={{
					title,
					description,
					url,
				}}
			/>

			<Section className="overflow-hidden" customPaddings id="manifesto-hero">
				<ManifestoHero />
			</Section>

			{manifestoSections.map((chapter) => (
				<ManifestoChapter chapter={chapter} key={chapter.id} />
			))}

			<section className="border-border border-t">
				<ManifestoSignature />
			</section>

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
