import { CheckIcon } from "@databuddy/ui/icons";
import type { PricingTier } from "@/lib/comparison-config";

export function PricingSection({
	tiers,
	competitorName,
}: {
	tiers: PricingTier[];
	competitorName: string;
}) {
	return (
		<div>
			<div className="mb-8 text-center">
				<h2 className="mb-2 font-semibold text-2xl sm:text-3xl">
					Pricing <span className="text-muted-foreground">comparison</span>
				</h2>
				<p className="text-muted-foreground text-sm sm:text-base">
					See the real cost of {competitorName} vs Databuddy
				</p>
			</div>

			<div className="overflow-hidden rounded border border-border bg-card/30 backdrop-blur-sm">
				<div className="hidden grid-cols-3 items-center gap-4 border-border border-b bg-muted/50 px-6 py-3.5 sm:grid">
					<span className="font-semibold text-foreground text-xs uppercase tracking-wide">
						Tier / Feature
					</span>
					<span className="text-center font-semibold text-muted-foreground text-xs uppercase tracking-wide">
						{competitorName}
					</span>
					<span className="text-center font-semibold text-primary text-xs uppercase tracking-wide">
						Databuddy
					</span>
				</div>

				{tiers.map((tier) => (
					<div
						className="border-border/50 border-b transition-colors last:border-b-0 hover:bg-muted/20"
						key={tier.pageviews}
					>
						<div className="hidden grid-cols-3 items-center gap-4 px-6 py-3.5 sm:grid">
							<span className="font-medium text-foreground text-sm">
								{tier.pageviews}
							</span>
							<span className="text-center text-muted-foreground text-sm">
								{tier.competitor}
							</span>
							<span className="text-center font-medium text-sm">
								{tier.databuddy === "Free" ||
								tier.databuddy === "Included" ||
								tier.databuddy === "Not needed" ? (
									<span className="inline-flex items-center gap-1 text-primary">
										<CheckIcon className="size-3.5" weight="bold" />
										{tier.databuddy}
									</span>
								) : (
									<span className="text-foreground">{tier.databuddy}</span>
								)}
							</span>
						</div>

						<div className="space-y-1.5 px-5 py-3 sm:hidden">
							<span className="block font-medium text-foreground text-sm">
								{tier.pageviews}
							</span>
							<div className="flex items-center justify-between text-xs">
								<span className="text-muted-foreground">
									{competitorName}: {tier.competitor}
								</span>
								<span className="font-medium text-primary">
									{tier.databuddy}
								</span>
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
