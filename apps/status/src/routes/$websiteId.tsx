import { chQuery } from "@databuddy/db";
import { GlobeHemisphereWestIcon, PulseIcon } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StatusPill } from "@/components/uptime/status-pill";
import { UptimeBars } from "@/components/uptime/uptime-bars";
import { UptimeSparkline } from "@/components/uptime/uptime-sparkline";
import {
	formatMs,
	formatPercent,
	hostnameFromUrl,
	type LatestUptimeCheck,
	statusFromCheck,
	type UptimeSeriesPoint,
} from "@/lib/uptime";

dayjs.extend(relativeTime);

type WebsiteMeta = {
	name: string | null;
	domain: string | null;
};

async function getWebsiteMeta(websiteId: string): Promise<WebsiteMeta> {
	if (!process.env.DATABASE_URL) {
		return { name: null, domain: null };
	}

	try {
		const mod = await import("@databuddy/services/websites");
		const service = new mod.WebsiteService();
		const website = await service.getById(websiteId);
		return { name: website?.name ?? null, domain: website?.domain ?? null };
	} catch (error) {
		console.error("status: failed to load website meta", {
			websiteId,
			error: String(error),
		});
		return { name: null, domain: null };
	}
}

export const Route = createFileRoute("/$websiteId")({
	loader: async ({ params }) => {
		const { websiteId } = params;

		const endDate = dayjs().format("YYYY-MM-DD");
		const startDate = dayjs().subtract(30, "day").format("YYYY-MM-DD");
		const start90 = dayjs().subtract(90, "day").format("YYYY-MM-DD");

		const seriesSql = `
			SELECT 
				toStartOfHour(timestamp) as date,
				if((countIf(status = 1) + countIf(status = 0)) = 0, 0, round((countIf(status = 1) / (countIf(status = 1) + countIf(status = 0))) * 100, 2)) as uptime_percentage
			FROM uptime.uptime_monitor
			WHERE 
				site_id = {websiteId:String}
				AND timestamp >= toDateTime({startDate:String})
				AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
			GROUP BY date
			ORDER BY date ASC
		`;

		const latestSql = `
			SELECT
				timestamp,
				status,
				http_code,
				ttfb_ms,
				total_ms,
				url,
				error,
				ssl_valid,
				ssl_expiry
			FROM uptime.uptime_monitor
			WHERE site_id = {websiteId:String}
			ORDER BY timestamp DESC
			LIMIT 1
		`;

		const dailySql = `
			SELECT
				toDate(timestamp) as date,
				if((countIf(status = 1) + countIf(status = 0)) = 0, 0, round((countIf(status = 1) / (countIf(status = 1) + countIf(status = 0))) * 100, 2)) as uptime_percentage
			FROM uptime.uptime_monitor
			WHERE
				site_id = {websiteId:String}
				AND timestamp >= toDateTime({start90:String})
				AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
			GROUP BY date
			ORDER BY date ASC
		`;

		const [timeSeries, latestCheckRows, dailySeries, website] =
			await Promise.all([
				chQuery<UptimeSeriesPoint>(seriesSql, {
					websiteId,
					startDate,
					endDate,
				}),
				chQuery<LatestUptimeCheck>(latestSql, { websiteId }),
				chQuery<{ date: string; uptime_percentage: number }>(dailySql, {
					websiteId,
					start90,
					endDate,
				}),
				getWebsiteMeta(websiteId),
			]);

		const latestCheck = latestCheckRows[0] ?? null;
		const domainFromUrl = hostnameFromUrl(latestCheck?.url);
		const domain = website.domain ?? domainFromUrl;

		return {
			websiteId,
			website: {
				name: website.name,
				domain,
				url: latestCheck?.url ?? null,
			},
			timeSeries,
			dailySeries,
			latestCheck,
		};
	},
	component: WebsiteStatusPage,
});

