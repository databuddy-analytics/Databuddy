import { db } from "@databuddy/db";
import {
	type CachedLink,
	getCachedLink,
	setCachedLink,
	setCachedLinkNotFound,
} from "@databuddy/redis";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { APP_URL } from "@/lib/app-url";

async function getLinkBySlug(slug: string): Promise<CachedLink | null> {
	const cached = await getCachedLink(slug).catch(() => null);
	if (cached) {
		return cached;
	}

	const dbLink = await db.query.links.findFirst({
		where: (links, { and, eq, isNull }) =>
			and(eq(links.slug, slug), isNull(links.deletedAt)),
		columns: {
			id: true,
			targetUrl: true,
			expiresAt: true,
			expiredRedirectUrl: true,
			ogTitle: true,
			ogDescription: true,
			ogImageUrl: true,
			ogVideoUrl: true,
			iosUrl: true,
			androidUrl: true,
		},
	});

	if (!dbLink) {
		await setCachedLinkNotFound(slug).catch(() => {});
		return null;
	}

	const { expiresAt, ...rest } = dbLink;
	const link: CachedLink = {
		...rest,
		expiresAt: expiresAt?.toISOString() ?? null,
	};

	await setCachedLink(slug, link).catch(() => {});
	return link;
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>;
}): Promise<Metadata> {
	const { slug } = await params;
	const link = await getLinkBySlug(slug);

	if (!link) {
		return {
			title: "Link Not Found",
			robots: { index: false, follow: false },
		};
	}

	const title = link.ogTitle ?? "Shared via Databuddy";
	const description = link.ogDescription ?? undefined;
	const ogParams = new URLSearchParams({
		title,
		...(description && { description }),
	});
	const image = link.ogImageUrl ?? `${APP_URL}/dby/og?${ogParams}`;
	const video = link.ogVideoUrl ?? undefined;

	return {
		title,
		description,
		openGraph: {
			siteName: "Databuddy",
			type: "website",
			title,
			description,
			images: image
				? [{ url: image, width: 1200, height: 630, alt: title }]
				: undefined,
			videos: video ? [{ url: video }] : undefined,
		},
		twitter: {
			card: video ? "player" : "summary_large_image",
			title,
			description,
			images: image ? [image] : undefined,
		},
		robots: { index: false, follow: false },
	};
}

export default async function LinkProxyPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const link = await getLinkBySlug(slug);

	if (!link) {
		notFound();
	}

	redirect(link.targetUrl);
}
