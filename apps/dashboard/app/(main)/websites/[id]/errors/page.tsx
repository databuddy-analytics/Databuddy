import { ErrorsPageContent } from "./_components/errors-page-content";

export default function ErrorsPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	return <ErrorsPageContent params={params} />;
}
