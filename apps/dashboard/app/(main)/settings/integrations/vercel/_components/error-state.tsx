import { WarningIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';

interface ErrorStateProps {
	message: string;
	onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
	return (
		<div className="flex h-64 items-center justify-center">
			<div className="text-center">
				<WarningIcon className="mx-auto h-12 w-12 text-destructive" />
				<h3 className="mt-2 font-medium text-foreground text-sm">{message}</h3>
				<p className="mt-1 text-muted-foreground text-sm">
					There was an issue loading your Vercel data. Please try again.
				</p>
				{onRetry && (
					<Button className="mt-4" onClick={onRetry} variant="outline">
						Try Again
					</Button>
				)}
			</div>
		</div>
	);
}
