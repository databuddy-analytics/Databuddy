'use client';

import dynamic from 'next/dynamic';
import DemoContainer from './demo';
import { SciFiButton } from './scifi-btn';
import { Spotlight } from './spotlight';

const WorldMap = dynamic(() => import('./map').then((m) => m.WorldMap), {
	ssr: false,
	loading: () => null,
});

export default function Hero() {
	const handleGetStarted = () => {
		const newWindow = window.open(
			'https://app.databuddy.cc/login',
			'_blank',
			'noopener,noreferrer'
		);
		if (
			!newWindow ||
			newWindow.closed ||
			typeof newWindow.closed === 'undefined'
		) {
			// Handle popup blocked case if needed
		}
	};

	return (
		<section className="relative flex min-h-[100svh] w-full flex-col items-center overflow-hidden">
			<Spotlight transform="translateX(-60%) translateY(-50%)" />

			<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
				<div className="grid grid-cols-1 items-center gap-8 pt-12 pb-6 sm:pt-16 sm:pb-8 lg:grid-cols-2 lg:gap-12 lg:pt-20 lg:pb-12 xl:gap-16">
					{/* Text Content */}
					<div className="order-2 flex flex-col items-center gap-6 text-center lg:order-1 lg:items-start lg:gap-8 lg:text-left">
						<h1 className="text-balance font-semibold text-3xl leading-tight tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-[72px]">
							<span className="block whitespace-normal">
								Privacy <span className="text-muted-foreground">first</span>
							</span>
							<span className="block whitespace-normal">
								Analytics for{' '}
								<span className="text-muted-foreground">devs</span>
							</span>
						</h1>

						<p className="max-w-prose text-balance font-medium text-muted-foreground text-sm leading-relaxed tracking-tight sm:text-base lg:text-lg">
							Track users, not identities. Get fast, accurate insights with zero
							cookies and 100% GDPR compliance.
						</p>

						<div className="flex w-full justify-center pt-2 lg:justify-start">
							<SciFiButton
								className="w-full sm:w-auto"
								onClick={handleGetStarted}
							>
								GET STARTED
							</SciFiButton>
						</div>
					</div>

					{/* Map Visualization */}
					<div className="order-1 flex w-full justify-center lg:order-2 lg:justify-end">
						<div className="w-full max-w-lg lg:max-w-none">
							<WorldMap />
						</div>
					</div>
				</div>
			</div>

			{/* Demo Container */}
			<div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8 lg:pb-12">
				<DemoContainer />
			</div>
		</section>
	);
}
