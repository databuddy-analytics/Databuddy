'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { JsonNode } from './json-viewer';
import type { BatchQueryResponse } from './types';

interface QueryResultsProps {
	isLoading: boolean;
	result: BatchQueryResponse | null;
}

export function QueryResults({ isLoading, result }: QueryResultsProps) {
	return (
		<div className="flex min-h-0 flex-col space-y-4 lg:w-1/2">
			<div className="flex items-center justify-between">
				<h3 className="font-medium text-lg">Response</h3>
				{result && (
					<Badge
						className="rounded-none text-xs"
						variant={result.success ? 'default' : 'destructive'}
					>
						{result.success ? 'Success' : 'Failed'}
					</Badge>
				)}
			</div>

			<Card className="relative flex-1 border border-border/40 bg-white transition-all duration-200 hover:border-border/60 hover:shadow-sm dark:bg-neutral-900">
				<CardContent className="h-80 p-0 lg:h-96">
					<ScrollArea className="h-full">
						<div className="select-text break-words p-4 font-mono text-[13px] leading-6 tracking-tight sm:text-[13.5px]">
							{isLoading ? (
								<div className="space-y-2">
									<Skeleton className="h-4 w-5/6" />
									<Skeleton className="h-4 w-2/3" />
									<Skeleton className="h-4 w-11/12" />
									<Skeleton className="h-4 w-3/4" />
									<Skeleton className="h-4 w-1/2" />
									<Skeleton className="h-4 w-10/12" />
									<Skeleton className="h-4 w-8/12" />
									<Skeleton className="h-4 w-9/12" />
								</div>
							) : result ? (
								<JsonNode data={result} />
							) : (
								<div className="text-gray-400" />
							)}
						</div>
					</ScrollArea>
				</CardContent>
			</Card>
		</div>
	);
}
