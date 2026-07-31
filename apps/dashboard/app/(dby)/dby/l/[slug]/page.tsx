import { db } from "@databuddy/db";
import {
	type CachedLink,
	getCachedLink,
	ratelimit,
	setCachedLinkIfAbsent,
	setCachedLinkNotFoundIfAbsent,
} from "@databuddy/redis";
import { getTrustedClientIp } from "@databuddy/shared/utils/trusted-client-ip";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { APP_URL } from "@/lib/app-url";
import { getSafeHttpUrl, isPublicLinkSlug } from "@/lib/links-url";

const getLinkBySlug = cache(
	async (slug: string): Promise<CachedLink | null> => {
		if (!isPublicLinkSlug(slug)) {
			return null;
		}

		const cached = await getCachedLink(slug).catch(() => ({
			state: "miss" as const,
		}));
		if (cached.state === "hit") {
			return cached.link;
		}
		if (cached.state === "not_found" || cached.state === "pending") {
			// A pending cache lease represents an in-progress write. Do not read
			// through it: serving a stale link is worse than a short-lived 404 here.
			return null;
		}

		const requestHeaders = await headers();
		const clientIp = getTrustedClientIp(requestHeaders) ?? "unverified";
		const cacheMissLimit = await ratelimit(
			`link-proxy-cache-miss:${clientIp}`,
			60,
			60
		).catch(() => null);
		if (!cacheMissLimit?.success) {
			return null;
		}

		const dbLink = await db.query.links.findFirst({
			where: { slug, deletedAt: { isNull: true } },
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
				deepLinkApp: true,
			},
		});

		if (!dbLink) {
			await setCachedLinkNotFoundIfAbsent(slug).catch(() => undefined);
			return null;
		}

		const { expiresAt, ...rest } = dbLink;
		const link: CachedLink = {
			...rest,
			expiresAt: expiresAt?.toISOString() ?? null,
		};

		await setCachedLinkIfAbsent(slug, link).catch(() => undefined);
		return link;
	}
);

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
	const image =
		getSafeHttpUrl(link.ogImageUrl) ?? `${APP_URL}/dby/og?${ogParams}`;
	const video = getSafeHttpUrl(link.ogVideoUrl) ?? undefined;

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

	if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
		redirect(getSafeHttpUrl(link.expiredRedirectUrl) ?? "/dby/expired");
	}

	const targetUrl = getSafeHttpUrl(link.targetUrl);
	if (!targetUrl) {
		notFound();
	}
	redirect(targetUrl);
}
