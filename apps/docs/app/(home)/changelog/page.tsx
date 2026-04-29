import { RocketLaunchIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Footer } from "@/components/footer";
import Section from "@/components/landing/section";

import { Prose } from "@/components/prose";
import { StructuredData } from "@/components/structured-data";
import type { NotraPost } from "@/lib/changelog-query";
import { getChangelogs } from "@/lib/changelog-query";
import {
	externalizeLinks,
	formatChangelogDate,
	splitChangelogContent,
} from "@/lib/changelog-utils";

export const revalidate = 3600;

export const metadata: Metadata = {
	title: "Changelog | Databuddy",
	description:
		"Stay up to date with the latest features, improvements, and fixes shipped to Databuddy.",
	alternates: {
		canonical: "https://www.databuddy.cc/changelog",
	},
	openGraph: {
		title: "Changelog | Databuddy",
		description:
			"Stay up to date with the latest features, improvements, and fixes shipped to Databuddy.",
		url: "https://www.databuddy.cc/changelog",
		images: ["/og-image.png"],
	},
	twitter: {
		card: "summary_large_image",
		title: "Changelog | Databuddy",
		description:
			"Stay up to date with the latest features, improvements, and fixes shipped to Databuddy.",
		images: ["/og-image.png"],
	},
};

function ChangelogEntry({
	post,
	isLast,
}: {
	post: NotraPost;
	isLast: boolean;
}) {
	const { description, body } = splitChangelogContent(
		externalizeLinks(post.content)
	);

	return (
		<div
			className={`flex flex-col gap-4 lg:flex-row lg:gap-0 ${
				isLast ? "" : "border-border/40 border-b border-dashed"
			}`}
		>
			<div className="w-full shrink-0 px-5 pt-6 sm:px-6 lg:w-[32%] lg:px-8">
				<div className="lg:sticky lg:top-20 lg:pb-6">
					<time className="mb-2 block font-mono text-[0.6875rem] text-muted-foreground/50 uppercase tracking-wider">
						{formatChangelogDate(post.createdAt)}
					</time>
					<h2 className="font-semibold text-base text-foreground leading-snug tracking-tight lg:text-lg">
						{post.title}
					</h2>
					{description && (
						<Prose
							className="prose-sm mt-3 prose-p:text-muted-foreground/60 prose-p:text-xs prose-p:leading-relaxed"
							html={description}
						/>
					)}
				</div>
			</div>

			<div className="w-full px-5 pb-8 sm:px-6 lg:w-[68%] lg:px-8 lg:py-6">
				{body ? (
					<Prose
						className="prose-sm prose-ul:my-1 prose-h2:mt-4 prose-h3:mt-3 prose-h2:mb-2 prose-h3:mb-1.5 prose-ul:space-y-0.5 prose-h3:border-border/40 prose-h3:border-b prose-h3:border-dashed prose-h3:pb-1 prose-h1:font-medium prose-h2:font-medium prose-h3:font-medium prose-h4:font-medium prose-h1:text-base prose-h2:text-sm prose-h3:text-xs prose-h4:text-xs prose-li:text-muted-foreground/70 prose-li:text-xs prose-p:text-muted-foreground/70 prose-p:text-xs prose-p:leading-relaxed prose-h1:tracking-tight prose-h2:tracking-tight sm:prose-h1:text-base sm:prose-h2:text-sm sm:prose-h3:text-xs"
						html={body}
					/>
				) : (
					<p className="text-muted-foreground/50 text-xs italic">
						No additional details.
					</p>
				)}
			</div>
		</div>
	);
}

export default async function ChangelogPage() {
	const result = await getChangelogs();
	const posts = "error" in result ? [] : result.posts;

	return (
		<div>
			<StructuredData
				page={{
					title: "Changelog | Databuddy",
					description:
						"Stay up to date with the latest features, improvements, and fixes shipped to Databuddy.",
					url: "https://www.databuddy.cc/changelog",
				}}
			/>
			<Section className="overflow-hidden" id="changelog-hero">
				<section className="relative w-full pt-16 pb-10 sm:pt-20 sm:pb-12 lg:pt-24 lg:pb-14">
					<div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
						<div className="mb-8 text-center lg:mb-10">
							<div className="mx-auto mb-3 inline-flex items-center gap-2 rounded border border-border bg-card/50 px-2.5 py-1 font-medium text-[0.6875rem] text-muted-foreground tracking-wide">
								<span
									aria-hidden="true"
									className="h-1.5 w-1.5 rounded bg-foreground/60"
								/>
								DATABUDDY
								<span className="text-foreground/40">•</span>
								CHANGELOG
							</div>
							<h1 className="mb-2 font-semibold text-3xl leading-tight tracking-tight sm:text-4xl md:text-5xl lg:text-5xl">
								What&apos;s new in Databuddy
							</h1>
							<p className="mx-auto max-w-2xl text-balance font-medium text-muted-foreground text-xs leading-relaxed tracking-tight sm:text-sm lg:text-base">
								All the latest features, improvements, and fixes shipped to
								Databuddy, straight from the team.
							</p>
						</div>
					</div>
				</section>
			</Section>

			<Section
				className="border-border border-t bg-background/50"
				id="changelog-entries"
			>
				<div className="relative mx-auto max-w-5xl pt-8 sm:pt-10">
					<div className="pointer-events-none absolute top-0 bottom-0 left-[32%] hidden border-border/40 border-l lg:block" />
					{posts.length > 0 ? (
						<div className="flex flex-col">
							{posts.map((post, i) => (
								<ChangelogEntry
									isLast={i === posts.length - 1}
									key={post.id}
									post={post}
								/>
							))}
						</div>
					) : (
						<div className="flex items-center justify-center px-5 py-20 sm:px-6 lg:px-8">
							<div className="text-center">
								<RocketLaunchIcon
									className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40"
									weight="duotone"
								/>
								<h3 className="mb-2 font-medium text-foreground text-lg tracking-tight">
									No releases yet
								</h3>
								<p className="max-w-xs text-muted-foreground/60 text-sm leading-relaxed">
									We&apos;re working hard on new features. Check back soon for
									the latest updates.
								</p>
							</div>
						</div>
					)}
				</div>
				<div className="py-6">
					<Link
						className="mx-auto flex w-fit items-center gap-2 rounded-full border border-border/40 bg-card/30 px-4 py-2 text-muted-foreground/50 transition-colors hover:border-border/60 hover:text-muted-foreground/70"
						href="https://www.usenotra.com"
						rel="noopener"
						target="_blank"
					>
						<span className="text-xs tracking-wide">Powered by</span>
						<Image
							alt=""
							aria-hidden
							className="shrink-0"
							height={16}
							src="/notra.svg"
							width={16}
						/>
						<span className="font-medium text-xs tracking-wide">Notra</span>
					</Link>
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
