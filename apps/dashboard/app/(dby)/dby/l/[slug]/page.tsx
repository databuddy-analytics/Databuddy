import { db } from "@databuddy/db";
import {
	type CachedLink,
	getCachedLink,
	setCachedLink,
	setCachedLinkNotFound,
} from "@databuddy/redis";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

const OG_IMAGE_BASE = "https://app.databuddy.cc/dby/og";

function generateOgImageUrl(title: string, description?: string): string {
	const params = new URLSearchParams({ title });
	if (description) {
		params.set("description", description);
	}
	return `${OG_IMAGE_BASE}?${params.toString()}`;
}

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

	const link: CachedLink = {
		id: dbLink.id,
		targetUrl: dbLink.targetUrl,
		expiresAt: dbLink.expiresAt?.toISOString() ?? null,
		expiredRedirectUrl: dbLink.expiredRedirectUrl,
		ogTitle: dbLink.ogTitle,
		ogDescription: dbLink.ogDescription,
		ogImageUrl: dbLink.ogImageUrl,
		ogVideoUrl: dbLink.ogVideoUrl,
		iosUrl: dbLink.iosUrl,
		androidUrl: dbLink.androidUrl,
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
	const image = link.ogImageUrl ?? generateOgImageUrl(title, description);
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
