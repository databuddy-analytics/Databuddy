'use client';

import {
	Calculator as CalculatorIcon,
	Info as InfoIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Slider } from '@/components/ui/slider';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';

const DATABUDDY_PLANS = [
	{ name: 'Free', price: 0, events: 25_000 },
	{ name: 'Pro', price: 15, events: 60_000 },
	{ name: 'Scale', price: 40, events: 300_000 },
	{ name: 'Buddy', price: 100, events: 1_000_000 },
];

const PLAUSIBLE_TIERS = [
	{ max: 10_000, price: 14, features: '1 website, core features' },
	{
		max: 100_000,
		price: 29,
		features: '3 websites, custom events, goal tracking',
	},
	{ max: 1_000_000, price: 104, features: '10 websites, team support' },
	{ max: 2_000_000, price: 134, features: '20 websites, full features' },
	{
		max: 5_000_000,
		price: 194,
		features:
			'Starter: 1 site, 3yr retention, GA import, events, segments, email/slack reports',
	},
	{
		max: 10_000_000,
		price: 254,
		features:
			'Growth: 3 sites, 3 users, shared links, team mgmt, embedded dashboards',
	},
	{
		max: Number.POSITIVE_INFINITY,
		price: 'Custom',
		features: 'Contact for Enterprise pricing',
	},
];

const COMPETITORS = [
	{
		name: 'Databuddy',
		plans: DATABUDDY_PLANS,
		overage: true,
		overageTooltip: true,
		calc: (events: number) => calculateDatabuddyCost(events),
	},
	{
		name: 'Google Analytics',
		plans: [{ name: 'Free', price: 0, events: 1_000_000 }],
		overage: false,
		overageTooltip: false,
		calc: () => 0,
	},
	{
		name: 'Plausible',
		plans: PLAUSIBLE_TIERS,
		overage: false,
		overageTooltip: false,
		calc: (events: number) => calculatePlausibleCost(events),
	},
	{
		name: 'Fathom',
		plans: [
			{ name: 'Starter', price: 14, events: 100_000 },
			{ name: 'Business', price: 44, events: 1_000_000 },
		],
		overage: true,
		overageTooltip: false,
		overageRate: 0.0004,
		calc: (events: number) =>
			calculateFlatOverage(
				events,
				[
					{ price: 14, events: 100_000 },
					{ price: 44, events: 1_000_000 },
				],
				0.0004
			),
	},
	{
		name: 'PostHog',
		plans: [{ name: 'Analytics', price: 0, events: 1_000_000 }],
		overage: true,
		overageTooltip: true,
		calc: (events: number) => calculatePosthogCost(events),
	},
];

const DATABUDDY_TIERS = [
	{ to: 2_000_000, rate: 0.000_035 },
	{ to: 10_000_000, rate: 0.000_03 },
	{ to: 50_000_000, rate: 0.000_02 },
	{ to: 250_000_000, rate: 0.000_015 },
	{ to: 'inf', rate: 0.000_01 },
];

const POSTHOG_TIERS = [
	{ to: 1_000_000, rate: 0 },
	{ to: 2_000_000, rate: 0.000_05 },
	{ to: 15_000_000, rate: 0.000_034_3 },
	{ to: 50_000_000, rate: 0.000_029_5 },
	{ to: 100_000_000, rate: 0.000_021_8 },
	{ to: 250_000_000, rate: 0.000_015 },
	{ to: 'inf', rate: 0.000_009 },
];

const FATHOM_TIERS = [
	{ max: 100_000, price: 14 },
	{ max: 200_000, price: 24 },
	{ max: 500_000, price: 44 },
	{ max: 1_000_000, price: 74 },
	{ max: 2_000_000, price: 114 },
	{ max: 5_000_000, price: 184 },
	{ max: 10_000_000, price: 274 },
	{ max: Number.POSITIVE_INFINITY, price: 'Custom' },
];

