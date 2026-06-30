import Link from "next/link";
import { CompetitorBrandAvatar } from "@/components/compare/competitor-brand-avatar";
import { SciFiButton } from "@/components/landing/scifi-btn";
import { Badge } from "@/components/ui/badge";
import type { CompetitorInfo } from "@/lib/comparison-config";

export function StatsCards({
	competitor,
	featuresWin,
	totalFeatures,
}: {
	competitor: CompetitorInfo;
	featuresWin: number;
	totalFeatures: number;
}) {
	return (
		<div className="grid gap-4 sm:grid-cols-2">
			<div className="rounded border border-border bg-card/50 p-5 backdrop-blur-sm">
				<div className="mb-4 flex items-center justify-between">
					<div>
						<h3 className="font-semibold text-lg text-primary">Databuddy</h3>
						<p className="text-muted-foreground text-xs">
							Privacy-first analytics with AI insights
						</p>
					</div>
					<Badge className="bg-primary text-primary-foreground">
						Recommended
					</Badge>
				</div>

				<div className="mb-5 space-y-2 text-sm">
					<div className="flex items-center justify-between">
						<span className="text-muted-foreground">Starting price</span>
						<span className="font-semibold text-primary">Free</span>
					</div>
					<div className="flex items-center justify-between">
						<span className="text-muted-foreground">Free tier</span>
						<span className="font-medium">10K pageviews</span>
					</div>
					<div className="flex items-center justify-between">
						<span className="text-muted-foreground">Advantages</span>
						<Badge
							className="border-accent bg-accent/50 text-primary"
							variant="outline"
						>
							{featuresWin}/{totalFeatures}
						</Badge>
					</div>
				</div>

				<SciFiButton asChild className="w-full">
					<Link
						href="https://app.databuddy.cc/register"
						rel="noopener noreferrer"
						target="_blank"
					>
						Start Free - No Credit Card
					</Link>
				</SciFiButton>
			</div>

			<div className="rounded border border-border bg-card/50 p-5 backdrop-blur-sm">
				<div className="mb-4 flex items-center justify-between">
					<div>
						<h3 className="font-semibold text-foreground text-lg">
							{competitor.name}
						</h3>
						<p className="text-muted-foreground text-xs">
							{competitor.tagline}
						</p>
					</div>
					<CompetitorBrandAvatar
						color={competitor.color}
						name={competitor.name}
						slug={competitor.slug}
					/>
				</div>

				<div className="space-y-2 text-sm">
					<div className="flex items-center justify-between">
						<span className="text-muted-foreground">Starting price</span>
						<span className="font-semibold text-foreground">
							{competitor.pricing.starting}
						</span>
					</div>
					{competitor.pricing.note && (
						<p className="text-muted-foreground text-xs">
							{competitor.pricing.note}
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
