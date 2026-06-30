import Link from "next/link";
import { Button } from "@databuddy/ui";

export function MidPageCta() {
	return (
		<div className="flex flex-col items-center gap-4 text-center">
			<h2 className="text-balance font-semibold text-2xl sm:text-3xl">
				Ready to see your data?
			</h2>
			<p className="max-w-lg text-pretty text-muted-foreground text-sm sm:text-base">
				Set up in 5 minutes. Free up to 10,000 events per month.
			</p>
			<div className="flex items-center gap-3 pt-1">
				<Button asChild>
					<a href="https://app.databuddy.cc/register">Start free</a>
				</Button>
				<Button asChild variant="secondary">
					<Link href="/demo">Live demo</Link>
				</Button>
			</div>
		</div>
	);
}
