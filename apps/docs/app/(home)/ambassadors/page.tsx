import type { Metadata } from 'next';
import { Footer } from '@/components/footer';
import Section from '@/components/landing/section';
import { Spotlight } from '@/components/landing/spotlight';
import AmbassadorForm from './ambassador-form';
import AmbassadorHero from './ambassador-hero';
import AmbassadorRewards from './ambassador-rewards';

export const metadata: Metadata = {
	title: 'Become an Ambassador | Databuddy',
	description:
		'Join the Databuddy Ambassador Program and help us build the future of privacy-first analytics',
};

export default function AmbassadorsPage() {
	return (
		<div className="overflow-hidden">
			<Spotlight transform="translateX(-60%) translateY(-50%)" />

			{/* Hero Section */}
			<Section className="overflow-hidden" customPaddings id="ambassador-hero">
				<AmbassadorHero />
			</Section>

			{/* Form Section */}
			<Section
				className="border-border border-t bg-background/30"
				id="ambassador-form"
			>
				<div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
					<AmbassadorForm />
				</div>
			</Section>

			{/* Rewards Section */}
			<Section
				className="border-border border-t border-b bg-background/50"
				id="ambassador-rewards"
			>
				<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
					<AmbassadorRewards />
				</div>
			</Section>

			{/* Gradient Divider */}
			<div className="w-full">
				<div className="mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-border/30 to-transparent" />
			</div>

			{/* Footer Section */}
			<Footer />

			{/* Final Gradient Divider */}
			<div className="w-full">
				<div className="mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-border/30 to-transparent" />
			</div>
		</div>
	);
}
