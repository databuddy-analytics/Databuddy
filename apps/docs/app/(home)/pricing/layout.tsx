import type { Metadata } from 'next';
import type { ReactNode } from 'react';

const title =
	'Databuddy Pricing — Free tier, fair overage, scale to 100M events';

export const metadata: Metadata = {
	title,
	openGraph: {
		title,
		url: 'https://www.databuddy.cc/pricing',
	},
};

export default async function Layout({ children }: { children: ReactNode }) {
	return <>{children}</>;
}
