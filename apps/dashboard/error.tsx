'use client';

import { ArrowClockwiseIcon, WarningIcon } from '@phosphor-icons/react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type ErrorPageProps = {
	error: Error & { digest?: string };
	reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
	useEffect(() => {
		console.error(error);
	}, [error]);

	return (
		<div className="flex min-h-screen items-center justify-center bg-muted/20">
			<Card className="w-full max-w-lg border-destructive/50 shadow-lg">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-destructive">
						<WarningIcon className="h-6 w-6" size={24} weight="duotone" />
						Something went wrong
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4 pt-6">
					<p className="text-muted-foreground text-sm">
						We encountered an unexpected error. Please try again. If the problem
						persists, please contact support.
					</p>
					<pre className="max-h-[150px] overflow-auto rounded bg-muted p-3 font-mono text-xs">
						{error.message || 'An unknown error occurred.'}
					</pre>
					<Button onClick={() => reset()} size="sm">
						<ArrowClockwiseIcon className="mr-2 h-4 w-4" size={16} />
						Try again
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
