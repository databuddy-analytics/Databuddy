import Link from "next/link";
import { SciFiButton } from "@/components/landing/scifi-btn";
import { SciFiCard } from "@/components/scifi-card";

export function CtaSection() {
	return (
		<section className="mx-auto w-full max-w-3xl">
			<SciFiCard>
				<div className="rounded border border-border bg-card/70 p-6 text-center backdrop-blur-sm sm:p-10">
					<h2 className="mb-4 text-balance font-bold text-2xl tracking-tight sm:text-3xl">
						Try cookieless analytics
					</h2>
					<p className="mx-auto mb-6 max-w-xl text-pretty text-muted-foreground text-sm sm:text-base">
						Track visits, events, and conversions with Databuddy. Review your
						storage, identification, and consent settings before collecting
						data.
					</p>

					<div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
						<SciFiButton asChild>
							<a
								href="https://app.databuddy.cc/register"
								rel="noopener noreferrer"
								target="_blank"
							>
								START FREE
							</a>
						</SciFiButton>
						<SciFiButton asChild>
							<Link href="/docs">READ THE DOCS</Link>
						</SciFiButton>
					</div>
				</div>
			</SciFiCard>
		</section>
	);
}
