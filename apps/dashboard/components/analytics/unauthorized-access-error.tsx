"use client";

import { useRouter } from "next/navigation";
import { WarningIcon } from "@databuddy/ui/icons";
import { Button, Card } from "@databuddy/ui";

export function UnauthorizedAccessError() {
	const router = useRouter();

	return (
		<Card className="mx-auto my-8 w-full max-w-lg">
			<Card.Header className="pb-3">
				<div className="flex items-center gap-3">
					<div className="rounded-full bg-destructive/10 p-2.5">
						<WarningIcon className="size-6 text-destructive" size={24} />
					</div>
					<div>
						<Card.Title className="text-lg">Access denied</Card.Title>
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
					Back to websites
				</Button>
			</Card.Content>
		</Card>
	);
}
