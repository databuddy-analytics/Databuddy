'use client';

import { CheckIcon, XIcon } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';

import { RAW_PLANS, type RawItem, type RawPlan } from './data';

type NormalizedPlan = {
	id: string;
	name: string;
	priceMonthly: number;
	includedEventsMonthly: number;
	eventTiers: Array<{ to: number | 'inf'; amount: number }> | null;
	websitesIncluded: number | 'inf' | null;
	websitesOveragePerUnit: number | null;
	assistantMessagesPerDay: number | null;
};

function getPriceMonthly(items: RawItem[]): number {
	for (const item of items) {
		if (item.type === 'price') {
			return item.price;
		}
	}
	return 0;
}

function getEventsInfo(items: RawItem[]): {
	included: number;
	tiers: Array<{ to: number | 'inf'; amount: number }> | null;
} {
	let included = 0;
	let tiers: Array<{ to: number | 'inf'; amount: number }> | null = null;
	for (const item of items) {
		const isEvent =
			(item.type === 'feature' || item.type === 'priced_feature') &&
			item.feature_id === 'events';
		if (!isEvent) {
			continue;
		}
		if (typeof item.included_usage === 'number') {
			included = item.included_usage;
		}
		if (item.type === 'priced_feature' && item.tiers) {
			tiers = item.tiers;
		}
	}
	return { included, tiers };
}

function getWebsitesInfo(items: RawItem[]): {
	included: number | 'inf' | null;
	overage: number | null;
} {
	let included: number | 'inf' | null = null;
	let overage: number | null = null;
	for (const item of items) {
		const isWeb =
			(item.type === 'feature' || item.type === 'priced_feature') &&
			item.feature_id === 'websites';
		if (!isWeb) {
			continue;
		}
		included = item.included_usage as number | 'inf';
		if (item.type === 'priced_feature' && typeof item.price === 'number') {
			overage = item.price;
		}
	}
	return { included, overage };
}

function getAssistantMessagesPerDay(items: RawItem[]): number | null {
	for (const item of items) {
		const isAssistant =
			(item.type === 'feature' || item.type === 'priced_feature') &&
			item.feature_id === 'assistant_message' &&
			item.interval === 'day' &&
			typeof item.included_usage === 'number';
		if (isAssistant) {
			return item.included_usage as number;
		}
	}
	return null;
}

function normalizePlans(raw: RawPlan[]): NormalizedPlan[] {
	return raw.map((plan) => {
		const priceMonthly = getPriceMonthly(plan.items);
		const { included: includedEventsMonthly, tiers: eventTiers } =
			getEventsInfo(plan.items);
		const { included: websitesIncluded, overage: websitesOveragePerUnit } =
			getWebsitesInfo(plan.items);
		const assistantMessagesPerDay = getAssistantMessagesPerDay(plan.items);
		return {
			id: plan.id,
			name: plan.name,
			priceMonthly,
			includedEventsMonthly,
			eventTiers,
			websitesIncluded,
			websitesOveragePerUnit,
			assistantMessagesPerDay,
		};
	});
}

const PLANS: NormalizedPlan[] = normalizePlans(RAW_PLANS);

