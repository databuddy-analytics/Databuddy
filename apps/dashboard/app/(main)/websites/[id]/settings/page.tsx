import { redirect } from 'next/navigation';

interface SettingsPageProps {
	params: { id: string };
}

export default function SettingsPage({ params }: SettingsPageProps) {
	const websiteId = params.id;
	redirect(`/websites/${websiteId}/settings/general`);
}
