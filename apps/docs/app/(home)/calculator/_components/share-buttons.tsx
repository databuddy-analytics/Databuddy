"use client";

import { SiReddit, SiX } from "@icons-pack/react-simple-icons";
import { SciFiButton } from "@/components/landing/scifi-btn";
import {
	calculateCookieBannerCost,
	formatCurrencyFull,
	type CalculatorInputs,
} from "./calculator-engine";

const CALCULATOR_BASE = "https://www.databuddy.cc/calculator";

export function ShareButtons({ inputs }: { inputs: CalculatorInputs }) {
	const { lostRevenueYearly } = calculateCookieBannerCost(inputs);
	const shareUrl = `${CALCULATOR_BASE}?${new URLSearchParams({
		visitors: String(inputs.monthlyVisitors),
		unmeasured: String(inputs.visitorDataLossRate),
		conversion: String(inputs.visitorToPaidRate),
		value: String(inputs.revenuePerConversion),
	})}`;

	const text = `Estimated unattributed revenue: ${formatCurrencyFull(lostRevenueYearly)}/year. Explore the assumptions:`;
	const twitterUrl = `https://x.com/intent/tweet?${new URLSearchParams({ text, url: shareUrl })}`;
	const redditUrl = `https://www.reddit.com/submit?${new URLSearchParams({ title: text, url: shareUrl })}`;

	return (
		<div className="space-y-3">
			<p className="text-muted-foreground text-xs">
				Share these assumptions and results
			</p>
			<div className="flex flex-wrap gap-2">
				<SciFiButton asChild>
					<a href={twitterUrl} rel="noopener noreferrer" target="_blank">
						<SiX className="size-3.5" />
						<span>Share on X</span>
					</a>
				</SciFiButton>
				<SciFiButton asChild>
					<a href={redditUrl} rel="noopener noreferrer" target="_blank">
						<SiReddit className="size-3.5" />
						<span>Share on Reddit</span>
					</a>
				</SciFiButton>
			</div>
		</div>
	);
}
