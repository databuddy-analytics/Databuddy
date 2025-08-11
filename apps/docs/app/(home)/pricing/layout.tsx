import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { StructuredData } from '@/components/structured-data';
import { RAW_PLANS } from '@/app/(home)/pricing/data';
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

export default async function Layout({ children }: { children: ReactNode }) {
	return <>
		<StructuredData
			page={{
				title,
				description:
					'Databuddy offers a free tier with fair overage pricing. Scale your analytics to 100M events without compromising on privacy or performance.',
				url,
				datePublished: new Date('2025-06-03').toISOString(),
				dateModified: new Date('2025-06-03').toISOString(),
			}}
			elements={[
				{
					type: 'softwareOffers',
					name: 'Databuddy Analytics Pricing',
					plans: RAW_PLANS,
				},
			]}
		/>
		{children}
	</>;
}
