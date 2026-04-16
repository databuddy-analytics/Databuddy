"use client";

import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { HouseIcon } from "@phosphor-icons/react";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function WebsiteError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	const router = useRouter();

	return (
		<div className="flex h-full flex-col items-center justify-center gap-4 p-8">
			<div className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10">
				<WarningCircleIcon className="size-6 text-destructive" weight="fill" />
			</div>
			<div className="max-w-sm space-y-2 text-center">
				<h2 className="font-semibold text-lg">Something went wrong</h2>
				<p className="text-muted-foreground text-sm">
					{error.message || "An error occurred while loading this page"}
				</p>
				{error.digest && (
					<p className="font-mono text-muted-foreground text-xs">
						Error ID: {error.digest}
					</p>
				)}
			</div>
			<div className="flex gap-2">
				<Button onClick={reset} variant="outline">
					<ArrowCounterClockwiseIcon className="mr-2 size-4" weight="duotone" />
					Try again
				</Button>
				<Button onClick={() => router.push("/websites")} variant="ghost">
					<HouseIcon className="mr-2 size-4" weight="duotone" />
					Back to websites
				</Button>
			</div>
		</div>
	);
}
