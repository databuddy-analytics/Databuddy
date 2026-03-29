import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getStatusPageUrl } from "@/lib/app-url";
import { publicRPCClient } from "@/lib/orpc-public";
import { IncidentTimeline } from "./_components/incident-timeline";
import { LastUpdated } from "./_components/last-updated";
import { MonitorRow } from "./_components/monitor-row";
import { StatusBanner } from "./_components/status-banner";
import { TimeRangeSelector } from "./_components/time-range-selector";

export const revalidate = 60;

type StatusPageData = Awaited<
	ReturnType<typeof publicRPCClient.statusPage.getBySlug>
>;

interface StatusPageProps {
	params: Promise<{ slug: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const getStatusData = unstable_cache(
	async (slug: string, days: number): Promise<StatusPageData | null> =>
		publicRPCClient.statusPage.getBySlug({ slug, days }).catch(() => null),
	["status-page"],
	{ revalidate: 60, tags: ["status-page"] }
);

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

	const title = `${data.organization.name} Status`;
	const description = `Real-time system status for ${data.organization.name}`;
	const url = getStatusPageUrl(slug);

	return {
		title,
		description,
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
		name: `${data.organization.name} Status`,
		description: `Real-time system status for ${data.organization.name}`,
		url: getStatusPageUrl(slug),
		publisher: {
			"@type": "Organization",
			name: data.organization.name,
			...(data.organization.logo ? { logo: data.organization.logo } : {}),
		},
	};

	return (
		<>
			<script
				dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
				type="application/ld+json"
			/>
			<div className="space-y-6">
				<div className="flex items-center gap-3.5">
					<div>
						<h1 className="text-balance font-semibold text-2xl tracking-tight">
							{data.organization.name}
						</h1>
						<p className="mt-0.5 text-pretty text-muted-foreground text-sm">
							System status and uptime
						</p>
					</div>
				</div>

				<StatusBanner overallStatus={data.overallStatus} />

				<div className="flex items-center justify-between">
					<h2 className="font-semibold text-sm">Monitors</h2>
					<Suspense>
						<TimeRangeSelector currentDays={days} />
					</Suspense>
				</div>

				<div className="space-y-3">
					{data.monitors.map((monitor) => (
						<MonitorRow
							anchorId={slugify(monitor.name)}
							currentStatus={monitor.currentStatus}
							dailyData={monitor.dailyData}
							days={days}
							domain={monitor.domain}
							id={monitor.id}
							key={monitor.id}
							lastCheckedAt={monitor.lastCheckedAt}
							name={monitor.name}
							uptimePercentage={monitor.uptimePercentage}
						/>
					))}
				</div>

				<IncidentTimeline />

				<LastUpdated timestamp={latestTimestamp} />
			</div>
		</>
	);
}
