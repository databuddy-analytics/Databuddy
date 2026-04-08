"use client";

import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/ssr/ArrowSquareOut";
import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { FaviconImage } from "@/components/analytics/favicon-image";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatNumber } from "@/lib/formatters";
import { cn, formatDuration } from "@/lib/utils";

export interface SocialPlatformUrl {
	avgDurationSeconds: number;
	bouncedSessions: number;
	host: string;
	pageviews: number;
	referrerUrl: string;
	sessions: number;
}

export interface SocialPlatform {
	avgDurationSeconds: number;
	bouncedSessions: number;
	host: string;
	name: string;
	sessions: number;
	urls: SocialPlatformUrl[];
}

interface SocialPlatformRowProps {
	defaultOpen?: boolean;
	platform: SocialPlatform;
}

function bouncePercent(sessions: number, bounced: number): number {
	if (sessions === 0) {
		return 0;
	}
	return Math.round((bounced / sessions) * 100);
}

function displayPath(referrerUrl: string): string {
	try {
		const url = new URL(referrerUrl);
		const path = url.pathname + url.search;
		return path === "/" ? url.host : `${url.host}${path}`;
	} catch {
		return referrerUrl;
	}
}

export function SocialPlatformRow({
	platform,
	defaultOpen = false,
}: SocialPlatformRowProps) {
	const bounce = bouncePercent(platform.sessions, platform.bouncedSessions);

	return (
		<Collapsible className="border-b last:border-b-0" defaultOpen={defaultOpen}>
			<CollapsibleTrigger asChild>
				<button
					className="group flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
					type="button"
				>
					<FaviconImage
						className="shrink-0 rounded"
						domain={platform.host}
						size={32}
					/>
					<div className="min-w-0 flex-1">
						<div className="flex items-baseline justify-between gap-3">
							<span className="truncate font-medium text-foreground text-sm">
								{platform.name}
							</span>
							<div className="flex shrink-0 items-center gap-3 text-muted-foreground text-xs tabular-nums">
								<span>{formatNumber(platform.sessions)} sessions</span>
								<span>{formatDuration(platform.avgDurationSeconds)} avg</span>
								<span>{bounce}% bounce</span>
							</div>
						</div>
					</div>
					<CaretDownIcon
						aria-hidden
						className={cn(
							"size-4 shrink-0 text-muted-foreground transition-transform",
							"group-data-[state=open]:rotate-180"
						)}
					/>
				</button>
			</CollapsibleTrigger>

			<CollapsibleContent>
				<ul className="divide-y border-t bg-muted/20">
					{platform.urls.map((url) => {
						const urlBounce = bouncePercent(url.sessions, url.bouncedSessions);
						return (
							<li
								className="flex items-center gap-3 px-3 py-2 pl-14"
								key={url.referrerUrl}
							>
								<span
									className="min-w-0 flex-1 truncate font-mono text-foreground text-xs"
									title={url.referrerUrl}
								>
									{displayPath(url.referrerUrl)}
								</span>
								<div className="flex shrink-0 items-center gap-3 text-muted-foreground text-xs tabular-nums">
									<span>{formatNumber(url.sessions)}</span>
									<span>{formatDuration(url.avgDurationSeconds)}</span>
									<span>{urlBounce}%</span>
								</div>
								<a
									aria-label={`Open ${url.referrerUrl} in a new tab`}
									className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
									href={url.referrerUrl}
									rel="noopener noreferrer"
									target="_blank"
								>
									<ArrowSquareOutIcon aria-hidden className="size-3.5" />
								</a>
							</li>
						);
					})}
				</ul>
			</CollapsibleContent>
		</Collapsible>
	);
}
