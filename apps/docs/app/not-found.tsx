import { HouseIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { SciFiButton } from "@/components/landing/scifi-btn";
import Section from "@/components/landing/section";
import { Navbar } from "@/components/navbar";
import { NotFoundGoBackButton } from "@/components/not-found-go-back-button";

async function getGithubStars(): Promise<number | null> {
	try {
		const response = await fetch(
			"https://api.github.com/repos/databuddy-analytics/databuddy",
			{
				headers: {
					Accept: "application/vnd.github+json",
				},
				next: { revalidate: 3600 },
			}
		);

		if (!response.ok) {
			return null;
		}

		const data = (await response.json()) as { stargazers_count?: number };
		return typeof data.stargazers_count === "number"
			? data.stargazers_count
			: null;
	} catch {
		return null;
	}
}

export default async function NotFound() {
	const stars = await getGithubStars();

	return (
		<div className="flex min-h-0 flex-1 flex-col bg-background">
			<Navbar stars={stars} />
			<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">

				<Section
					className="flex flex-1 flex-col"
					customPaddings
					id="not-found-hero"
				>
					<section className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
						<div className="text-center">
							<p className="mb-3 font-medium font-mono text-muted-foreground text-sm tabular-nums tracking-wide">
								404
							</p>
							<h1 className="mb-4 text-balance font-semibold text-3xl leading-tight tracking-tight sm:text-4xl md:text-5xl">
								Page <span className="text-muted-foreground">not found</span>
							</h1>
							<p className="mx-auto mb-10 max-w-xl text-balance text-muted-foreground text-sm leading-relaxed sm:text-base">
								The page you are looking for does not exist or may have been
								moved. Try going home or returning to the previous page.
							</p>

							<div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
								<NotFoundGoBackButton />
								<SciFiButton asChild>
									<Link
										className="inline-flex items-center justify-center gap-2"
										href="/"
									>
										<HouseIcon className="size-4" weight="duotone" />
										Go home
									</Link>
								</SciFiButton>
							</div>
						</div>
					</section>
				</Section>
			</div>
		</div>
	);
}
