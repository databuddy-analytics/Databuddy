import { Description } from '@/components/landing/description';
import FAQ from '@/components/landing/faq';
import { Footer } from '@/components/landing/footer';
import { FooterNav } from '@/components/landing/footer-nav';
import { GridCards } from '@/components/landing/grid-cards';
import Hero from '@/components/landing/hero';
import Section from '@/components/landing/section';
import Testimonials from '@/components/landing/testimonials';
import { TrustedBy } from '@/components/landing/trusted-by';

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
		<div className="min-h-screen overflow-x-hidden">
			{/* Hero Section */}
			<Section className="overflow-hidden" customPaddings id="hero">
				<Hero />
			</Section>

			{/* Trusted By Section */}
			<Section
				className="border-border border-t border-b bg-background/50"
				customPaddings
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
					<Section customPaddings id="description">
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

			{/* Footer Navigation Section */}
			<Section className="py-16 lg:py-20" customPaddings id="footer-nav">
				<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
					<FooterNav />
				</div>
			</Section>

			{/* Final Gradient Divider */}
			<div className="w-full">
				<div className="mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-border/30 to-transparent" />
			</div>

			{/* Footer Section */}
			<Section
				className="overflow-y-clip pt-2 xl:pt-4"
				customPaddings
				id="footer"
			>
				<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
					<Footer />
				</div>
			</Section>
		</div>
	);
}
