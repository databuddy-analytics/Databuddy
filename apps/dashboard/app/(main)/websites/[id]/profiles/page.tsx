'use client';

import { SpinnerIcon } from '@phosphor-icons/react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';

const ProfilesList = dynamic(
	() =>
		import('./_components/profiles-list').then((mod) => ({
			default: mod.ProfilesList,
		})),
	{
		loading: () => (
			<div className="flex items-center justify-center p-8">
				<SpinnerIcon className="h-6 w-6 animate-spin" />
			</div>
		),
		ssr: false,
	}
);

export default function ProfilesPage() {
	const { id: websiteId } = useParams();

	return (
		<div className="mt-6">
			<ProfilesList websiteId={websiteId as string} />
		</div>
	);
}
