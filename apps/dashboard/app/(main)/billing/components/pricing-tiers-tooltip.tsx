"use client";

import { Button } from "@databuddy/ui";
import { Popover } from "@databuddy/ui/client";
import { InfoIcon } from "@databuddy/ui/icons";
import { formatLocaleNumber } from "@/lib/format-locale-number";

interface PricingTiersTooltipProps {
	billingUnits?: number;
	included?: number;
	showText?: boolean;
	tiers: { amount: number; to: number | "inf" }[];
}

export function PricingTiersTooltip({
	billingUnits = 1,
	included = 0,
	showText = true,
	tiers,
}: PricingTiersTooltipProps) {
	const paidTiers = tiers.filter(
		(tier) => tier.to === "inf" || tier.to > included
	);
	return (
		<Popover>
			<Popover.Trigger
				render={
					<Button
						aria-label="Extra event rates"
						className="h-auto gap-1 p-0 font-normal text-xs"
						size="sm"
						variant="ghost"
					>
						<InfoIcon size={12} />
						{showText && "Extra event rates"}
					</Button>
				}
			/>
			<Popover.Content className="w-80" side="top">
				<div className="space-y-3 text-xs">
					<div>
						<Popover.Title className="text-balance">
							Extra event rates
						</Popover.Title>
						<p className="text-pretty opacity-80">
							After {formatLocaleNumber(included)} included events / month
						</p>
					</div>
					<div className="space-y-2">
						{paidTiers.map((tier, index) => {
							const previous = index > 0 ? paidTiers[index - 1].to : included;
							const from =
								typeof previous === "number" ? previous + 1 : included + 1;
							return (
								<div
									className="flex justify-between gap-3 tabular-nums"
									key={tier.to}
								>
									<span>
										{formatLocaleNumber(from)}
										{tier.to === "inf"
											? "+"
											: `–${formatLocaleNumber(tier.to)}`}
									</span>
									<span className="shrink-0">
										$
										{((tier.amount * 1000) / billingUnits).toLocaleString(
											"en-US",
											{ maximumFractionDigits: 6 }
										)}{" "}
										/ 1k
									</span>
								</div>
							);
						})}
					</div>
					<p className="text-pretty opacity-80">
						Ranges are total monthly events. Each rate applies only within its
						range.
					</p>
				</div>
			</Popover.Content>
		</Popover>
	);
}
