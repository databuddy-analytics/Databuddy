import { CheckIcon, XIcon } from '@phosphor-icons/react';
import { SciFiButton } from '@/components/landing/scifi-btn';
import type { NormalizedPlan } from './types';

type Props = { plans: NormalizedPlan[] };

export function PlansComparisonTable({ plans }: Props) {
	return (
		<section className="mb-10">
			<div className="group relative overflow-x-auto rounded border border-border bg-card/70 shadow-inner backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:shadow-primary/10">
				<table className="w-full">
					<caption className="sr-only">Databuddy plan comparison</caption>
					<thead className="border-border border-b bg-card/20">
						<tr>
							<th
								className="px-4 py-3 text-left text-foreground text-sm sm:px-5 lg:px-6"
								scope="col"
							>
								Feature
							</th>
							{plans.map((plan) => (
								<th
									className={`px-4 py-3 text-center text-foreground text-sm sm:px-5 lg:px-6 ${plan.id === 'pro' ? 'border-border border-x bg-primary/10' : ''}`}
									key={plan.id}
									scope="col"
								>
									<div className="flex flex-col items-center gap-1">
										<span className="font-medium">{plan.name}</span>
									</div>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						<tr className="border-border border-t transition-colors hover:bg-card/10">
							<td className="px-4 py-3 text-muted-foreground text-sm sm:px-5 lg:px-6">
								Price / month
							</td>
							{plans.map((p) => (
								<td
									className={`px-4 py-3 text-center text-foreground sm:px-5 lg:px-6 ${p.id === 'pro' ? 'border-border border-x bg-primary/10' : ''}`}
									key={`price-${p.id}`}
								>
									{p.priceMonthly === 0
										? 'Free'
										: `$${p.priceMonthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
								</td>
							))}
						</tr>
						<tr className="border-border border-t transition-colors hover:bg-card/10">
							<td className="px-4 py-3 text-muted-foreground text-sm sm:px-5 lg:px-6">
								Included events / mo
							</td>
							{plans.map((p) => (
								<td
									className={`px-4 py-3 text-center text-foreground sm:px-5 lg:px-6 ${p.id === 'pro' ? 'border-border border-x bg-primary/10' : ''}`}
									key={`events-${p.id}`}
								>
									{p.includedEventsMonthly.toLocaleString()}
								</td>
							))}
						</tr>
						<tr className="border-border border-t transition-colors hover:bg-card/10">
							<td className="px-4 py-3 text-muted-foreground text-sm sm:px-5 lg:px-6">
								Websites
							</td>
							{plans.map((p) => (
								<td
									className={`px-4 py-3 text-center text-foreground sm:px-5 lg:px-6 ${p.id === 'pro' ? 'border-border border-x bg-primary/10' : ''}`}
									key={`sites-${p.id}`}
								>
									{p.websitesIncluded === 'inf'
										? 'Unlimited'
										: p.websitesIncluded?.toLocaleString()}
									{p.websitesOveragePerUnit ? (
										<span className="text-muted-foreground text-xs">
											{` (then $${Number(p.websitesOveragePerUnit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/website)`}
										</span>
									) : null}
								</td>
							))}
						</tr>
						<tr className="border-border border-t transition-colors hover:bg-card/10">
							<td className="px-4 py-3 text-muted-foreground text-sm sm:px-5 lg:px-6">
								Assistant messages / day
							</td>
							{plans.map((p) => (
								<td
									className={`px-4 py-3 text-center text-foreground sm:px-5 lg:px-6 ${p.id === 'pro' ? 'border-border border-x bg-primary/10' : ''}`}
									key={`msgs-${p.id}`}
								>
									{p.assistantMessagesPerDay != null ? (
										Number(p.assistantMessagesPerDay).toLocaleString()
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
						<tr className="border-border border-t transition-colors hover:bg-card/10">
							<td className="px-4 py-3 text-muted-foreground text-sm sm:px-5 lg:px-6">
								Tiered overage
							</td>
							{plans.map((p) => (
								<td
									className={`px-4 py-3 text-center text-foreground sm:px-5 lg:px-6 ${p.id === 'pro' ? 'border-border border-x bg-primary/10' : ''}`}
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
						<tr className="border-border border-t transition-colors hover:bg-card/10">
							<td className="px-4 py-3 text-muted-foreground text-sm sm:px-5 lg:px-6">
								Support
							</td>
							{plans.map((p) => {
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
										className={`px-4 py-3 text-center text-foreground sm:px-5 lg:px-6 ${p.id === 'pro' ? 'border-border border-x bg-primary/10' : ''}`}
										key={`support-${p.id}`}
									>
										{support}
									</td>
								);
							})}
						</tr>
						<tr className="border-border border-t transition-colors hover:bg-card/10">
							<td className="px-4 py-3 text-muted-foreground text-sm sm:px-5 lg:px-6">
								White Glove Onboarding
							</td>
							{plans.map((p) => (
								<td
									className={`px-4 py-3 text-center text-foreground sm:px-5 lg:px-6 ${p.id === 'pro' ? 'border-border border-x bg-primary/10' : ''}`}
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
						<tr className="border-border border-t transition-colors hover:bg-card/10">
							<td className="px-4 py-3 text-muted-foreground text-sm sm:px-5 lg:px-6">
								Beta / Early Access
							</td>
							{plans.map((p) => (
								<td
									className={`px-4 py-3 text-center text-foreground sm:px-5 lg:px-6 ${p.id === 'pro' ? 'border-border border-x bg-primary/10' : ''}`}
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
						{/* CTA row */}
						<tr className="border-border border-t">
							<td className="px-4 py-3 sm:px-5 lg:px-6" />
							{plans.map((p) => (
								<td
									className={`px-4 py-3 text-center sm:px-5 lg:px-6 ${p.id === 'pro' ? 'border-border border-x bg-primary/10' : ''}`}
									key={`cta-${p.id}`}
								>
									<SciFiButton asChild>
										<a
											href="https://app.databuddy.cc/login"
											rel="noopener noreferrer"
											target="_blank"
										>
											GET STARTED
										</a>
									</SciFiButton>
								</td>
							))}
						</tr>
					</tbody>
				</table>

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
			</div>
			<div className="mt-3 text-muted-foreground text-xs">
				Overage is tiered. Lower rates apply as volume increases.
			</div>
		</section>
	);
}