function WebsiteStatusPage() {
	const { websiteId, website, timeSeries, dailySeries, latestCheck } =
		Route.useLoaderData();

	if (!latestCheck) {
		return (
			<main className="mx-auto w-full max-w-5xl px-4 py-10">
				<div className="flex flex-col gap-2">
					<div className="flex items-center gap-3">
						<div className="grid size-10 place-items-center border bg-card">
							<PulseIcon size={18} weight="duotone" />
						</div>
						<div className="min-w-0">
							<h1 className="truncate text-balance font-semibold text-2xl">
								{website.name ?? website.domain ?? websiteId}
							</h1>
							<div className="text-muted-foreground text-sm">
								No uptime checks yet.
							</div>
						</div>
					</div>
				</div>
			</main>
		);
	}

	const currentStatus = statusFromCheck(latestCheck.status);
	const lastChecked = dayjs(latestCheck.timestamp);

	const uptime30 =
		timeSeries.length > 0
			? (timeSeries.at(-1)?.uptime_percentage ?? null)
			: null;

	return (
		<main className="mx-auto w-full max-w-5xl px-4 py-10">
			<header className="flex flex-col gap-6">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex min-w-0 items-start gap-3">
						<div className="grid size-10 shrink-0 place-items-center border bg-card">
							<GlobeHemisphereWestIcon size={18} weight="duotone" />
						</div>
						<div className="min-w-0">
							<div className="flex flex-wrap items-center gap-2">
								<h1 className="truncate text-balance font-semibold text-2xl">
									{website.name ?? website.domain ?? websiteId}
								</h1>
								<StatusPill status={currentStatus} />
							</div>
							<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-sm">
								{website.domain ? (
									<span className="font-medium text-foreground">
										{website.domain}
									</span>
								) : null}
								<span aria-hidden="true">•</span>
								<span>Last checked {lastChecked.fromNow()}</span>
								{latestCheck.http_code ? (
									<>
										<span aria-hidden="true">•</span>
										<span>HTTP {latestCheck.http_code}</span>
									</>
								) : null}
							</div>
						</div>
					</div>

					{website.url ? (
						<div className="flex items-center gap-2">
							<a
								className="inline-flex items-center gap-1 border bg-card px-2 py-1 text-muted-foreground text-xs hover:text-foreground"
								href={website.url}
								rel="noopener"
								target="_blank"
							>
								<GlobeHemisphereWestIcon size={14} weight="duotone" />
								<span className="max-w-88 truncate text-balance">
									{website.url}
								</span>
							</a>
						</div>
					) : null}
				</div>

				<Separator />
			</header>

			<section className="mt-6 grid gap-4 md:grid-cols-12">
				<Card className="md:col-span-7">
					<CardHeader className="border-b">
						<CardTitle>Uptime</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid gap-3 sm:grid-cols-3">
							<div className="border p-3">
								<div className="text-muted-foreground text-xs">
									Last 30 days
								</div>
								<div className="mt-1 font-semibold text-lg tabular-nums">
									{formatPercent(uptime30)}
								</div>
							</div>
							<div className="border p-3">
								<div className="text-muted-foreground text-xs">Response</div>
								<div className="mt-1 font-semibold text-lg tabular-nums">
									{formatMs(latestCheck.total_ms)}
								</div>
							</div>
							<div className="border p-3">
								<div className="text-muted-foreground text-xs">TTFB</div>
								<div className="mt-1 font-semibold text-lg tabular-nums">
									{formatMs(latestCheck.ttfb_ms)}
								</div>
							</div>
						</div>

						<div className="border p-3">
							<div className="mb-2 flex items-baseline justify-between gap-3">
								<div className="font-medium text-sm">Trend</div>
								<div className="text-muted-foreground text-xs">Hourly</div>
							</div>
							<UptimeSparkline
								points={timeSeries.map((p) => ({ value: p.uptime_percentage }))}
							/>
						</div>

						<UptimeBars days={dailySeries} />
					</CardContent>
				</Card>

				<Card className="md:col-span-5">
					<CardHeader className="border-b">
						<CardTitle>Latest check</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="grid gap-2 text-sm">
							<div className="flex items-center justify-between gap-4">
								<span className="text-muted-foreground">Status</span>
								<span className="font-medium tabular-nums">
									{currentStatus}
								</span>
							</div>
							<div className="flex items-center justify-between gap-4">
								<span className="text-muted-foreground">Checked</span>
								<span className="font-medium tabular-nums">
									{lastChecked.format("YYYY-MM-DD HH:mm")}
								</span>
							</div>
							<div className="flex items-center justify-between gap-4">
								<span className="text-muted-foreground">HTTP</span>
								<span className="font-medium tabular-nums">
									{latestCheck.http_code || "—"}
								</span>
							</div>
							<div className="flex items-center justify-between gap-4">
								<span className="text-muted-foreground">Response</span>
								<span className="font-medium tabular-nums">
									{formatMs(latestCheck.total_ms)}
								</span>
							</div>
							{latestCheck.error ? (
								<div className="border bg-muted p-3 text-sm">
									<div className="text-muted-foreground text-xs">Error</div>
									<div className="wrap-break-word mt-1 font-medium">
										{latestCheck.error}
									</div>
								</div>
							) : null}
						</div>
					</CardContent>
				</Card>
			</section>
		</main>
	);
}
