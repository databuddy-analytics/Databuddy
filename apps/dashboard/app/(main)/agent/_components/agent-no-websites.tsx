import Link from "next/link";
import { Button } from "@databuddy/ui";
import { Avatar } from "@databuddy/ui/client";

export function AgentNoWebsites() {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
			<Avatar
				alt="Databunny avatar"
				className="size-12 rounded"
				fallback="DB"
				src="/databunny.webp"
			/>
			<div className="space-y-1">
				<h2 className="font-semibold text-base text-foreground">
					Add a website to use Databunny
				</h2>
				<p className="max-w-sm text-muted-foreground text-sm">
					Databunny analyzes your analytics. Connect your first website to start
					asking questions.
				</p>
			</div>
			<Button asChild>
				<Link href="/websites">Add a website</Link>
			</Button>
		</div>
	);
}
