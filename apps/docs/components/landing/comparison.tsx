import { BarChart3, Check, X } from 'lucide-react';

const features = [
	{
		name: 'Cookie-free tracking',
		us: true,
		ga: false,
		plausible: true,
		fathom: true,
		benefit: 'No consent banners, higher opt-in rates',
	},
	{
		name: 'GDPR Compliant by default',
		us: true,
		ga: false,
		plausible: true,
		fathom: true,
		benefit: 'Reduce legal risk and compliance costs',
	},
	{
		name: '65x faster script',
		us: true,
		ga: false,
		plausible: false,
		fathom: false,
		benefit: 'Better Core Web Vitals and SEO rankings',
	},
	{
		name: 'Data ownership',
		us: true,
		ga: false,
		plausible: true,
		fathom: false,
		benefit: 'Full control of your valuable business data',
	},
	{
		name: 'Export raw data',
		us: true,
		ga: false,
		plausible: false,
		fathom: false,
		benefit: 'Integrate with your existing business tools',
	},
	{
		name: 'AI-powered insights',
		us: true,
		ga: false,
		plausible: false,
		fathom: false,
		benefit: 'Predictive analytics and automated recommendations',
	},
	{
		name: 'Real-time analytics',
		us: true,
		ga: true,
		plausible: true,
		fathom: true,
		benefit: 'Make data-driven decisions instantly',
	},
	{
		name: 'Self-hosting option',
		us: true,
		ga: false,
		plausible: true,
		fathom: false,
		benefit: 'Complete control over your infrastructure',
	},
	{
		name: 'Transparent pricing',
		us: true,
		ga: false,
		plausible: true,
		fathom: true,
		benefit: 'No hidden costs or surprise charges',
	},
	{
		name: 'Advanced event tracking',
		us: true,
		ga: true,
		plausible: false,
		fathom: false,
		benefit: 'Track custom user interactions and conversions',
	},
];

export default function Comparison() {
	return (
		<div className="-pr-2 relative mx-auto rounded-none border-border bg-background/95 font-geist md:w-10/12 md:border-[1.2px] md:border-b-0 md:border-l-0">
			<div className="w-full md:mx-0">
				{/* Single wide section for comparison */}
				<div className="border-border border-t-[1.2px] border-b-[1.2px] border-l-[1.2px] p-6 sm:p-8 md:border-t-0 md:p-10">
					<div className="my-1 flex items-center gap-2">
						<BarChart3 className="h-4 w-4 text-muted-foreground" />
						<p className="text-muted-foreground">Feature Comparison</p>
					</div>
					<div className="mt-2 mb-8">
						<div className="max-w-full">
							<div className="flex gap-3">
								<p className="max-w-lg font-normal text-foreground text-xl tracking-tighter md:text-2xl">
									Better than <strong>all competitors</strong> in every way.
								</p>
							</div>
						</div>
						<p className="mt-2 text-left text-muted-foreground text-sm">
							Compare Databuddy with the most popular analytics platforms and
							see why we&apos;re the clear choice.
						</p>
					</div>

					{/* Comparison table */}
					<div className="overflow-hidden rounded-xl border border-border bg-muted/20">
						{/* Desktop table header */}
						<div className="hidden grid-cols-6 border-border border-b bg-muted/50 p-4 md:grid">
							<div className="font-medium text-muted-foreground text-sm">
								Feature
							</div>
							<div className="text-center font-semibold text-primary text-sm">
								Databuddy
							</div>
							<div className="text-center font-semibold text-muted-foreground text-sm">
								Google Analytics
							</div>
							<div className="text-center font-semibold text-muted-foreground text-sm">
								Plausible
							</div>
							<div className="text-center font-semibold text-muted-foreground text-sm">
								Fathom
							</div>
							<div className="font-medium text-muted-foreground text-sm">
								Business Impact
							</div>
						</div>

						{/* Mobile header */}
						<div className="border-border border-b bg-muted/50 p-4 md:hidden">
							<div className="text-center font-semibold text-primary text-sm">
								Feature Comparison
							</div>
						</div>

						{features.map((feature) => (
							<div
								className="border-border/50 border-b transition-colors last:border-b-0 hover:bg-muted/30"
								key={feature.name}
							>
								{/* Desktop layout */}
								<div className="hidden grid-cols-6 p-4 md:grid">
									<div className="pr-4 text-foreground text-sm">
										{feature.name}
									</div>
									<div className="flex justify-center">
										{feature.us ? (
											<Check className="h-5 w-5 text-primary" />
										) : (
											<X className="h-5 w-5 text-muted-foreground" />
										)}
									</div>
									<div className="flex justify-center">
										{feature.ga ? (
											<Check className="h-5 w-5 text-muted-foreground" />
										) : (
											<X className="h-5 w-5 text-muted-foreground" />
										)}
									</div>
									<div className="flex justify-center">
										{feature.plausible ? (
											<Check className="h-5 w-5 text-muted-foreground" />
										) : (
											<X className="h-5 w-5 text-muted-foreground" />
										)}
									</div>
									<div className="flex justify-center">
										{feature.fathom ? (
											<Check className="h-5 w-5 text-muted-foreground" />
										) : (
											<X className="h-5 w-5 text-muted-foreground" />
										)}
									</div>
									<div className="text-muted-foreground text-xs">
										{feature.benefit}
									</div>
								</div>

								{/* Mobile layout */}
								<div className="space-y-3 p-4 md:hidden">
									<div className="flex items-start justify-between">
										<div className="flex-1 pr-4 font-medium text-foreground text-sm">
											{feature.name}
										</div>
										<div className="flex items-center gap-1">
											<span className="font-medium text-primary text-xs">
												Databuddy
											</span>
											{feature.us ? (
												<Check className="h-4 w-4 text-primary" />
											) : (
												<X className="h-4 w-4 text-muted-foreground" />
											)}
										</div>
									</div>

									<div className="text-muted-foreground text-xs leading-relaxed">
										{feature.benefit}
									</div>

									<div className="flex flex-wrap gap-3 pt-2">
										<div className="flex items-center gap-1">
											<span className="text-muted-foreground text-xs">GA</span>
											{feature.ga ? (
												<Check className="h-3 w-3 text-muted-foreground" />
											) : (
												<X className="h-3 w-3 text-muted-foreground" />
											)}
										</div>
										<div className="flex items-center gap-1">
											<span className="text-muted-foreground text-xs">
												Plausible
											</span>
											{feature.plausible ? (
												<Check className="h-3 w-3 text-muted-foreground" />
											) : (
												<X className="h-3 w-3 text-muted-foreground" />
											)}
										</div>
										<div className="flex items-center gap-1">
											<span className="text-muted-foreground text-xs">
												Fathom
											</span>
											{feature.fathom ? (
												<Check className="h-3 w-3 text-muted-foreground" />
											) : (
												<X className="h-3 w-3 text-muted-foreground" />
											)}
										</div>
									</div>
								</div>
							</div>
						))}
					</div>

					<div className="mt-6 text-center">
						<p className="text-muted-foreground text-xs">
							All features available on our free plan with up to 50,000 monthly
							pageviews
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
