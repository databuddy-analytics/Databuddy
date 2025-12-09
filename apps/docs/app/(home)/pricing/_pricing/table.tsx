import { CheckIcon, XIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { SciFiButton } from "@/components/landing/scifi-btn";
import type { NormalizedPlan } from "./types";

type Props = { plans: NormalizedPlan[] };

function FeatureCheck() {
	return (
		<span className="inline-flex items-center justify-center">
			<CheckIcon className="size-4 text-primary" weight="bold" />
		</span>
	);
}

function FeatureX() {
	return (
		<span className="inline-flex items-center justify-center">
			<XIcon className="size-4 text-muted-foreground" weight="bold" />
		</span>
	);
}

export function PlansComparisonTable({ plans }: Props) {
	return (
		<section className="mb-10">
			<div className="group relative overflow-x-auto border border-border bg-card/70 shadow-inner backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:shadow-primary/10">
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
									className={`px-4 py-3 text-center text-foreground text-sm sm:px-5 lg:px-6 ${plan.id === "pro" ? "border-border border-x bg-primary/10" : ""}`}
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
						{/* Price row */}
						<tr className="border-border border-t hover:bg-card/10">
							<td className="px-4 py-3 text-muted-foreground text-sm sm:px-5 lg:px-6">
								Price / month
							</td>
							{plans.map((p) => (
								<td
									className={`px-4 py-3 text-center text-foreground sm:px-5 lg:px-6 ${p.id === "pro" ? "border-border border-x bg-primary/10" : ""}`}
									key={`price-${p.id}`}
								>
									{p.id === "enterprise" ? (
										<span className="font-medium text-muted-foreground">
											Contact Us
										</span>
									) : p.priceMonthly === 0 ? (
										"Free"
									) : p.id === "hobby" ? (
										<div className="flex flex-col items-center gap-0.5">
											<span className="font-medium">$2 first month</span>
											<span className="text-muted-foreground text-xs">
												then $10/mo
											</span>
										</div>
									) : (
										`$${p.priceMonthly.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
									)}
								</td>
							))}
						</tr>
						{/* Events row */}
						<tr className="border-border border-t hover:bg-card/10">
							<td className="px-4 py-3 text-muted-foreground text-sm sm:px-5 lg:px-6">
								Included events / month
							</td>
							{plans.map((p) => (
								<td
									className={`px-4 py-3 text-center text-foreground sm:px-5 lg:px-6 ${p.id === "pro" ? "border-border border-x bg-primary/10" : ""}`}
									key={`events-${p.id}`}
								>
									{p.id === "enterprise"
										? "Custom"
										: p.includedEventsMonthly.toLocaleString()}
								</td>
							))}
						</tr>
						{/* Assistant messages row */}
						<tr className="border-border border-t hover:bg-card/10">
							<td className="px-4 py-3 text-muted-foreground text-sm sm:px-5 lg:px-6">
								Assistant messages / day
							</td>
							{plans.map((p) => (
								<td
									className={`px-4 py-3 text-center text-foreground sm:px-5 lg:px-6 ${p.id === "pro" ? "border-border border-x bg-primary/10" : ""}`}
									key={`msgs-${p.id}`}
								>
									{p.id === "enterprise" ? (
										"Unlimited"
									) : p.assistantMessagesPerDay != null ? (
										Number(p.assistantMessagesPerDay).toLocaleString()
									) : (
										<FeatureX />
									)}
								</td>
							))}
						</tr>
						{/* Tiered overage row */}
						<tr className="border-border border-t hover:bg-card/10">
							<td className="px-4 py-3 text-muted-foreground text-sm sm:px-5 lg:px-6">
								Tiered overage
							</td>
							{plans.map((p) => (
								<td
									className={`px-4 py-3 text-center text-foreground sm:px-5 lg:px-6 ${p.id === "pro" ? "border-border border-x bg-primary/10" : ""}`}
									key={`over-${p.id}`}
								>
									{p.id === "enterprise" || p.eventTiers ? (
										<FeatureCheck />
									) : (
										<FeatureX />
									)}
								</td>
							))}
						</tr>
						{/* Support row */}
						<tr className="border-border border-t hover:bg-card/10">
							<td className="px-4 py-3 text-muted-foreground text-sm sm:px-5 lg:px-6">
								Support
							</td>
							{plans.map((p) => {
								const support =
									p.id === "free"
										? "Community"
										: p.id === "hobby"
											? "Email"
											: p.id === "pro"
												? "Priority Email"
												: "Dedicated + Slack";
								return (
									<td
										className={`px-4 py-3 text-center text-foreground sm:px-5 lg:px-6 ${p.id === "pro" ? "border-border border-x bg-primary/10" : ""}`}
										key={`support-${p.id}`}
									>
										{support}
									</td>
								);
							})}
						</tr>
						{/* SSO row */}
						<tr className="border-border border-t hover:bg-card/10">
							<td className="px-4 py-3 text-muted-foreground text-sm sm:px-5 lg:px-6">
								SSO (SAML/OIDC)
							</td>
							{plans.map((p) => (
								<td
									className={`px-4 py-3 text-center text-foreground sm:px-5 lg:px-6 ${p.id === "pro" ? "border-border border-x bg-primary/10" : ""}`}
									key={`sso-${p.id}`}
								>
									{p.id === "enterprise" ? <FeatureCheck /> : <FeatureX />}
								</td>
							))}
						</tr>
						{/* Audit logs row */}
						<tr className="border-border border-t hover:bg-card/10">
							<td className="px-4 py-3 text-muted-foreground text-sm sm:px-5 lg:px-6">
								Audit Logs
							</td>
							{plans.map((p) => (
								<td
									className={`px-4 py-3 text-center text-foreground sm:px-5 lg:px-6 ${p.id === "pro" ? "border-border border-x bg-primary/10" : ""}`}
									key={`audit-${p.id}`}
								>
									{p.id === "enterprise" ? <FeatureCheck /> : <FeatureX />}
								</td>
							))}
						</tr>
						{/* White glove row */}
						<tr className="border-border border-t hover:bg-card/10">
							<td className="px-4 py-3 text-muted-foreground text-sm sm:px-5 lg:px-6">
								White Glove Onboarding
							</td>
							{plans.map((p) => (
								<td
									className={`px-4 py-3 text-center text-foreground sm:px-5 lg:px-6 ${p.id === "pro" ? "border-border border-x bg-primary/10" : ""}`}
									key={`onboard-${p.id}`}
								>
									{p.id === "enterprise" ? <FeatureCheck /> : <FeatureX />}
								</td>
							))}
						</tr>
						{/* CTA row */}
						<tr className="border-border border-t">
							<td className="px-4 py-3 sm:px-5 lg:px-6" />
							{plans.map((p) => (
								<td
									className={`px-4 py-3 text-center sm:px-5 lg:px-6 ${p.id === "pro" ? "border-border border-x bg-primary/10" : ""}`}
									key={`cta-${p.id}`}
								>
									<SciFiButton asChild>
										{p.id === "enterprise" ? (
											<Link href="mailto:hey@databuddy.cc">CONTACT US</Link>
										) : (
											<Link
												href={`https://app.databuddy.cc/register?plan=${p.id}`}
												rel="noopener noreferrer"
												target="_blank"
											>
												GET STARTED
											</Link>
										)}
									</SciFiButton>
								</td>
							))}
						</tr>
					</tbody>
				</table>

				{/* Decorative corners */}
				<div className="pointer-events-none absolute inset-0">
					<div className="absolute top-0 left-0 size-2">
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
					</div>
					<div className="-scale-x-[1] absolute top-0 right-0 size-2">
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
					</div>
					<div className="-scale-y-[1] absolute bottom-0 left-0 size-2">
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
					</div>
					<div className="-scale-[1] absolute right-0 bottom-0 size-2">
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
