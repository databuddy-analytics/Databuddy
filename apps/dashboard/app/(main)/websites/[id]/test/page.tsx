'use client';

import { useParams } from 'next/navigation';
import { CustomEventsWithProperties } from './components/custom-events-with-properties';

export default function TestPage() {
	const params = useParams();
	const websiteId = params.id as string;

	return (
		<div className="p-3 sm:p-4 lg:p-6">
			<div className="mb-6">
				<h1 className="mb-2 font-bold text-2xl text-foreground">
					Custom Events Properties Test
				</h1>
				<p className="text-muted-foreground">
					Testing custom events with JSON properties parsing and display
				</p>
			</div>

			<CustomEventsWithProperties websiteId={websiteId} />
		</div>
	);
}
