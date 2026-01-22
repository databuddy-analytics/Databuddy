import { EventsPageContent } from"./_components/events-page-content";

export default function EventsPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	return <EventsPageContent params={params} />;
}