function calculateDatabuddyCost(events: number) {
	let cost = 0;
	let remaining = events;
	let prev = 0;
	for (const tier of DATABUDDY_TIERS) {
		const max = tier.to === 'inf' ? Number.POSITIVE_INFINITY : Number(tier.to);
		const tierEvents = Math.max(Math.min(remaining, max - prev), 0);
		if (tierEvents > 0) {
			cost += tierEvents * tier.rate;
			remaining -= tierEvents;
		}
		prev = max;
		if (remaining <= 0) {
			break;
		}
	}
	return cost;
}

function calculateFlatOverage(
	events: number,
	plans: { price: number; events: number }[],
	overage: number
) {
	let plan = plans[0];
	for (let i = plans.length - 1; i >= 0; i--) {
		if (events > plans[i].events) {
			plan = plans[i];
			break;
		}
	}
	if (events <= plan.events) {
		return plan.price;
	}
	return plan.price + (events - plan.events) * overage;
}

function calculatePosthogCost(events: number) {
	let cost = 0;
	let remaining = events;
	let prev = 0;
	for (const tier of POSTHOG_TIERS) {
		const max = tier.to === 'inf' ? Number.POSITIVE_INFINITY : Number(tier.to);
		const tierEvents = Math.max(Math.min(remaining, max - prev), 0);
		if (tierEvents > 0) {
			cost += tierEvents * tier.rate;
			remaining -= tierEvents;
		}
		prev = max;
		if (remaining <= 0) {
			break;
		}
	}
	return cost;
}

function calculatePlausibleCost(events: number) {
	for (const tier of PLAUSIBLE_TIERS) {
		if (typeof tier.price === 'number' && events <= tier.max) {
			return tier.price;
		}
	}
	return 'Contact Sales';
}

function calculateFathomCost(events: number) {
	for (const tier of FATHOM_TIERS) {
		if (typeof tier.price === 'number' && events <= tier.max) {
			return tier.price;
		}
	}
	return 'Contact Sales';
}

