import { ArrowRightIcon, CheckIcon } from "@databuddy/ui/icons";
import Link from "next/link";
import { CompetitorBrandAvatar } from "@/components/compare/competitor-brand-avatar";
import type { ComparisonData } from "@/lib/comparison-config";

export function CompetitorCard({
	data,
	href,
	headline,
	ctaLabel,
}: {
	data: ComparisonData;
	href?: string;
	headline?: string;
	ctaLabel?: string;
}) {
	const { competitor, features } = data;
	const cardHref = href ?? `/compare/${data.competitor.slug}`;
	const advantages = features.filter((f) => f.databuddy && !f.competitor);

	return (
		<Link
			className="group block rounded border border-border bg-card/50 p-6 backdrop-blur-sm transition-colors hover:border-border/80 hover:bg-card/70"
			href={cardHref}
		>
			<div className="mb-4 flex items-start justify-between">
				<div className="flex-1">
					<h3 className="mb-1 font-semibold text-foreground text-lg">
						{headline ?? `vs ${competitor.name}`}
					</h3>
					<p className="text-pretty text-muted-foreground text-sm">
						{competitor.tagline}
					</p>
				</div>
				<CompetitorBrandAvatar
					color={competitor.color}
					name={competitor.name}
					slug={competitor.slug}
				/>
			</div>

			<div className="mb-5 flex items-center justify-between border-border/50 border-b pb-4 text-sm">
				<div className="flex flex-col">
					<span className="text-muted-foreground text-xs">Their price</span>
					<span className="font-medium text-foreground">
						{competitor.pricing.starting}
					</span>
				</div>
				<div className="flex flex-col items-end">
					<span className="text-muted-foreground text-xs">Databuddy</span>
					<span className="font-semibold text-primary">Free</span>
				</div>
			</div>

			<div className="mb-5 space-y-2">
				{advantages.slice(0, 3).map((feature) => (
					<div className="flex items-center gap-2" key={feature.name}>
						<CheckIcon
							className="size-3.5 shrink-0 text-primary"
							weight="bold"
						/>
						<span className="text-muted-foreground text-xs">
							{feature.name}
						</span>
					</div>
				))}
				{advantages.length > 3 && (
					<span className="block text-primary/70 text-xs">
						+{advantages.length - 3} more advantages
					</span>
				)}
			</div>

			<div className="flex items-center justify-between rounded border border-border/50 bg-muted/20 px-4 py-2.5 font-medium text-foreground text-sm transition-colors group-hover:bg-muted/40">
				<span>{ctaLabel ?? "View comparison"}</span>
				<ArrowRightIcon
					className="size-3.5 transition-transform group-hover:translate-x-0.5"
					weight="fill"
				/>
			</div>
		</Link>
	);
}
