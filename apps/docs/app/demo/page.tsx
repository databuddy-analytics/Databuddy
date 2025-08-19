import { ArrowLeftIcon } from '@phosphor-icons/react/ssr';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
	title: 'Live Demo | Databuddy',
	description:
		'Experience Databuddy analytics in action with our live demo dashboard. See real-time analytics, insights, and privacy-first tracking.',
};

export default function DemoPage() {
	return (
		<div className="fixed inset-0 h-full w-full">
			{/* Floating Navigation Header */}
			<div className="absolute top-4 right-4 left-4 z-50 flex items-center justify-between">
				<Link
					className="group flex items-center gap-2 rounded border border-border bg-card/90 px-4 py-2 font-medium text-sm shadow-lg backdrop-blur-sm transition-colors hover:bg-card"
					href="/"
				>
					<ArrowLeftIcon
						className="group-hover:-translate-x-0.5 h-4 w-4 text-foreground transition-transform"
						weight="fill"
					/>
					<span className="text-foreground">Back to Home</span>
				</Link>

				<div className="flex items-center gap-2">
					<div className="flex items-center gap-2 rounded border border-border bg-card/90 px-3 py-2 shadow-lg backdrop-blur-sm">
						<div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
						<span className="font-medium text-foreground text-xs">
							Live Demo
						</span>
					</div>

					<Link
						className="group flex items-center gap-2 rounded border border-border bg-primary/90 px-4 py-2 font-medium text-primary-foreground text-sm shadow-lg backdrop-blur-sm transition-colors hover:bg-primary"
						href="https://app.databuddy.cc/login"
						rel="noopener"
						target="_blank"
					>
						<span>Get Started Free</span>
						<ArrowLeftIcon
							className="h-4 w-4 rotate-180 transition-transform group-hover:translate-x-0.5"
							weight="fill"
						/>
					</Link>
				</div>
			</div>

			{/* Demo iframe */}
			<iframe
				allow="fullscreen"
				className="h-full w-full border-0"
				loading="lazy"
				src="https://app.databuddy.cc/demo/OXmNQsViBT-FOS_wZCTHc"
				style={{
					colorScheme: 'light dark',
				}}
				title="Databuddy Analytics Demo Dashboard"
			/>
		</div>
	);
}
