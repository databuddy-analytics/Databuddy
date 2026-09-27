import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ORPCError } from "@orpc/client";
import { serializeJsonLd } from "@databuddy/shared/json-ld";
import { ThemeProvider } from "next-themes";
import { DATABUDDY_UPTIME_URL, getStatusPageUrl } from "@/lib/status-url";
import { rpcClient } from "@/lib/orpc";
import { Branding } from "../_components/branding";
import { StatusNavbar } from "./_components/status-navbar";
import { MonitorCardInteractive } from "./_components/monitor-card-interactive";
import {
	ActiveIncidents,
	PastIncidents,
	StatusHeader,
} from "./_components/status-page";

export const revalidate = 60;

interface StatusPageProps {
	params: Promise<{ slug: string }>;
}

const DAYS = 90;

const getStatusData = cache((slug: string) =>
	rpcClient.statusPage.getBySlug({ slug }).catch((error: unknown) => {
		if (error instanceof ORPCError && error.code === "NOT_FOUND") {
			return null;
		}
		throw error;
	})
);

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

export async function generateMetadata({
	params,
}: StatusPageProps): Promise<Metadata> {
	const { slug } = await params;
	const data = await getStatusData(slug);

	if (!data) {
		return {
			title: "Status page not found",
			description: "This public status page could not be found.",
			robots: { index: false, follow: false },
		};
	}

	const displayName = data.statusPage.name || data.organization.name;
	const title = `${displayName} Status`;
	const description =
		data.statusPage.description ||
		`Live uptime, incident history, and service health for ${data.organization.name}.`;
	const url = getStatusPageUrl(slug);
	const faviconUrl = data.statusPage.faviconUrl;
	const isIndexable = data.monitors.length > 0;

	return {
		title,
		description,
		...(faviconUrl
			? { icons: { icon: faviconUrl, shortcut: faviconUrl } }
			: {}),
		authors: [
			{
				name: data.organization.name,
				url: data.statusPage.websiteUrl ?? url,
			},
		],
		keywords: [
			displayName,
			data.organization.name,
			"status",
			"uptime",
			"incidents",
			"service health",
		],
		alternates: { canonical: url },
		openGraph: {
			title,
			description,
			url,
			type: "website",
			locale: "en_US",
			siteName: data.organization.name,
		},
		robots: {
			index: isIndexable,
			follow: isIndexable,
			googleBot: {
				index: isIndexable,
				follow: isIndexable,
				"max-image-preview": "large",
				"max-snippet": -1,
				"max-video-preview": -1,
			},
		},
		twitter: { card: "summary_large_image", title, description },
	};
}

function resolveTheme(
	theme: string | null | undefined
): "system" | "light" | "dark" {
	if (theme === "light" || theme === "dark") {
		return theme;
	}
	return "system";
}

export default async function StatusPage({ params }: StatusPageProps) {
	const { slug } = await params;
	const data = await getStatusData(slug);

	if (!data) {
		notFound();
	}

	const { statusPage: page } = data;
	const theme = resolveTheme(page.theme);
	const forcedTheme = theme === "system" ? undefined : theme;
	const activeIncidents = data.incidents.filter(
		(incident) => incident.status !== "resolved"
	);

	const latestTimestamp = data.monitors.reduce<string | null>(
		(latest, monitor) => {
			if (!monitor.lastCheckedAt) {
				return latest;
			}
			if (!latest || monitor.lastCheckedAt > latest) {
				return monitor.lastCheckedAt;
			}
			return latest;
		},
		null
	);

	const jsonLd = {
		"@context": "https://schema.org",
		"@type": "WebPage",
		name: `${page.name || data.organization.name} Status`,
		description:
			page.description ||
			`Real-time system status for ${data.organization.name}`,
		url: getStatusPageUrl(slug),
		isPartOf: {
			"@type": "WebSite",
			name: "Databuddy Status",
			url: DATABUDDY_UPTIME_URL,
		},
		...(latestTimestamp ? { dateModified: latestTimestamp } : {}),
		publisher: {
			"@type": "Organization",
			name: data.organization.name,
			...(data.organization.logo ? { logo: data.organization.logo } : {}),
		},
	};

	return (
		<ThemeProvider
			attribute="class"
			defaultTheme={theme}
			enableSystem={theme === "system"}
			forcedTheme={forcedTheme}
		>
			<div className="flex h-dvh flex-col overflow-hidden bg-background">
				<StatusNavbar
					logoUrl={page.logoUrl}
					name={page.name}
					supportUrl={page.supportUrl}
					websiteUrl={page.websiteUrl}
				/>

				<main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
					<div className="mx-auto max-w-[822px] px-4 py-8 sm:px-6">
						<script
							dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
							type="application/ld+json"
						/>

						<div className="space-y-12" data-slot="status-page">
							<StatusHeader
								activeIncidentCount={activeIncidents.length}
								description={page.description}
								status={data.overallStatus}
								updatedAt={latestTimestamp}
							/>

							<ActiveIncidents incidents={activeIncidents} />

							<div className="flex flex-col gap-5" data-slot="status-monitors">
								{data.monitors.map((monitor) => (
									<MonitorCardInteractive
										anchorId={slugify(monitor.name)}
										days={DAYS}
										key={monitor.id}
										monitor={monitor}
									/>
								))}
							</div>

							<PastIncidents
								incidents={data.incidents.filter(
									(incident) => incident.status === "resolved"
								)}
							/>
						</div>
					</div>
				</main>

				<footer className="shrink-0 border-border/50 border-t bg-background">
					<div className="mx-auto flex max-w-[822px] items-center justify-center px-4 py-6 sm:px-6">
						<a
							className="flex items-center gap-2 text-muted-foreground text-sm transition-opacity duration-(--duration-quick) ease-(--ease-smooth) hover:opacity-70"
							href="https://www.databuddy.cc"
							rel="noopener noreferrer dofollow"
							target="_blank"
						>
							Powered by
							<Branding heightPx={16} variant="wordmark" />
						</a>
					</div>
				</footer>
			</div>
		</ThemeProvider>
	);
}
