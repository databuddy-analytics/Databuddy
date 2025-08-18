'use client';

import { useAtom } from 'jotai';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useWebsite } from '@/hooks/use-websites';
import {
	dateRangeAtom,
	websiteDataAtom,
	websiteIdAtom,
} from '@/stores/jotai/assistantAtoms';

const AIAssistantMain = dynamic(
	() => import('./components/ai-assistant-main'),
	{
		loading: () => <AIAssistantLoadingSkeleton />,
		ssr: false,
	}
);

function AIAssistantLoadingSkeleton() {
	return (
		<div className="flex h-full flex-col gap-3">
			<div className="flex flex-1 gap-3 overflow-hidden">
				<div className="flex flex-[2_2_0%] flex-col overflow-hidden rounded border bg-background shadow-sm">
					<div className="flex-shrink-0 border-b p-3">
						<Skeleton className="mb-1 h-5 w-32" />
						<Skeleton className="h-3 w-48" />
					</div>
					<div className="flex-1 space-y-3 overflow-y-auto p-3">
						<div className="flex gap-2">
							<Skeleton className="h-8 w-8 flex-shrink-0 rounded-full" />
							<Skeleton className="h-16 w-3/4 rounded" />
						</div>
						<div className="ml-auto flex flex-row-reverse gap-2">
							<Skeleton className="h-8 w-8 flex-shrink-0 rounded-full" />
							<Skeleton className="h-10 w-1/2 rounded" />
						</div>
					</div>
					<div className="flex-shrink-0 border-t p-3">
						<Skeleton className="h-9 w-full rounded" />
					</div>
				</div>
				<div className="flex flex-[3_3_0%] flex-col overflow-hidden rounded border bg-background shadow-sm">
					<div className="flex-shrink-0 border-b p-3">
						<Skeleton className="mb-1 h-5 w-32" />
					</div>
					<div className="flex-1 p-3">
						<Skeleton className="h-full w-full rounded" />
					</div>
				</div>
			</div>
		</div>
	);
}

export default function AssistantPage() {
	const { id } = useParams();
	const { data: websiteData, isLoading } = useWebsite(id as string);
	const [, setWebsiteId] = useAtom(websiteIdAtom);
	const [, setWebsiteData] = useAtom(websiteDataAtom);
	const [, setDateRange] = useAtom(dateRangeAtom);

	useEffect(() => {
		if (id) {
			setWebsiteId(id as string);
		}
		if (websiteData) {
			setWebsiteData(websiteData);
		}
		setDateRange({
			start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
			end_date: new Date().toISOString(),
			granularity: 'daily',
		});
	}, [id, setWebsiteId, websiteData, setWebsiteData, setDateRange]);

	if (isLoading || !websiteData) {
		return <AIAssistantLoadingSkeleton />;
	}

	return <AIAssistantMain />;
}
