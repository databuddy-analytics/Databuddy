import { TopBar } from "@/components/layout/top-bar";
import type { NavIcon } from "@/components/layout/navigation/types";
import { Button } from "@databuddy/ui";
import { ArrowLeftIcon } from "@databuddy/ui/icons";
import Link from "next/link";

interface IntelligenceComingSoonProps {
	description: string;
	icon: NavIcon;
	title: string;
}

export function IntelligenceComingSoon({
	title,
	description,
	icon: Icon,
}: IntelligenceComingSoonProps) {
	return (
		<div className="flex h-full flex-col">
			<TopBar.Title>
				<h1 className="font-semibold text-sm">{title}</h1>
			</TopBar.Title>
			<div className="flex flex-1 flex-col items-center justify-center p-6 text-center sm:p-12">
				<div className="mb-4 flex size-16 items-center justify-center rounded-full bg-accent">
					<Icon aria-hidden className="size-7 text-foreground" />
				</div>
				<h2 className="text-balance font-semibold text-lg">{title}</h2>
				<p className="mt-2 max-w-md text-pretty text-muted-foreground text-sm">
					{description}
				</p>
				<p className="mt-4 font-medium text-muted-foreground text-xs uppercase">
					Coming soon
				</p>
				<Button asChild className="mt-6" size="sm" variant="outline">
					<Link href="/insights">
						<ArrowLeftIcon aria-hidden className="size-3.5" />
						Back to Insights
					</Link>
				</Button>
			</div>
		</div>
	);
}
