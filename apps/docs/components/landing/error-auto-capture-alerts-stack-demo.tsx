import { cn } from "@/lib/utils";

type Tone = "danger" | "warning" | "success";

interface AlertCardRow {
	id: string;
	title: string;
	meta: string;
	tone: Tone;
}

const TONE_DOT: Record<Tone, string> = {
	danger: "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.65)]",
	warning: "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.55)]",
	success: "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.55)]",
};

const TONE_TEXT: Record<Tone, string> = {
	danger: "text-red-400",
	warning: "text-amber-400",
	success: "text-emerald-400",
};

const EXPANDED_TAGS = ["/checkout", "Chrome 124", "macOS"] as const;

const COMPACT_ROWS: AlertCardRow[] = [
	{
		id: "unhandled",
		title: "Unhandled rejection",
		meta: "3m ago",
		tone: "warning",
	},
	{
		id: "console",
		title: "console.error: API timeout",
		meta: "8m ago",
		tone: "success",
	},
] as const;

function CardChrome({
	children,
	className,
}: {
	children: React.ReactNode;
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

export function ErrorAutoCaptureAlertsStackDemo() {
	return (
		<div aria-hidden className="relative mt-3 w-full overflow-hidden">
			<div className="space-y-2 sm:space-y-2.5">
				{/* Expanded — TypeError */}
				<CardChrome className="p-3 sm:p-3.5">
					<div className="flex gap-2.5">
						<span
							aria-hidden
							className="mt-1.5 size-2 shrink-0 animate-pulse rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.65)] motion-reduce:animate-none"
						/>
						<div className="min-w-0 flex-1 space-y-1">
							<div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
								<span className="font-mono text-red-400 text-sm">
									TypeError
								</span>
								<span className="shrink-0 font-mono text-muted-foreground text-sm tabular-nums sm:text-xs">
									now
								</span>
							</div>
							<p className="font-mono text-muted-foreground text-xs leading-snug sm:text-sm">
								Cannot read properties of undefined
							</p>
							<div className="flex flex-wrap gap-1.5 pt-0.5">
								{EXPANDED_TAGS.map((tag) => (
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

				{/* Compact rows */}
				{COMPACT_ROWS.map((row) => (
					<CardChrome className="p-2.5 sm:p-3" key={row.id}>
						<div className="flex items-center gap-2">
							<span
								aria-hidden
								className={cn(
									"size-2 shrink-0 rounded-full",
									TONE_DOT[row.tone]
								)}
							/>
							<span
								className={cn(
									"min-w-0 flex-1 font-medium font-mono text-xs sm:text-sm",
									TONE_TEXT[row.tone]
								)}
							>
								{row.title}
							</span>
							<span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums sm:text-xs">
								{row.meta}
							</span>
						</div>
					</CardChrome>
				))}
			</div>

			{/* Bottom fade */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-linear-to-t from-background/100 via-background/50 to-transparent sm:h-20"
			/>
			{/* Right fade */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-linear-to-l from-background/100 via-background/50 to-transparent sm:w-16"
			/>
		</div>
	);
}
