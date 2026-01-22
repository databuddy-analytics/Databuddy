import { redirect } from"next/navigation";

interface SettingsPageProps {
	params: Promise<{ id: string }>;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
	const { id: websiteId } = await params;
	redirect(`/websites/${websiteId}/settings/general`);
}
