'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';

interface ErrorBoundaryProps {
	children: React.ReactNode;
	fallback?: React.ReactNode;
}

export function ErrorBoundary({ children, fallback }: ErrorBoundaryProps) {
	const [hasError, setHasError] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		const errorHandler = (error: ErrorEvent) => {
			console.error('Error caught by boundary:', error);
			setError(error.error);
			setHasError(true);
		};

		window.addEventListener('error', errorHandler);
		return () => window.removeEventListener('error', errorHandler);
	}, []);

	if (hasError) {
		if (fallback) {
			return <>{fallback}</>;
		}

		return (
			<div className="flex h-full min-h-[400px] w-full items-center justify-center p-6">
				<Card className="w-full max-w-lg border-destructive/20 shadow-lg">
					<CardHeader className="border-b bg-destructive/5 pb-3">
						<CardTitle className="flex items-center gap-2 text-destructive">
							<AlertTriangle className="h-5 w-5" />
							Something went wrong
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-6">
						<div className="space-y-4">
							<p className="text-muted-foreground text-sm">
								We encountered an error while trying to display this content.
								This could be due to a temporary issue or a problem with the
								data.
							</p>
							{error && (
								<div className="max-h-[150px] overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
									{error.toString()}
								</div>
							)}
						</div>
					</CardContent>
					<CardFooter className="flex justify-end gap-2 border-t pt-4">
						<Button
							className="gap-1.5"
							onClick={() => window.location.reload()}
							size="sm"
							variant="outline"
						>
							<RefreshCw className="h-3.5 w-3.5" />
							Reload Page
						</Button>
						<Button
							onClick={() => {
								setHasError(false);
								setError(null);
							}}
							size="sm"
						>
							Try Again
						</Button>
					</CardFooter>
				</Card>
			</div>
		);
	}

	return <>{children}</>;
}
