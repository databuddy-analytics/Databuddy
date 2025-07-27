'use client';

import { ArrowRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import LiquidChrome from '../bits/liquid';

const ctaItems = [
	{
		title: 'Get started',
		description:
			'Drop your site in and see what your users are doing in seconds',
		href: 'https://app.databuddy.cc',
		primary: true,
	},
	{
		title: 'Read Documentation',
		description: 'Learn how to integrate Databuddy with your tech stack.',
		href: '/docs',
		primary: false,
	},
];

export default function CTA() {
	return (
		<div className="-pr-2 relative mx-auto rounded-none border-border bg-background/95 font-geist md:w-10/12 md:border-[1.2px] md:border-b-0 md:border-l-0">
			<div className="w-full md:mx-0">
				{/* CTA grid */}
				<div className="relative grid grid-cols-1 border-border border-t-[1.2px] md:grid-cols-3 md:grid-rows-1">
					<div className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-0 z-10 hidden w-full select-none grid-cols-3 md:grid">
						<Plus className="ml-auto h-8 w-8 translate-x-[16.5px] translate-y-[.5px] text-muted-foreground" />
						<Plus className="ml-auto h-8 w-8 translate-x-[16.5px] translate-y-[.5px] text-muted-foreground" />
					</div>

					{ctaItems.map((item) => (
						<Link
							className={cn(
								'group flex transform-gpu flex-col justify-center border-border border-t-[1.2px] border-l-[1.2px] p-10 transition-colors hover:bg-muted/50 md:min-h-[240px] md:border-t-0'
							)}
							href={item.href}
							key={item.title}
							rel={
								item.href.startsWith('http') ? 'noopener noreferrer' : undefined
							}
							target={item.href.startsWith('http') ? '_blank' : undefined}
						>
							<div className="my-1 flex items-center gap-2">
								{item.primary ? (
									<div className="flex h-4 w-4 items-center justify-center rounded-sm bg-primary">
										<ArrowRight className="h-2 w-2 text-primary-foreground" />
									</div>
								) : (
									<div className="flex h-4 w-4 items-center justify-center rounded-sm border border-border">
										<ArrowRight className="h-2 w-2 text-muted-foreground" />
									</div>
								)}
								<p className="text-muted-foreground text-xs">
									{item.primary ? 'Try Now' : 'Learn More'}
								</p>
							</div>
							<div className="mt-2">
								<div className="max-w-full">
									<div className="flex items-center gap-3">
										<p
											className={cn(
												'max-w-lg font-medium text-foreground text-lg tracking-tight transition-colors group-hover:text-primary',
												item.primary && 'text-primary'
											)}
										>
											{item.title}
										</p>
										<ArrowRight className="h-4 w-4 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-primary" />
									</div>
								</div>
								<p className="mt-2 text-left text-muted-foreground text-sm">
									{item.description}
								</p>
							</div>
						</Link>
					))}
				</div>

				{/* Liquid Chrome CTA Section */}
				<div className="relative min-h-[400px] overflow-hidden border-border border-t-[1.2px] border-l-[1.2px]">
					{/* Liquid Chrome Background */}
					<div className="absolute inset-0 opacity-30">
						<LiquidChrome
							amplitude={0.4}
							frequencyX={2.5}
							frequencyY={1.8}
							interactive={false}
							speed={0.3}
						/>
					</div>

					{/* Gradient overlays for edge fading - theme aware */}
					<div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-background/80" />
					<div className="absolute inset-0 bg-gradient-to-b from-background/60 via-transparent to-background/60" />
					<div className="absolute inset-0 bg-gradient-to-tr from-background/40 via-transparent to-transparent" />
					<div className="absolute inset-0 bg-gradient-to-bl from-transparent via-transparent to-background/40" />

					<div className="relative z-10 h-full p-10">
						<div className="flex h-full w-full flex-col items-center justify-center gap-8 text-center">
							<div className="space-y-4">
								<h2 className="font-bold text-4xl text-foreground tracking-tight md:text-5xl">
									Ready to get started?
								</h2>
								<p className="mx-auto max-w-md text-lg text-muted-foreground">
									Join developers who've ditched Google Analytics for something
									better.
								</p>
							</div>

							<div className="flex flex-col items-center gap-4 sm:flex-row">
								<a
									className="inline-flex transform items-center justify-center rounded-xl bg-primary px-8 py-4 font-semibold text-base text-primary-foreground shadow-lg transition-all duration-200 hover:scale-105 hover:bg-primary/90 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
									data-button-type="primary-cta"
									data-destination="register"
									data-section="cta"
									data-track="cta-get-started-click"
									href="https://app.databuddy.cc"
								>
									Get started
									<ArrowRight className="ml-2 h-4 w-4" />
								</a>
							</div>

							<div className="flex items-center gap-8 text-muted-foreground text-sm opacity-60">
								<span>Rivo.gg</span>
								<span>Better-auth</span>
								<span>Confinity</span>
								<span>Wouldyoubot</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
