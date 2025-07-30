'use client';

import { SpinnerIcon } from '@phosphor-icons/react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';

const SessionsList = dynamic(
	() => import('./_components').then((mod) => ({ default: mod.SessionsList })),
	{
		loading: () => (
			<div className="flex items-center justify-center p-8">
				<SpinnerIcon className="h-6 w-6 animate-spin" />
			</div>
		),
		ssr: false,
	}
);

export default function SessionsPage() {
	const { id: websiteId } = useParams();

	return (
		<div className="p-3 sm:p-4 lg:p-6">
			<SessionsList websiteId={websiteId as string} />
		</div>
	);
}
