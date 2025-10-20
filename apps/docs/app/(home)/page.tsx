import { Footer } from '@/components/footer';
import { Description } from '@/components/landing/description';
import FAQ from '@/components/landing/faq';
import { GridCards } from '@/components/landing/grid-cards';
import Hero from '@/components/landing/hero';
import Section from '@/components/landing/section';
import Testimonials from '@/components/landing/testimonials';
import { TrustedBy } from '@/components/landing/trusted-by';
import { StructuredData } from '@/components/structured-data';

// async function getGitHubStars() {
// 	try {
// 		const response = await fetch(
// 			"https://api.github.com/repos/databuddy-analytics",
// 			{
// 				headers: {
// 					Accept: "application/vnd.github.v3+json",
// 				},
// 				next: { revalidate: 3600 }, // Cache for 1 hour
// 			}
// 		);

// 		if (!response.ok) {
// 			throw new Error("Failed to fetch GitHub data");
// 		}

// 		const data = await response.json();
// 		return data.stargazers_count?.toLocaleString() || null;
// 	} catch (error) {
// 		console.error("Error fetching GitHub stars:", error);
// 		return null;
// 	}
// }

export default function HomePage() {
	// const stars = await getGitHubStars();

	return (
		<>
			<StructuredData
				page={{
					title:
						'Privacy-first web analytics (Google Analytics alternative) — 3 KB, GDPR-compliant | Databuddy',
					description:
						'Experience powerful, privacy-first analytics that matches Google Analytics feature-for-feature without compromising user data. Zero cookies required, 100% data ownership, and AI-powered insights to help your business grow while staying compliant.',
					url: 'https://www.databuddy.cc',
				}}
			/>
			<div className="overflow-hidden">
				{/* Hero Section */}
				<Section className="overflow-hidden" customPaddings id="hero">
					<Hero />
				</Section>

				<div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
					<div className="flex justify-center">
						<a
							className="text-muted-foreground text-sm underline underline-offset-4 transition-colors hover:text-foreground"
							href="https://chatgpt.com/?hints=search&prompt=Read+these+3+pages%3A%0A%0A-+https%3A%2F%2Fwww.databuddy.cc%0A-+https%3A%2F%2Fwww.databuddy.cc%2Fdocs%0A-+https%3A%2F%2Fwww.databuddy.cc%2Fpricing%0A%0AThen+explain+in+simple+terms+what+this+app+does%2C+and+why+i+should+care"
							rel="noopener noreferrer"
							target="_blank"
						>
							Don't understand what this does? Ask ChatGPT
						</a>
					</div>
				</div>

				{/* Trusted By Section */}
				<Section
					className="border-border border-t border-b bg-background/50"
					id="trust"
				>
					<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
						<TrustedBy />
					</div>
				</Section>

				{/* Grid Cards Section */}
				<Section className="border-border border-b py-16 lg:py-24" id="cards">
					<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
						<GridCards />
					</div>
				</Section>

				{/* Description and FAQ Section */}
				<Section
					className="border-border border-b bg-background/30"
					customPaddings
					id="desc-border"
				>
					<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
						{/* Description Section */}
						<Section className="pt-8 lg:pt-12" customPaddings id="description">
							<Description />
						</Section>

						{/* Divider */}
						<div className="mx-auto w-full">
							<div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
						</div>

						{/* FAQ Section */}
						<Section className="py-16 lg:py-20" customPaddings id="faq">
							<FAQ />
						</Section>
					</div>
				</Section>

				{/* Testimonials Section */}
				<Section
					className="bg-background/50 py-16 lg:py-24"
					customPaddings
					id="testimonial"
				>
					<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
						<Testimonials />
					</div>
				</Section>

				{/* Gradient Divider */}
				<div className="w-full">
					<div className="mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-border/30 to-transparent" />
				</div>

				{/* Footer Section */}
				<Footer />

				{/* Final Gradient Divider */}
				<div className="w-full">
					<div className="mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-border/30 to-transparent" />
				</div>
			</div>
		</>
	);
}
