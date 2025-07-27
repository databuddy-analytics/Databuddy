'use client';

// Credits to better-auth for the inspiration

import {
	AlertTriangle,
	BarChart3,
	Code,
	Globe2Icon,
	Package,
	Plus,
	Shield,
	TrendingUp,
	Users,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import Testimonials from './landing/testimonials';

const whyWeExist = [
	{
		id: 1,
		label: 'Bloated and creepy',
		title:
			'Most analytics tools are either <strong>bloated and creepy</strong> (hi Google)',
		description:
			'Google Analytics tracks everything, slows down your site, and requires cookie banners that hurt conversion rates.',
		icon: AlertTriangle,
	},
	{
		id: 2,
		label: 'Minimal but useless',
		title: 'Or <strong>minimal but useless</strong> (hi SimpleAnalytics)',
		description:
			'Simple tools give you basic pageviews but lack the depth developers need to make informed decisions about their products.',
		icon: BarChart3,
	},
	{
		id: 3,
		label: 'Complex product analytics',
		title:
			'Or "product analytics" platforms that need <strong>a data team to set up</strong> (hi PostHog)',
		description:
			"Enterprise tools are powerful but require dedicated data engineers and complex setup processes that small teams can't handle.",
		icon: Users,
	},
];

const whatYouGet = [
	{
		id: 4,
		label: 'Privacy-First Approach',
		title:
			'Build trust & reduce legal risk with built-in <strong>GDPR/CCPA compliance</strong>.',
		description:
			'No cookies required, complete data anonymization, and full GDPR/CCPA compliance out of the box. Build user trust while staying compliant.',
		icon: Shield,
	},
	{
		id: 5,
		label: 'Real-time Analytics',
		title:
			'Make data-driven decisions instantly with <strong>live dashboards</strong>.',
		description:
			'See your data update in real-time with beautiful dashboards. No data sampling means 100% accurate data for confident decision making.',
		icon: TrendingUp,
	},
	{
		id: 6,
		label: 'Data Ownership',
		title: 'Full control of your <strong>valuable business data</strong>.',
		description:
			'Your data stays yours. Export raw data, integrate with existing tools, and maintain complete control over your analytics.',
		icon: Users,
	},
	{
		id: 7,
		label: 'Energy Efficient',
		title:
			'Up to 10x more eco-friendly with <strong>lower carbon footprint</strong>.',
		description:
			'Reduce your environmental impact with our energy-efficient analytics platform while maintaining powerful insights.',
		icon: Globe2Icon,
	},
	{
		id: 8,
		label: '100% Transparency',
		title: 'Fully transparent, <strong>no hidden fees or data games</strong>.',
		description:
			'Clear pricing, open about what data we collect, and honest about our limitations. No vendor lock-in, export your data anytime, and only pay for what you actually use.',
		icon: Code,
	},
	{
		id: 9,
		label: 'Lightweight',
		title:
			'Lightweight, <strong>no cookies, no fingerprinting, no consent needed</strong>.',
		description:
			"Databuddy is lightweight, no cookies, no fingerprinting, no consent needed. It's GDPR compliant out of the box.",
		icon: Code,
	},
];

export default function Features() {
	return (
		<div className="-pr-2 relative mx-auto rounded-none border-border bg-background/95 font-geist md:w-10/12 md:border-[1.2px] md:border-b-0 md:border-l-0">
			<div className="w-full md:mx-0">
				{/* Why We Exist Section */}
				<div className="border-border border-t-[1.2px] border-l-[1.2px] p-10 pb-2 md:border-t-0">
					<div className="my-1 flex items-center gap-2">
						<AlertTriangle className="h-4 w-4 text-muted-foreground" />
						<p className="text-muted-foreground">Why We Exist</p>
					</div>
					<div className="mt-2">
						<div className="max-w-full">
							<div className="flex gap-3">
								<p className="max-w-lg font-normal text-foreground text-xl tracking-tighter md:text-2xl">
									Most analytics tools are either:
								</p>
							</div>
						</div>
					</div>
				</div>

				<div className="relative grid grid-cols-1 border-border border-t-[1.2px] md:grid-cols-3 md:grid-rows-1">
					<div className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-0 z-10 hidden w-full select-none grid-cols-3 md:grid">
						<Plus className="ml-auto h-8 w-8 translate-x-[16.5px] translate-y-[.5px] text-muted-foreground" />
						<Plus className="ml-auto h-8 w-8 translate-x-[16.5px] translate-y-[.5px] text-muted-foreground" />
					</div>
					{whyWeExist.map((item) => (
						<div
							className={cn(
								'flex transform-gpu flex-col justify-center border-border border-t-[1.2px] border-l-[1.2px] p-10 md:min-h-[240px] md:border-t-0'
							)}
							key={item.id}
						>
							<div className="my-1 flex items-center gap-2">
								<item.icon className="h-4 w-4 text-muted-foreground" />
								<p className="text-muted-foreground">{item.label}</p>
							</div>
							<div className="mt-2">
								<div className="max-w-full">
									<div className="flex gap-3">
										<p
											className="max-w-lg font-normal text-foreground text-xl tracking-tighter md:text-2xl"
											// biome-ignore lint/security/noDangerouslySetInnerHtml: false positive
											dangerouslySetInnerHTML={{ __html: item.title }}
										/>
									</div>
								</div>
								<p className="mt-2 text-left text-muted-foreground text-sm">
									{item.description}
								</p>
							</div>
						</div>
					))}
				</div>

				{/* What You Get Section */}
				<div className="border-border border-t-[1.2px] border-l-[1.2px] p-10 pb-2">
					<div className="my-1 flex items-center gap-2">
						<Package className="h-4 w-4 text-muted-foreground" />
						<p className="text-muted-foreground">What You Get</p>
					</div>
					<div className="mt-2">
						<div className="max-w-full">
							<div className="flex gap-3">
								<p className="max-w-lg font-normal text-foreground text-xl tracking-tighter md:text-2xl">
									Everything you need to understand your users:
								</p>
							</div>
						</div>
					</div>
				</div>

				<div className="relative grid grid-cols-1 border-border border-t-[1.2px] md:grid-cols-3 md:grid-rows-1">
					<div className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-0 z-10 hidden w-full select-none grid-cols-3 md:grid">
						<Plus className="ml-auto h-8 w-8 translate-x-[16.5px] translate-y-[.5px] text-muted-foreground" />
						<Plus className="ml-auto h-8 w-8 translate-x-[16.5px] translate-y-[.5px] text-muted-foreground" />
					</div>
					{whatYouGet.map((item) => (
						<div
							className={cn(
								'flex transform-gpu flex-col justify-center border-border border-t-[1.2px] border-b-[1.2px] border-l-[1.2px] p-10 md:min-h-[240px] md:border-t-0'
							)}
							key={item.id}
						>
							<div className="my-1 flex items-center gap-2">
								<item.icon className="h-4 w-4 text-muted-foreground" />
								<p className="text-muted-foreground">{item.label}</p>
							</div>
							<div className="mt-2">
								<div className="max-w-full">
									<div className="flex gap-3">
										<p
											className="max-w-lg font-normal text-foreground text-xl tracking-tighter md:text-2xl"
											// biome-ignore lint/security/noDangerouslySetInnerHtml: false positive
											dangerouslySetInnerHTML={{ __html: item.title }}
										/>
									</div>
								</div>
								<p className="mt-2 text-left text-muted-foreground text-sm">
									{item.description}
								</p>
							</div>
						</div>
					))}
				</div>

				{/* For Who Section */}
				<div className="border-border border-t-[1.2px] border-l-[1.2px] p-10 pb-2">
					<div className="my-1 flex items-center gap-2">
						<Users className="h-4 w-4 text-muted-foreground" />
						<p className="text-muted-foreground">For Who?</p>
					</div>
					<div className="mt-2">
						<div className="max-w-full">
							<div className="flex gap-3">
								<p className="max-w-lg font-normal text-foreground text-xl tracking-tighter md:text-2xl">
									If you're a developer, indie hacker, or small team who wants
									to:
								</p>
							</div>
						</div>
						<p className="mt-2 text-left text-muted-foreground text-sm">
							• Stop blindly shipping features
							<br />• Stay GDPR-compliant without paying a lawyer
							<br />• Avoid tracking your users like it's 2010
							<br />
							<br />
							Then Databuddy is for you.
						</p>
					</div>
				</div>

				<div className="hidden w-full border-l md:block">
					<Testimonials />
				</div>
			</div>
		</div>
	);
}
