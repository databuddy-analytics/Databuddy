export function CalculatorSources() {
	return (
		<section className="mx-auto max-w-3xl space-y-4 rounded border border-border bg-card/40 p-6 text-muted-foreground text-sm">
			<h2 className="text-balance font-semibold text-foreground">
				Assumptions and sources
			</h2>
			<p className="text-pretty">
				Monthly visitors × unmeasured share × conversion rate × revenue per
				conversion. The yearly result multiplies the monthly estimate by 12. All
				starting values are illustrative.
			</p>
			<p className="text-pretty">
				The model assumes the same conversion rate for measured and unmeasured
				visitors, constant monthly traffic, and no attribution from other
				sources. It cannot predict the revenue a different analytics tool would
				recover.
			</p>
			<p className="text-pretty">
				Consent refusal does not always mean no measurement: Google’s advanced
				consent mode can send cookieless pings. Cookieless tools also require a
				review of their storage and processing configuration;
				audience-measurement consent exemptions have conditions.
			</p>
			<ul className="list-inside list-disc space-y-2">
				<li>
					<a
						className="underline underline-offset-2"
						href="https://developers.google.com/tag-platform/security/concepts/consent-mode"
					>
						Google: basic and advanced consent mode
					</a>
				</li>
				<li>
					<a
						className="underline underline-offset-2"
						href="https://www.cnil.fr/en/sheet-ndeg16-use-analytics-your-websites-and-applications"
					>
						CNIL: audience measurement and consent exemptions
					</a>
				</li>
			</ul>
		</section>
	);
}
