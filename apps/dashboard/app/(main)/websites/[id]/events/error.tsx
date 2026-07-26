"use client";

import { useParams, useRouter } from "next/navigation";
import {
	ArrowCounterClockwiseIcon,
	ArrowLeftIcon,
	LightningIcon,
} from "@databuddy/ui/icons";
import { Button } from "@databuddy/ui";

export default function EventsError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	const router = useRouter();
	const params = useParams();
	const websiteId = params.id as string;

	return (
		<div className="flex h-full flex-col items-center justify-center gap-4 p-8">
			<div className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10">
				<LightningIcon className="size-6 text-destructive" weight="fill" />
			</div>
			<div className="max-w-sm space-y-2 text-center">
				<h2 className="font-semibold text-lg">Error loading events</h2>
				<p className="text-balance text-muted-foreground text-sm">
					We couldn&apos;t load events for this website. Try again or return to
					the overview.
				</p>
				{error.digest && (
					<p className="font-mono text-muted-foreground text-xs">
						Error ID: {error.digest}
					</p>
				)}
			</div>
			<div className="flex gap-2">
				<Button onClick={reset} variant="secondary">
					<ArrowCounterClockwiseIcon className="mr-2 size-4" weight="duotone" />
					Try again
				</Button>
				<Button
					onClick={() => router.push(`/websites/${websiteId}`)}
					variant="ghost"
				>
					<ArrowLeftIcon className="mr-2 size-4" weight="duotone" />
					Back to overview
				</Button>
			</div>
		</div>
	);
}
