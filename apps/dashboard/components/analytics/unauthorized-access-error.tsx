'use client';

import { WarningIcon } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';

export function UnauthorizedAccessError() {
	const router = useRouter();

	return (
		<Card className="mx-auto my-8 w-full max-w-lg border-red-200 bg-red-50 dark:border-red-800/50 dark:bg-red-950/20">
			<CardHeader className="pb-3">
				<div className="flex items-center gap-3">
					<div className="rounded-full bg-red-100 p-2.5 dark:bg-red-900/30">
						<WarningIcon
							className="h-6 w-6 text-red-600 dark:text-red-400"
							size={24}
							weight="fill"
						/>
					</div>
					<div>
						<CardTitle className="text-lg">Access Denied</CardTitle>
						<CardDescription className="mt-1">
							You don't have permission to view this website's analytics.
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent className="pt-0">
				<p className="mb-5 text-muted-foreground text-sm">
					Contact the website owner if you think this is an error.
				</p>
				<Button
					className="w-full sm:w-auto"
					onClick={() => router.push('/websites')}
					variant="destructive"
				>
					Back to Websites
				</Button>
			</CardContent>
		</Card>
	);
}
