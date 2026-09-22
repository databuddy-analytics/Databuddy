"use client";

import { useRouter } from "next/navigation";
import { WarningIcon } from "@databuddy/ui/icons";
import { Button, Card } from "@databuddy/ui";

export function UnauthorizedAccessError() {
	const router = useRouter();

	return (
		<Card className="mx-auto my-8 w-full max-w-lg border-red-200 bg-red-50 dark:border-red-800/50 dark:bg-red-950/20">
			<Card.Header className="pb-3">
				<div className="flex items-center gap-3">
					<div className="rounded-full bg-red-100 p-2.5 dark:bg-red-900/30">
						<WarningIcon
							className="size-6 text-red-600 dark:text-red-400"
							size={24}
						/>
					</div>
					<div>
						<Card.Title className="text-lg">Access Denied</Card.Title>
						<Card.Description className="mt-1">
							You don't have permission to view this website's analytics.
						</Card.Description>
					</div>
				</div>
			</Card.Header>
			<Card.Content className="pt-0">
				<p className="mb-5 text-muted-foreground text-sm">
					Contact the website owner if you think this is an error.
				</p>
				<Button
					className="w-full sm:w-auto"
					onClick={() => router.push("/websites")}
				>
					Back to Websites
				</Button>
			</Card.Content>
		</Card>
	);
}
