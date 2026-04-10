import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TAGS = ["/checkout", "Mobile Chrome", "EU"] as const;

const alertBottomFadeClass =
	"pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-linear-to-t from-background/100 via-background/50 to-transparent sm:h-20";

const alertRightFadeClass =
	"pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-linear-to-l from-background/100 via-background/50 to-transparent sm:w-16";

function CardChrome({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"rounded border border-white/[0.06] bg-white/[0.02]",
				className
			)}
		>
			{children}
		</div>
	);
}

export function WebVitalsAlertCycleDemo() {
	return (
		<div
			aria-label="Web vitals alert feed preview"
			className="relative mt-3 w-full overflow-hidden"
			role="region"
		>
			<div className="space-y-2 sm:space-y-2.5">
				<CardChrome className="p-3 sm:p-3.5">
					<div className="flex gap-2.5">
						<span
							aria-hidden
							className="mt-1.5 size-2 shrink-0 animate-pulse rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.65)] motion-reduce:animate-none"
						/>
						<div className="min-w-0 flex-1 space-y-1">
							<div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
								<span className="font-base font-mono text-red-400 text-sm sm:text-sm">
									LCP regression
								</span>
								<span className="shrink-0 font-mono text-muted-foreground text-sm tabular-nums sm:text-xs">
									just now
								</span>
							</div>
							<p className="font-mono text-muted-foreground text-xs leading-snug sm:text-sm">
								exceeded 2.5s threshold on /checkout
							</p>
							<div className="flex flex-wrap gap-1.5 pt-0.5">
								{TAGS.map((tag) => (
									<span
										className="rounded bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-muted-foreground sm:text-xs"
										key={tag}
									>
										{tag}
									</span>
								))}
							</div>
						</div>
					</div>
				</CardChrome>

				<CardChrome className="p-2.5 sm:p-3">
					<div className="flex items-center gap-2">
						<span
							aria-hidden
							className="size-2 shrink-0 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.55)]"
						/>
						<span className="min-w-0 flex-1 font-medium font-mono text-amber-400 text-xs sm:text-sm">
							TTFB exceeding 800ms
						</span>
						<span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums sm:text-xs">
							18m ago
						</span>
					</div>
				</CardChrome>

				<CardChrome className="p-2.5 sm:p-3">
					<div className="flex items-center gap-2">
						<span
							aria-hidden
							className="size-2 shrink-0 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.55)]"
						/>
						<span className="min-w-0 flex-1 font-medium font-mono text-amber-400 text-xs sm:text-sm">
							INP exceeding 200ms
						</span>
						<span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums sm:text-xs">
							18m ago
						</span>
					</div>
				</CardChrome>
			</div>

			<div aria-hidden className={alertBottomFadeClass} />
			<div aria-hidden className={alertRightFadeClass} />
		</div>
	);
}