function DatabuddyOverageTooltip() {
	return (
		<HoverCard>
			<HoverCardTrigger asChild>
				<span className="inline-flex cursor-help items-center gap-1 text-muted-foreground text-xs hover:text-foreground">
					<InfoIcon size={12} />
					<span>Tiered</span>
				</span>
			</HoverCardTrigger>
			<HoverCardContent align="start" className="w-80" side="top">
				<div className="space-y-3">
					<div>
						<h4 className="font-semibold text-sm">Tiered Pricing Structure</h4>
						<p className="text-muted-foreground text-xs">
							Lower rates for higher usage volumes
						</p>
					</div>
					<div className="space-y-2">
						{DATABUDDY_TIERS.map((tier, i) => {
							const from = i === 0 ? 0 : Number(DATABUDDY_TIERS[i - 1].to) + 1;
							const to =
								tier.to === 'inf' ? '∞' : Number(tier.to).toLocaleString();
							return (
								<div
									className="flex items-center justify-between text-xs"
									key={tier.to}
								>
									<span className="text-muted-foreground">
										{from.toLocaleString()} - {to} events
									</span>
									<span className="font-medium font-mono">
										${tier.rate.toFixed(6)} each
									</span>
								</div>
							);
						})}
					</div>
					<div className="border-t pt-2 text-muted-foreground text-xs">
						You only pay the tier rate for usage within that range
					</div>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}

function PosthogOverageTooltip() {
	return (
		<HoverCard>
			<HoverCardTrigger asChild>
				<span className="inline-flex cursor-help items-center gap-1 text-muted-foreground text-xs hover:text-foreground">
					<InfoIcon size={12} />
					<span>Tiered</span>
				</span>
			</HoverCardTrigger>
			<HoverCardContent align="start" className="w-80" side="top">
				<div className="space-y-3">
					<div>
						<h4 className="font-semibold text-sm">PostHog Analytics Tiers</h4>
						<p className="text-muted-foreground text-xs">
							Lower rates for higher usage volumes
						</p>
					</div>
					<div className="space-y-2">
						{POSTHOG_TIERS.map((tier, i) => {
							const from = i === 0 ? 0 : Number(POSTHOG_TIERS[i - 1].to) + 1;
							const to =
								tier.to === 'inf' ? '∞' : Number(tier.to).toLocaleString();
							return (
								<div
									className="flex items-center justify-between text-xs"
									key={tier.to}
								>
									<span className="text-muted-foreground">
										{from.toLocaleString()} - {to} events
									</span>
									<span className="font-medium font-mono">
										${tier.rate.toFixed(6)} each
									</span>
								</div>
							);
						})}
					</div>
					<div className="border-t pt-2 text-muted-foreground text-xs">
						First 1M events free. You only pay the tier rate for usage within
						that range.
					</div>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}

function DataSoldMeter({ events }: { events: number }) {
	const mb = events * 0.002;
	let display = '';
	if (mb < 1000) {
		display = `${mb.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MB`;
	} else if (mb < 1_000_000) {
		const gb = mb / 1000;
		display = `${gb.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GB`;
	} else {
		const pb = mb / 1_000_000;
		display = `${pb.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PB`;
	}
	return (
		<span className="text-muted-foreground text-xs">
			Data sold to advertisers: {display}
		</span>
	);
}

const formatCost = (cost: number | string): string => {
	if (typeof cost === 'number') {
		return `$${cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
	}
	return cost;
};

const getProviderCost = (
	provider: (typeof COMPETITORS)[0],
	events: number
): string => {
	if (provider.name === 'Fathom') {
		const cost = calculateFathomCost(events);
		return formatCost(cost);
	}

	if (provider.name === 'Plausible') {
		const cost = calculatePlausibleCost(events);
		return formatCost(cost);
	}

	const cost = provider.calc(events);
	return formatCost(cost);
};

const ProviderRow = ({
	provider,
	events,
}: {
	provider: (typeof COMPETITORS)[0];
	events: number;
}) => (
	<TableRow key={provider.name}>
		<TableCell className="font-medium text-lg text-primary">
			{provider.name}
		</TableCell>
		<TableCell className="font-bold text-foreground text-xl">
			{getProviderCost(provider, events)}
		</TableCell>
	</TableRow>
);

export default function PricingPageContent() {
	const [events, setEvents] = useState(25_000);

	return (
		<div className="relative min-h-screen overflow-x-hidden font-geist">
			{/* Layered background gradients */}
			<div className="absolute inset-0 z-0">
				<div className="absolute inset-0 bg-background" />
				<div className="absolute inset-0 bg-gradient-to-b from-muted/20 to-muted/50" />
				<div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(var(--primary),0.08)_0%,transparent_60%)]" />
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(var(--primary),0.06)_0%,transparent_60%)]" />
			</div>
			<div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-2 py-12 sm:px-4 md:px-8">
				<div className="w-full max-w-3xl space-y-10 rounded-xl border border-border bg-card/70 p-6 shadow-lg backdrop-blur-sm md:p-10">
					<h1 className="mb-2 font-bold text-3xl">
						Analytics Pricing Comparison
					</h1>
					<p className="mb-6 text-muted-foreground">
						Compare analytics pricing at a glance. All prices are public and for
						self-serve plans.
					</p>

					{/* Concise Comparison Table */}
					<Card className="border-none bg-transparent p-0 shadow-none">
						<CardHeader>
							<CardTitle>Pricing Comparison</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="overflow-x-auto rounded border border-border bg-background">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Provider</TableHead>
											<TableHead>Included Events</TableHead>
											<TableHead>Monthly Price</TableHead>
											<TableHead>Overage</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{/* Databuddy */}
										<TableRow>
											<TableCell className="font-medium text-primary">
												Databuddy
											</TableCell>
											<TableCell className="text-foreground">25,000+</TableCell>
											<TableCell className="text-foreground">
												Free, then from $15/mo
											</TableCell>
											<TableCell className="text-foreground">
												<DatabuddyOverageTooltip />
											</TableCell>
										</TableRow>
										{/* Plausible */}
										<TableRow>
											<TableCell className="font-medium text-primary">
												Plausible
											</TableCell>
											<TableCell className="text-foreground">10,000+</TableCell>
											<TableCell className="text-foreground">
												from $9/mo
											</TableCell>
											<TableCell className="text-center text-foreground text-lg">
												✗
											</TableCell>
										</TableRow>
										{/* Fathom */}
										<TableRow>
											<TableCell className="font-medium text-primary">
												Fathom
											</TableCell>
											<TableCell className="text-foreground">
												100,000+
											</TableCell>
											<TableCell className="text-foreground">
												from $14/mo
											</TableCell>
											<TableCell className="text-center text-foreground text-lg">
												✗
											</TableCell>
										</TableRow>
										{/* PostHog */}
										<TableRow>
											<TableCell className="font-medium text-primary">
												PostHog
											</TableCell>
											<TableCell className="text-foreground">
												1,000,000+
											</TableCell>
											<TableCell className="text-foreground">
												Free, then usage-based
											</TableCell>
											<TableCell className="text-foreground">
												<PosthogOverageTooltip />
											</TableCell>
										</TableRow>
										{/* Google Analytics always last */}
										<TableRow key="Google Analytics">
											<TableCell className="font-medium text-primary">
												Google Analytics
											</TableCell>
											<TableCell className="text-foreground">
												1,000,000
											</TableCell>
											<TableCell className="text-foreground">
												<DataSoldMeter events={events} />
											</TableCell>
											<TableCell className="text-muted-foreground text-xs">
												N/A
											</TableCell>
										</TableRow>
									</TableBody>
								</Table>
							</div>
							<div className="mt-4 text-muted-foreground text-xs">
								For higher volumes or enterprise, contact each provider for a
								custom quote.
							</div>
						</CardContent>
					</Card>

					{/* Calculator */}
					<Card className="mt-10 border-none bg-transparent p-0 shadow-none">
						<CardHeader className="flex flex-row items-center gap-2 pb-2">
							<CalculatorIcon size={20} weight="duotone" />
							<CardTitle>Event-based Cost Calculator</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="flex w-full flex-col items-center gap-6">
								<div className="text-center">
									<span className="text-muted-foreground text-sm">
										Monthly Events
									</span>
									<div
										className="mt-1 font-bold text-3xl text-primary"
										data-testid="event-count"
									>
										{events.toLocaleString()}
									</div>
								</div>
								<Slider
									aria-label="Monthly events slider"
									className="w-full sm:w-96"
									max={100_000_000}
									min={0}
									onValueChange={([val]) => setEvents(val)}
									step={1000}
									value={[events]}
								/>
							</div>
							<div className="mt-10">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Provider</TableHead>
											<TableHead>Est. Monthly Cost</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{COMPETITORS.filter(
											(p) => p.name !== 'Google Analytics'
										).map((provider) => (
											<ProviderRow
												events={events}
												key={provider.name}
												provider={provider}
											/>
										))}
										{/* Google Analytics always last */}
										<TableRow key="Google Analytics">
											<TableCell className="font-medium text-lg text-primary">
												Google Analytics
											</TableCell>
											<TableCell className="font-bold text-foreground text-xl">
												<DataSoldMeter events={events} />
											</TableCell>
										</TableRow>
									</TableBody>
								</Table>
							</div>
						</CardContent>
					</Card>

					<div className="mt-8 text-center text-muted-foreground text-xs">
						Pricing data as of 2024. For full details, see each provider’s
						website. This calculator is for estimation only.
					</div>
				</div>
			</div>
		</div>
	);
}
