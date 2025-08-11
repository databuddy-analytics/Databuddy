import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { RAW_PLANS } from '@/app/(home)/pricing/data';
import { StructuredData } from '@/components/structured-data';

const title =
	'Databuddy Pricing — Free tier, fair overage, scale to 100M events';
const url = 'https://www.databuddy.cc/pricing';

export const metadata: Metadata = {
	title,
	openGraph: {
		title,
		url,
	},
};

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<>
			<StructuredData
				elements={[
					{
						type: 'softwareOffers',
						name: 'Databuddy Analytics Pricing',
						plans: RAW_PLANS,
					},
				]}
				page={{
					title,
					description:
						'Databuddy offers a free tier with fair overage pricing. Scale your analytics to 100M events without compromising on privacy or performance.',
					url,
					datePublished: new Date('2025-06-03').toISOString(),
					dateModified: new Date('2025-06-03').toISOString(),
				}}
			/>
			{children}
		</>
	);
}
