import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { serializeJsonLd } from "@databuddy/shared/json-ld";
import { ThemeProvider } from "next-themes";
import { DATABUDDY_UPTIME_URL, getStatusPageUrl } from "@/lib/status-url";
import { rpcClient } from "@/lib/orpc";
import { StatusNavbar } from "./_components/status-navbar";
import { Status } from "./_components/status-page";

export const revalidate = 60;

interface StatusPageProps {
	params: Promise<{ slug: string }>;
}

const DAYS = 90;

async function getStatusData(slug: string) {
	return rpcClient.statusPage.getBySlug({ slug, days: DAYS }).catch(() => null);
}

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
			index: true,
			follow: true,
			googleBot: {
				index: true,
				follow: true,
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
	const activeIncidentCount = data.incidents.filter(
		(incident) => incident.status !== "resolved"
	).length;

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

						<Status>
							<Status.Header
								activeIncidentCount={activeIncidentCount}
								description={page.description ?? undefined}
								status={data.overallStatus}
							/>

							<Status.IncidentList incidents={data.incidents} />

							<Status.MonitorList>
								{data.monitors.map((monitor) => (
									<Status.MonitorCard
										anchorId={slugify(monitor.name)}
										dailyData={monitor.dailyData}
										days={DAYS}
										domain={monitor.domain ?? undefined}
										id={monitor.id}
										key={monitor.id}
										name={monitor.name}
										uptimePercentage={monitor.uptimePercentage ?? undefined}
									/>
								))}
							</Status.MonitorList>

							<Status.Footer
								incidents={data.incidents}
								timestamp={latestTimestamp}
							/>
						</Status>
					</div>
				</main>

				<footer className="shrink-0 border-border/50 border-t bg-background">
					<div className="mx-auto flex max-w-[822px] items-center justify-center px-4 py-4 sm:px-6">
						<p className="text-[11px] text-muted-foreground/50 tracking-wide">
							Powered by{" "}
							<a
								className="text-muted-foreground/70 transition-colors hover:text-foreground"
								href="https://www.databuddy.cc"
								rel="noopener noreferrer dofollow"
								target="_blank"
							>
								Databuddy
							</a>
						</p>
					</div>
				</footer>
			</div>
		</ThemeProvider>
	);
}
