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
					<div className="order-2 flex flex-col text-center items-center gap-6 lg:order-1 lg:items-start lg:gap-8 lg:text-left">
						<div className="self-center lg:self-start">
    						<div className="inline-flex items-center rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow backdrop-blur">
								<span>Rejected by</span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="14" height="14" className="mx-1 inline-block align-[-2px]" aria-hidden="true" focusable="false">
                  <title>Y Combinator logo</title>
									<path d="M0 0h32v32H0z" fill="#f26625"/>
									<path d="M14.933 18.133L9.387 7.787h2.56l3.2 6.507c0 .107.107.213.213.32s.107.213.213.427l.107.107v.107c.107.213.107.32.213.533.107.107.107.32.213.427.107-.32.32-.533.427-.96.107-.32.32-.64.533-.96l3.2-6.507h2.347L17.067 18.24v6.613h-2.133z" fill="#fff"/>
									<path d="M-2.78-46.732h30v30h-30z" fill="#f26625"/>
									<path d="M11.22-29.732l-5.2-9.7h2.4l3 6.1c0 .1.1.2.2.3s.1.2.2.4l.1.1v.1c.1.2.1.3.2.5.1.1.1.3.2.4.1-.3.3-.5.4-.9.1-.3.3-.6.5-.9l3-6.1h2.2l-5.2 9.8v6.2h-2z" fill="#fff"/>
									<path d="M40.92-40.932c1.5 0 2.8.4 3.8 1.2l-1 1.2c-.9-.6-1.8-1-2.9-1-1.7 0-3 .9-3.7 2.6-.4 1-.6 2.3-.6 4 0 1.3.2 2.4.5 3.2.8 1.9 2.1 2.8 4.1 2.8 1.1 0 2.1-.3 3-1l1 1.3a7.87 7.87 0 0 1-4.2 1.2c-1.8 0-3.3-.7-4.5-2.2-1.2-1.4-1.7-3.3-1.7-5.6s.6-4.1 1.8-5.6c1.1-1.3 2.6-2.1 4.4-2.1zm5.7 9.9c0-1.8.4-3.2 1.3-4.2s2-1.6 3.4-1.6c1.6 0 2.9.6 3.8 1.9.7 1 1 2.4 1 4.1 0 2-.6 3.6-1.7 4.6-.8.7-1.8 1.1-3 1.1-1.5 0-2.6-.5-3.5-1.6-.9-1-1.3-2.5-1.3-4.3zm7-2.9c-.5-.9-1.2-1.4-2.3-1.4s-1.8.4-2.3 1.2c-.4.6-.5 1.6-.5 2.9 0 1.7.2 2.9.7 3.6s1.2 1.1 2.2 1.1c1.2 0 2-.6 2.4-1.7.2-.6.3-1.4.3-2.4.1-1.5-.1-2.6-.5-3.3zm5.7.2c0-1.1-.1-2-.4-2.7l1.7-.4c.3.5.4 1.1.4 1.6v.1c.4-.4.8-.8 1.4-1.1.7-.4 1.3-.6 1.9-.6.9 0 1.7.4 2.2 1.1.1.2.3.5.4.7 1.2-1.2 2.3-1.8 3.5-1.8.8 0 1.5.3 2 .8.5.6.8 1.3.8 2.1v8.3h-1.8v-8.2c0-1.1-.5-1.6-1.4-1.6-.5 0-1.1.2-1.6.6-.2.2-.6.5-1.1.9l-.2.2v8.1h-1.9v-7.8c0-.7-.1-1.2-.3-1.4-.3-.3-.6-.4-1.1-.4-.8 0-1.7.5-2.8 1.5v8.2h-1.7zm17-7.6l1.8-.4c.2.8.3 1.7.3 2.8v3.7c1-1 2.1-1.5 3.2-1.5 1.3 0 2.4.5 3.1 1.5.8 1 1.2 2.4 1.2 4.1 0 1.8-.4 3.2-1.2 4.3s-1.9 1.6-3.2 1.6a3.53 3.53 0 0 1-1.7-.4c-.6-.3-1-.6-1.3-1l-.3 1.2h-1.7c.2-.5.3-1.4.3-2.8v-10.5c-.1-1.2-.2-2.1-.5-2.6zm2.9 6.8c-.3.2-.6.5-.8.8v5.7c.7.9 1.6 1.3 2.7 1.3.9 0 1.6-.3 2-1 .5-.8.8-1.9.8-3.5 0-1.4-.2-2.4-.7-3-.4-.6-1.1-.9-2.1-.9-.6-.1-1.3.1-1.9.6zm9.3-5.4c0-.4.1-.7.4-1s.6-.4 1-.4.7.1 1 .4.4.6.4 1-.1.7-.4 1-.6.4-1 .4-.7-.1-1-.4-.4-.6-.4-1zm.4 14.4v-11l1.8-.3v11.3zm5.7-8.2c0-.8 0-1.3-.1-1.5 0-.3-.2-.6-.4-1.1l1.7-.5a3.53 3.53 0 0 1 .4 1.7c1.1-1.1 2.3-1.7 3.5-1.7.6 0 1.1.1 1.6.4s.9.7 1.1 1.2c.2.4.3.8.3 1.3v8.4h-1.7v-7.5c0-.9-.1-1.5-.4-1.8s-.7-.5-1.2-.5c-.4 0-1 .2-1.6.5s-1.1.7-1.5 1.1v8.2h-1.7zm12.1-.4l-.9-1.2c1.5-1 3-1.5 4.6-1.5s2.6.6 3.1 1.7c.2.4.2 1 .2 1.9v.6l-.1 3.6v.5c0 .6 0 1 .1 1.3.1.4.4.7.8.9l-.9 1.2c-.8-.3-1.3-.8-1.5-1.6-1 1-2.1 1.5-3.2 1.5s-2-.3-2.7-.9c-.6-.5-.9-1.3-.9-2.3 0-1.3.5-2.2 1.5-2.9s2.5-1 4.3-1h.8v-.8c0-.9-.1-1.5-.4-1.7-.4-.4-.8-.6-1.5-.6-.6 0-1.3.2-2.1.5l-1.2.8zm5.3 5.9l.1-2.9h-.9c-1.6 0-2.6.3-3.2.9-.4.4-.6 1-.6 1.8 0 1.3.6 2 1.9 2 1.2-.1 2.1-.7 2.7-1.8zm7.4-8.3h2.8l-.5 1.4h-2.3v7.1c0 .6.1 1 .3 1.3.2.2.6.4 1.1.4.4 0 .8-.1 1.1-.2l.2 1.1c-.6.3-1.2.4-1.9.4-1.7 0-2.5-.8-2.5-2.5v-7.6h-1.5v-1.4h1.4v-.2c0-.2.1-1 .2-2.3v-.3l1.8-.4c-.2 1.2-.2 2.3-.2 3.2zm4.6 5.5c0-1.8.4-3.2 1.3-4.2.8-1 2-1.6 3.4-1.6 1.6 0 2.9.6 3.8 1.9.7 1 1 2.4 1 4.1 0 2-.6 3.6-1.7 4.6-.8.7-1.8 1.1-3 1.1-1.5 0-2.6-.5-3.5-1.6-.8-1-1.3-2.5-1.3-4.3zm7.1-2.9c-.5-.9-1.2-1.4-2.3-1.4s-1.8.4-2.3 1.2c-.4.6-.5 1.6-.5 2.9 0 1.7.2 2.9.7 3.6s1.2 1.1 2.2 1.1c1.2 0 2-.6 2.4-1.7.2-.6.3-1.4.3-2.4 0-1.5-.2-2.6-.5-3.3zm5.7 0c0-1-.1-1.8-.4-2.4l1.7-.5a3.53 3.53 0 0 1 .4 1.7v.2c.9-1.2 1.9-1.8 3.1-1.8.2 0 .4 0 .6.1l-.7 1.9c-.2-.1-.4-.1-.5-.1-.4 0-.9.1-1.3.4s-.8.6-1 1a3.73 3.73 0 0 0-.2 1.2v6.9h-1.7z" fill="#f26625"/>
								</svg>
								<span>Combinator</span>
							</div>
						</div>
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
