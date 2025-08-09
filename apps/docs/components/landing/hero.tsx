'use client';

import DemoContainer from './demo';
import { WorldMap } from './map';
import { SciFiButton } from './scifi-btn';
import { Spotlight } from './spotlight';

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
		<section className="relative flex min-h-screen w-full flex-col items-center overflow-hidden">
			<Spotlight transform="translateX(-60%) translateY(-50%)" />

			<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
				<div className="grid grid-cols-1 items-center gap-8 pt-16 pb-8 lg:grid-cols-2 lg:gap-12 lg:pt-20 lg:pb-12 xl:gap-16">
					{/* Text Content */}
					<div className="order-2 flex flex-col gap-6 lg:order-1 lg:gap-8">
						<h1 className="font-semibold text-4xl leading-none tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-[72px]">
							Privacy <span className="text-muted-foreground">first</span>
							<br />
							Analytics for <span className="text-muted-foreground">devs</span>
						</h1>

						<p className="max-w-lg font-medium text-muted-foreground text-sm leading-relaxed tracking-tight sm:text-base lg:text-lg">
							Track users, not identities. Get fast, accurate insights with zero
							cookies and 100% GDPR compliance.
						</p>

						<div className="pt-2">
							<SciFiButton onClick={handleGetStarted}>GET STARTED</SciFiButton>
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
