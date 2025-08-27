import Link from 'next/link';
import { SciFiButton } from '@/components/landing/scifi-btn';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { eventsToSliderValue, sliderValueToEvents } from './estimator-scale';
import { formatCompact, formatInteger, formatMoney } from './estimator-utils';
import type { NormalizedPlan } from './types';

type Props = {
	monthlyEvents: number;
	setMonthlyEvents: (value: number) => void;
	bestPlan: NormalizedPlan | null;
	bestPlanDisplayName: string;
	estimatedOverage: number;
	estimatedMonthly: number;
};

export function Estimator({
	monthlyEvents,
	setMonthlyEvents,
	bestPlan,
	bestPlanDisplayName,
	estimatedOverage,
	estimatedMonthly,
}: Props) {
	const included = bestPlan ? bestPlan.includedEventsMonthly : 0;
	const over = Math.max(monthlyEvents - included, 0);
	const includedPortion =
		monthlyEvents === 0
			? 0
			: Math.min(
					100,
					(Math.min(monthlyEvents, included) / monthlyEvents) * 100
				);

	const tiers = bestPlan?.eventTiers ?? [];

	return (
		<section>
			<Card className="group relative rounded border border-border bg-card/70 shadow-inner backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:shadow-primary/10">
				<CardHeader>
					<CardTitle className="font-semibold text-lg">
						Estimate your monthly cost
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<div>
							<Label htmlFor="events">Monthly events</Label>
							<div className="mt-1 font-semibold text-2xl tracking-tight">
								{formatInteger(monthlyEvents)}
								<span className="ml-1 text-muted-foreground text-sm">
									/ month
								</span>
							</div>
							<div className="mt-3 flex items-center gap-3">
								<Input
									aria-label="Monthly events"
									id="events"
									inputMode="numeric"
									min={0}
									onChange={(e) =>
										setMonthlyEvents(Number(e.target.value) || 0)
									}
									step={1000}
									type="number"
									value={monthlyEvents}
								/>
							</div>
							<div className="mt-4">
								<Slider
									aria-label="Monthly events slider"
									max={100}
									min={0}
									onValueChange={(v) =>
										setMonthlyEvents(sliderValueToEvents(Number(v?.[0] || 0)))
									}
									step={1}
									value={[eventsToSliderValue(monthlyEvents)]}
								/>
								<div className="mt-2 flex items-center justify-between text-muted-foreground text-xs">
									<span>{formatInteger(0)}</span>
									<span>{formatCompact(10_000)}</span>
									<span>{formatCompact(100_000)}</span>
									<span>{formatCompact(1_000_000)}</span>
									<span>{formatCompact(10_000_000)}</span>
									<span>{formatCompact(100_000_000)}</span>
								</div>
								<p className="mt-2 text-muted-foreground text-xs">
									We can scale with you, from 0 to 100M events / month.
								</p>
							</div>
						</div>

						<div className="rounded border border-border bg-card/20 p-4">
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground text-sm">
									Best matching plan
								</span>
								<span className="font-medium text-sm">
									{bestPlanDisplayName}
								</span>
							</div>
							<Separator className="my-3" />
							<div className="relative h-2 w-full rounded bg-muted">
								<div
									className="absolute top-0 left-0 h-full rounded bg-primary"
									style={{ width: `${includedPortion}%` }}
								/>
							</div>
							<div className="mt-2 flex items-center justify-between text-muted-foreground text-xs">
								<span>
									Included: {formatInteger(Math.min(monthlyEvents, included))}
								</span>
								<span>Overage: {formatInteger(over)}</span>
							</div>
							<Separator className="my-3" />
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground text-sm">
									Plan price
								</span>
								<span className="text-sm">
									{formatMoney(bestPlan ? bestPlan.priceMonthly : 0)}
								</span>
							</div>
							<div className="mt-2 flex items-center justify-between">
								<span className="text-muted-foreground text-sm">
									Estimated overage
								</span>
								<span className="text-sm">{formatMoney(estimatedOverage)}</span>
							</div>
							<Separator className="my-3" />
							<div className="flex items-center justify-between">
								<span className="font-semibold text-sm">
									Estimated total / month
								</span>
								<span className="font-semibold text-sm">
									{formatMoney(estimatedMonthly)}
								</span>
							</div>
							<div className="mt-4 flex justify-end">
								<SciFiButton asChild>
									<Link
										href="https://app.databuddy.cc/login"
										rel="noopener noreferrer"
										target="_blank"
									>
										GET STARTED
									</Link>
								</SciFiButton>
							</div>
						</div>
					</div>

					{/* Overage tiers table */}
					<details className="mt-6 text-muted-foreground text-sm">
						<summary className="cursor-pointer select-none">
							View overage tier rates
						</summary>
						{tiers.length > 0 ? (
							<div className="mt-2 overflow-x-auto rounded border border-border bg-card/70 backdrop-blur-sm">
								<table className="w-full text-left">
									<caption className="sr-only">
										Overage tier rates table
									</caption>
									<thead className="border-border border-b bg-background/60">
										<tr>
											<th
												className="px-3 py-2 text-foreground text-xs"
												scope="col"
											>
												From
											</th>
											<th
												className="px-3 py-2 text-foreground text-xs"
												scope="col"
											>
												To
											</th>
											<th
												className="px-3 py-2 text-foreground text-xs"
												scope="col"
											>
												Rate / event
											</th>
										</tr>
									</thead>
									<tbody>
										{tiers.map((tier, i, arr) => {
											const from = i === 0 ? 0 : (arr[i - 1].to as number) + 1;
											const to =
												tier.to === 'inf'
													? '∞'
													: Number(tier.to).toLocaleString();
											return (
												<tr
													className="border-border border-t"
													key={`${tier.to}`}
												>
													<td className="px-3 py-2 text-foreground text-xs">
														{from.toLocaleString()}
													</td>
													<td className="px-3 py-2 text-foreground text-xs">
														{to}
													</td>
													<td className="px-3 py-2 text-foreground text-xs">
														${tier.amount.toFixed(6)}
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
						) : (
							<div className="mt-2 rounded border border-border bg-card/70 p-3 text-muted-foreground text-xs">
								This plan has no tiered overage.
							</div>
						)}
					</details>
				</CardContent>
				{/* Decorative corners to match landing cards */}
				<div className="pointer-events-none absolute inset-0">
					<div className="absolute top-0 left-0 h-2 w-2">
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
					</div>
					<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2">
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
					</div>
					<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2">
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
					</div>
					<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2">
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
					</div>
				</div>
			</Card>
		</section>
	);
}