function formatMoney(value: number): string {
	return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatInteger(value: number): string {
	return value.toLocaleString();
}

function formatCompact(value: number): string {
	return new Intl.NumberFormat(undefined, {
		notation: 'compact',
		maximumFractionDigits: 1,
	}).format(value);
}

function estimateTieredOverageCostFromTiers(
	events: number,
	tiers: Array<{ to: number | 'inf'; amount: number }>
): number {
	let cost = 0;
	let remaining = events;
	let prevMax = 0;
	for (const tier of tiers) {
		const max = tier.to === 'inf' ? Number.POSITIVE_INFINITY : Number(tier.to);
		const tierEvents = Math.max(Math.min(remaining, max - prevMax), 0);
		if (tierEvents > 0) {
			cost += tierEvents * tier.amount;
			remaining -= tierEvents;
		}
		prevMax = max;
		if (remaining <= 0) {
			break;
		}
	}
	return cost;
}

export default function PricingPage() {
	const [monthlyEvents, setMonthlyEvents] = useState<number>(25_000);

	const bestPlan = useMemo(() => {
		const sortedByIncluded = [...PLANS].sort(
			(a, b) => a.includedEventsMonthly - b.includedEventsMonthly
		);
		const coveringPlan = sortedByIncluded.find(
			(p) => monthlyEvents <= p.includedEventsMonthly
		);
		if (coveringPlan) {
			return coveringPlan;
		}
		return sortedByIncluded.at(-1) ?? null;
	}, [monthlyEvents]);

	const enterpriseThreshold = useMemo(() => {
		const sortedByIncluded = [...PLANS].sort(
			(a, b) => a.includedEventsMonthly - b.includedEventsMonthly
		);
		const maxPlan = sortedByIncluded.at(-1);
		const highestFiniteTo = maxPlan?.eventTiers?.reduce((acc, tier) => {
			if (tier.to === 'inf') {
				return acc;
			}
			const toNum = Number(tier.to);
			return Number.isFinite(toNum) ? Math.max(acc, toNum) : acc;
		}, 0);
		return highestFiniteTo && highestFiniteTo > 0
			? highestFiniteTo
			: Number.POSITIVE_INFINITY;
	}, []);

	const bestPlanDisplayName = useMemo(() => {
		if (monthlyEvents > enterpriseThreshold) {
			return 'Enterprise';
		}
		return bestPlan ? bestPlan.name : 'Free';
	}, [bestPlan, monthlyEvents, enterpriseThreshold]);

	const estimatedOverage = useMemo(() => {
		const included = bestPlan ? bestPlan.includedEventsMonthly : 0;
		const over = Math.max(monthlyEvents - included, 0);
		if (!bestPlan?.eventTiers || over <= 0) {
			return 0;
		}
		return estimateTieredOverageCostFromTiers(over, bestPlan.eventTiers);
	}, [bestPlan, monthlyEvents]);

	const estimatedMonthly = useMemo(
		() => (bestPlan ? bestPlan.priceMonthly : 0) + estimatedOverage,
		[bestPlan, estimatedOverage]
	);

	return (
		<div className="px-4 py-10 sm:px-6 lg:px-8">
			<div className="mx-auto w-full max-w-7xl">
				<header className="mb-8 text-center sm:mb-10">
					<h1 className="mb-2 font-bold text-3xl tracking-tight sm:text-4xl">
						Pricing
					</h1>
					<p className="mx-auto max-w-2xl text-muted-foreground text-sm sm:text-base">
						TL;DR — simple plans, fair tiered overage, and you only pay for what
						you use.
					</p>
				</header>

				{/* Plans comparison (columns = plans) */}
				<section className="mb-10">
					<div className="overflow-x-auto rounded border border-border bg-card/70 shadow-sm backdrop-blur-sm">
						<table className="w-full">
							<caption className="sr-only">Databuddy plan comparison</caption>
							<thead className="border-border border-b bg-background/60">
								<tr>
									<th
										className="px-4 py-3 text-left text-foreground text-sm"
										scope="col"
									>
										Feature
									</th>
									{PLANS.map((plan) => {
										return (
											<th
												className="px-4 py-3 text-center text-foreground text-sm"
												key={plan.id}
												scope="col"
											>
												<div className="flex flex-col items-center gap-1">
													<span className="font-medium">{plan.name}</span>
												</div>
											</th>
										);
									})}
								</tr>
							</thead>
							<tbody>
								<tr className="border-border border-t">
									<td className="px-4 py-3 text-muted-foreground text-sm">
										Price / month
									</td>
									{PLANS.map((p) => (
										<td
											className="px-4 py-3 text-center text-foreground"
											key={`price-${p.id}`}
										>
											{p.priceMonthly === 0
												? 'Free'
												: formatMoney(p.priceMonthly)}
										</td>
									))}
								</tr>
								<tr className="border-border border-t">
									<td className="px-4 py-3 text-muted-foreground text-sm">
										Included events (mo)
									</td>
									{PLANS.map((p) => (
										<td
											className="px-4 py-3 text-center text-foreground"
											key={`events-${p.id}`}
										>
											{p.includedEventsMonthly.toLocaleString()}
										</td>
									))}
								</tr>
								<tr className="border-border border-t">
									<td className="px-4 py-3 text-muted-foreground text-sm">
										Websites
									</td>
									{PLANS.map((p) => (
										<td
											className="px-4 py-3 text-center text-foreground"
											key={`sites-${p.id}`}
										>
											{p.websitesIncluded === 'inf'
												? 'Unlimited'
												: p.websitesIncluded?.toLocaleString()}
											{p.websitesOveragePerUnit ? (
												<span className="text-muted-foreground">
													{' '}
													(then ${p.websitesOveragePerUnit}/website)
												</span>
											) : null}
										</td>
									))}
								</tr>
								<tr className="border-border border-t">
									<td className="px-4 py-3 text-muted-foreground text-sm">
										Assistant msgs / day
									</td>
									{PLANS.map((p) => (
										<td
											className="px-4 py-3 text-center text-foreground"
											key={`msgs-${p.id}`}
										>
											{p.assistantMessagesPerDay != null ? (
												p.assistantMessagesPerDay
											) : (
												<span className="inline-flex items-center justify-center">
													<XIcon
														className="h-4 w-4 text-muted-foreground"
														weight="bold"
													/>
												</span>
											)}
										</td>
									))}
								</tr>
								<tr className="border-border border-t">
									<td className="px-4 py-3 text-muted-foreground text-sm">
										Tiered overage
									</td>
									{PLANS.map((p) => (
										<td
											className="px-4 py-3 text-center text-foreground"
											key={`over-${p.id}`}
										>
											{p.eventTiers ? (
												<span className="inline-flex items-center justify-center">
													<CheckIcon
														className="h-4 w-4 text-primary"
														weight="bold"
													/>
												</span>
											) : (
												<span className="inline-flex items-center justify-center">
													<XIcon
														className="h-4 w-4 text-muted-foreground"
														weight="bold"
													/>
												</span>
											)}
										</td>
									))}
								</tr>
								<tr className="border-border border-t">
									<td className="px-4 py-3 text-muted-foreground text-sm">
										Support
									</td>
									{PLANS.map((p) => {
										const support =
											p.id === 'free'
												? 'Community Support'
												: p.id === 'hobby'
													? 'Email Support'
													: p.id === 'pro'
														? 'Priority Email Support'
														: 'Priority Email + Slack Support';
										return (
											<td
												className="px-4 py-3 text-center text-foreground"
												key={`support-${p.id}`}
											>
												{support}
											</td>
										);
									})}
								</tr>
								<tr className="border-border border-t">
									<td className="px-4 py-3 text-muted-foreground text-sm">
										White Glove Onboarding
									</td>
									{PLANS.map((p) => (
										<td
											className="px-4 py-3 text-center text-foreground"
											key={`onboard-${p.id}`}
										>
											{p.id === 'scale' ? (
												<span className="inline-flex items-center justify-center">
													<CheckIcon
														className="h-4 w-4 text-primary"
														weight="bold"
													/>
												</span>
											) : (
												<span className="inline-flex items-center justify-center">
													<XIcon
														className="h-4 w-4 text-muted-foreground"
														weight="bold"
													/>
												</span>
											)}
										</td>
									))}
								</tr>
								<tr className="border-border border-t">
									<td className="px-4 py-3 text-muted-foreground text-sm">
										Beta / Early Access
									</td>
									{PLANS.map((p) => (
										<td
											className="px-4 py-3 text-center text-foreground"
											key={`beta-${p.id}`}
										>
											{p.id === 'scale' ? (
												<span className="inline-flex items-center justify-center">
													<CheckIcon
														className="h-4 w-4 text-primary"
														weight="bold"
													/>
												</span>
											) : (
												<span className="inline-flex items-center justify-center">
													<XIcon
														className="h-4 w-4 text-muted-foreground"
														weight="bold"
													/>
												</span>
											)}
										</td>
									))}
								</tr>
							</tbody>
						</table>
					</div>
					<div className="mt-3 text-muted-foreground text-xs">
						Overage is tiered. Lower rates apply as volume increases.
					</div>
				</section>

				{/* Estimator */}
				<section>
					<Card className="border border-border bg-card/70 shadow-sm backdrop-blur-sm">
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
											/ mo
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
											max={100_000_000}
											min={0}
											onValueChange={(v) =>
												setMonthlyEvents(Math.max(0, Number(v?.[0] || 0)))
											}
											step={1000}
											value={[monthlyEvents]}
										/>
										<div className="mt-2 flex items-center justify-between text-muted-foreground text-xs">
											<span>0</span>
											<span>{formatCompact(50_000_000)}</span>
											<span>{formatCompact(100_000_000)}</span>
										</div>
										<p className="mt-2 text-muted-foreground text-xs">
											Up to 100M events / month.
										</p>
									</div>
								</div>

								<div className="rounded border border-border bg-background p-4">
									{(() => {
										const included = bestPlan
											? bestPlan.includedEventsMonthly
											: 0;
										const over = Math.max(monthlyEvents - included, 0);
										const includedPortion =
											monthlyEvents === 0
												? 0
												: Math.min(
														100,
														(Math.min(monthlyEvents, included) /
															monthlyEvents) *
															100
													);
										return (
											<div>
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
														Included:{' '}
														{formatInteger(Math.min(monthlyEvents, included))}
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
													<span className="text-sm">
														{formatMoney(estimatedOverage)}
													</span>
												</div>
												<Separator className="my-3" />
												<div className="flex items-center justify-between">
													<span className="font-semibold text-sm">
														Est. total / mo
													</span>
													<span className="font-semibold text-sm">
														{formatMoney(estimatedMonthly)}
													</span>
												</div>
											</div>
										);
									})()}
								</div>
							</div>
							<details className="mt-6 text-muted-foreground text-sm">
								<summary className="cursor-pointer select-none">
									View overage tier rates
								</summary>
								<div className="mt-2 overflow-x-auto rounded border border-border">
									<table className="w-full text-left">
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
											{(bestPlan?.eventTiers ?? []).map((tier, i, arr) => {
												const from =
													i === 0 ? 0 : (arr[i - 1].to as number) + 1;
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
							</details>
						</CardContent>
					</Card>
				</section>

				{/* Removed plan cards; all details live in the comparison table above */}
			</div>
		</div>
	);
}
