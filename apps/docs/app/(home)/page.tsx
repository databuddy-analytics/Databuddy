import { Description } from "@/components/landing/description";
import FAQ from "@/components/landing/faq";
import { Footer } from "@/components/landing/footer";
import { FooterNav } from "@/components/landing/footer-nav";
import { GridCards } from "@/components/landing/grid-cards";
import Hero from "@/components/landing/hero";
import Section from "@/components/landing/section";
import Testimonials from "@/components/landing/testimonials";
import { TrustedBy } from "@/components/landing/trusted-by";

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
      <Section id="hero" className="overflow-hidden" customPaddings>
        <Hero />
      </Section>

      {/* Trusted By Section */}
      <Section
        id="trust"
        customPaddings
        className="border-t border-b dark:border-border border-stone-200 bg-background/50"
      >
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <TrustedBy />
        </div>
      </Section>

      {/* Grid Cards Section */}
      <Section
        id="cards"
        className="border-b dark:border-border border-stone-200 py-16 lg:py-24"
      >
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <GridCards />
        </div>
      </Section>

      {/* Description and FAQ Section */}
      <Section
        id="desc-border"
        customPaddings
        className="border-b dark:border-border border-stone-200 bg-background/30"
      >
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Description Section */}
          <Section customPaddings id="description">
            <Description />
          </Section>

          {/* Divider */}
          <div className="w-full mx-auto">
            <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent"></div>
          </div>

          {/* FAQ Section */}
          <Section id="faq" className="py-16 lg:py-20" customPaddings>
            <FAQ />
          </Section>
        </div>
      </Section>

      {/* Testimonials Section */}
      <Section
        id="testimonial"
        customPaddings
        className="py-16 lg:py-24 bg-background/50"
      >
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Testimonials />
        </div>
      </Section>

      {/* Gradient Divider */}
      <div className="w-full">
        <div className="h-px bg-gradient-to-r from-transparent via-neutral-500/30 to-transparent max-w-6xl mx-auto"></div>
      </div>

      {/* Footer Navigation Section */}
      <Section id="footer-nav" className="py-16 lg:py-20" customPaddings>
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FooterNav />
        </div>
      </Section>

      {/* Final Gradient Divider */}
      <div className="w-full">
        <div className="h-px bg-gradient-to-r from-transparent via-neutral-500/30 to-transparent max-w-6xl mx-auto"></div>
      </div>

      {/* Footer Section */}
      <Section
        id="footer"
        customPaddings
        className="overflow-y-clip pt-2 xl:pt-4"
      >
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Footer />
        </div>
      </Section>
    </div>
  );
}
