'use client';

import { SpinnerIcon } from '@phosphor-icons/react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';

const UsersList = dynamic(
	() =>
		import('./_components/users-list').then((mod) => ({
			default: mod.UsersList,
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

export default function UsersPage() {
	const { id: websiteId } = useParams();

	return <UsersList websiteId={websiteId as string} />;
}
