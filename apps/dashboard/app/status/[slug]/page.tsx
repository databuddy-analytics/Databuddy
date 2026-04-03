import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { Suspense } from "react";
import { getStatusPageUrl } from "@/lib/app-url";
import { publicRPCClient } from "@/lib/orpc-public";
import { LastUpdated } from "./_components/last-updated";
import { StatusNavbar } from "./_components/status-navbar";
import { Status } from "./_components/status-page";
import { TimeRangeSelector } from "./_components/time-range-selector";

export const revalidate = 60;

interface StatusPageProps {
	params: Promise<{ slug: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function getStatusData(slug: string, days: number) {
	return unstable_cache(
		async () =>
			publicRPCClient.statusPage.getBySlug({ slug, days }).catch(() => null),
		["status-page", slug, String(days)],
		{
			revalidate: 60,
			tags: ["status-page", `status-page-${slug}`],
		}
	)();
}

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

function parseDays(raw: string | string[] | undefined): number {
	const n = Number(typeof raw === "string" ? raw : "90");
	if (n === 7 || n === 30) {
		return n;
	}
	return 90;
}

export async function generateMetadata({
	params,
}: StatusPageProps): Promise<Metadata> {
	const { slug } = await params;
	const data = await getStatusData(slug, 90);

	if (!data) {
		return {
			title: "Status Page",
			description: "System status and uptime monitoring",
		};
	}

	const title = `${data.statusPage.name || data.organization.name} Status`;
	const description =
		data.statusPage.description ||
		`Real-time system status for ${data.organization.name}`;
	const url = getStatusPageUrl(slug);
	const faviconUrl = data.statusPage.faviconUrl;

	return {
		title,
		description,
		...(faviconUrl
			? {
					icons: {
						icon: faviconUrl,
						shortcut: faviconUrl,
					},
				}
			: {}),
		alternates: {
			canonical: `/status/${slug}`,
		},
		openGraph: {
			title,
			description,
			url,
			type: "website",
			siteName: data.organization.name,
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
		},
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

export default async function StatusPage({
	params,
	searchParams,
}: StatusPageProps) {
	const { slug } = await params;
	const sp = await searchParams;
	const days = parseDays(sp.days);
	const data = await getStatusData(slug, days);

	if (!data) {
		notFound();
	}

	const { statusPage: page } = data;
	const theme = resolveTheme(page.theme);
	const forcedTheme = theme === "system" ? undefined : theme;

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
					<div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
						<script
							dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
							type="application/ld+json"
						/>

						{page.customCss ? (
							<style
								dangerouslySetInnerHTML={{
									__html: page.customCss.replaceAll(/<\/style/gi, "<\\/style"),
								}}
							/>
						) : null}

						<Status>
							<Status.Header
								description={page.description ?? undefined}
								logoUrl={page.logoUrl}
								name={page.name}
								websiteUrl={page.websiteUrl}
							/>
							<Status.Banner status={data.overallStatus} />

							<Status.Section
								action={
									<Suspense>
										<TimeRangeSelector currentDays={days} />
									</Suspense>
								}
								title="Monitors"
							>
								{data.monitors.map((monitor) => (
									<Status.MonitorCard
										anchorId={slugify(monitor.name)}
										currentStatus={monitor.currentStatus}
										dailyData={monitor.dailyData}
										days={days}
										domain={monitor.domain ?? undefined}
										id={monitor.id}
										key={monitor.id}
										lastCheckedAt={monitor.lastCheckedAt}
										name={monitor.name}
										uptimePercentage={monitor.uptimePercentage ?? undefined}
									/>
								))}
							</Status.Section>

							<Status.Incidents />
							<LastUpdated timestamp={latestTimestamp} />
						</Status>
					</div>
				</main>

				{page.hideBranding ? null : (
					<footer className="shrink-0 border-t bg-background">
						<div className="mx-auto flex max-w-2xl items-center justify-center px-4 py-3 sm:px-6">
							<p className="text-muted-foreground/60 text-xs">
								Powered by{" "}
								<a
									className="text-muted-foreground transition-colors hover:text-foreground"
									href="https://www.databuddy.cc"
									rel="noopener noreferrer dofollow"
									target="_blank"
								>
									Databuddy
								</a>
							</p>
						</div>
					</footer>
				)}
			</div>
		</ThemeProvider>
	);
}
