"use client";

import { FaRedditAlien, FaXTwitter } from "react-icons/fa6";
import { SciFiButton } from "@/components/landing/scifi-btn";
import { formatCurrencyFull } from "./calculator-engine";

const CALCULATOR_BASE = "https://www.databuddy.cc/calculator";

function buildShareUrl(
	lostRevenueYearly: number,
	monthlyVisitors: number,
	databuddyMonthlyCost: number
): string {
	const params = new URLSearchParams({
		revenue: String(Math.round(lostRevenueYearly)),
		visitors: String(Math.round(monthlyVisitors)),
		cost: String(Math.round(databuddyMonthlyCost)),
	});
	return `${CALCULATOR_BASE}?${params.toString()}`;
}

function buildTwitterShareUrl(
	lostRevenueYearly: number,
	monthlyVisitors: number,
	databuddyMonthlyCost: number
): string {
	const shareUrl = buildShareUrl(
		lostRevenueYearly,
		monthlyVisitors,
		databuddyMonthlyCost
	);
	const text = `🍪 ~${formatCurrencyFull(lostRevenueYearly)}/yr modeled unattributed revenue (cookie-consent measurement gap, not literal loss). Model yours →`;
	const params = new URLSearchParams({ text, url: shareUrl });
	return `https://x.com/intent/tweet?${params.toString()}`;
}

function buildRedditShareUrl(
	lostRevenueYearly: number,
	monthlyVisitors: number,
	databuddyMonthlyCost: number
): string {
	const shareUrl = buildShareUrl(
		lostRevenueYearly,
		monthlyVisitors,
		databuddyMonthlyCost
	);
	const title = `Modeled unattributed revenue (measurement gap): ${formatCurrencyFull(lostRevenueYearly)}/year`;
	const params = new URLSearchParams({ url: shareUrl, title });
	return `https://www.reddit.com/submit?${params.toString()}`;
}

interface ShareButtonsProps {
	databuddyMonthlyCost: number;
	lostRevenueYearly: number;
	monthlyVisitors: number;
}

export function ShareButtons({
	lostRevenueYearly,
	monthlyVisitors,
	databuddyMonthlyCost,
}: ShareButtonsProps) {
	const twitterUrl = buildTwitterShareUrl(
		lostRevenueYearly,
		monthlyVisitors,
		databuddyMonthlyCost
	);
	const redditUrl = buildRedditShareUrl(
		lostRevenueYearly,
		monthlyVisitors,
		databuddyMonthlyCost
	);

	return (
		<div className="space-y-3">
			<p className="text-muted-foreground text-xs">
				Share your results (preview uses your numbers)
			</p>
			<div className="flex flex-wrap gap-2">
				<SciFiButton asChild>
					<a href={twitterUrl} rel="noopener noreferrer" target="_blank">
						<FaXTwitter className="size-3.5" />
						<span>Share on X</span>
					</a>
				</SciFiButton>
				<SciFiButton asChild>
					<a href={redditUrl} rel="noopener noreferrer" target="_blank">
						<FaRedditAlien className="size-3.5" />
						<span>Share on Reddit</span>
					</a>
				</SciFiButton>
			</div>
		</div>
	);
}
