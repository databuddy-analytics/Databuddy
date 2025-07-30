import { Description } from "@/components/landing/description";
import FAQ from "@/components/landing/faq";
import { GridCards } from "@/components/landing/grid-cards";
import Hero from "@/components/landing/hero";
import Section from "@/components/landing/section";
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
    <div className="h-full overflow-hidden">
      <Section id="hero" className="overflow-y-clip" customPaddings>
        <Hero />
      </Section>
      <Section
        id="trust"
        customPaddings
        className="border-t border-b dark:border-border border-stone-200 overflow-y-clip"
      >
        <TrustedBy />
      </Section>
      <Section
        id="cards"
        className="border-b dark:border-border border-stone-200 overflow-y-clip"
      >
        <GridCards />
      </Section>

      <Section
        id="desc-border"
        customPaddings
        className="overflow-x-clip overflow-hidden"
      >
        <div className="mx-5 lg:mx-16 xl:mx-16">
          <Section customPaddings id="description" className="overflow-y-clip">
            <Description />
          </Section>

          <div className="h-px bg-border mx-14"></div>

          <Section id="faq" className="overflow-y-clip" customPaddings>
            <FAQ />
          </Section>

          <div className="h-px bg-border mx-14"></div>
        </div>
      </Section>
    </div>
  );
}
