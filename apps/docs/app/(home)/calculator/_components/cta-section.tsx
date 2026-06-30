"use client";

import Link from "next/link";
import { SciFiButton } from "@/components/landing/scifi-btn";
import { SciFiCard } from "@/components/scifi-card";

export function CtaSection() {
	return (
		<section className="mx-auto w-full max-w-3xl">
			<SciFiCard>
				<div className="rounded border border-border bg-card/70 p-6 text-center backdrop-blur-sm sm:p-10">
					<p className="mb-2 font-mono text-muted-foreground text-xs uppercase tracking-widest">
						The Fix
					</p>
					<h2 className="mb-4 font-bold text-2xl tracking-tight sm:text-3xl">
						Drop the cookie banner. Keep the insights.
					</h2>
					<p className="mx-auto mb-6 max-w-xl text-pretty text-muted-foreground text-sm sm:text-base">
						Databuddy is privacy-first analytics with no cookies and no consent
						banners. Under 30 KB. You get visibility into traffic cookie stacks
						often miss - cookieless scripts can still be blocked, but you skip
						consent loss on measurement.
					</p>

					<div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
						<ValueProp
							description="No cookies, no banner, no consent gap"
							title="No consent required"
						/>
						<ValueProp
							description="Lighter than a cookie notice script"
							title="Under 30 KB"
						/>
						<ValueProp
							description="Starts at $10/mo - compare to modeled gap above"
							title="Predictable pricing"
						/>
					</div>

					<div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
						<SciFiButton asChild>
							<a
								href="https://app.databuddy.cc/register"
								rel="noopener noreferrer"
								target="_blank"
							>
								START FREE
							</a>
						</SciFiButton>
						<SciFiButton asChild>
							<Link href="/docs">READ THE DOCS</Link>
						</SciFiButton>
					</div>
				</div>
			</SciFiCard>
		</section>
	);
}

function ValueProp({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<div className="rounded border border-border bg-card/40 p-4 text-left">
			<p className="mb-1 font-semibold text-sm">{title}</p>
			<p className="text-muted-foreground text-xs">{description}</p>
		</div>
	);
}
