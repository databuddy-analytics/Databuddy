import { BottomFade } from "@/components/landing/demo-primitives";
import { FlagIcon } from "@databuddy/ui/icons";

const VARIANT_SEGMENTS = [
	{ className: "bg-emerald-500", width: 50 },
	{ className: "bg-sky-500", width: 30 },
	{ className: "bg-muted-foreground/40", width: 20 },
] as const;

function TypeLabel({ type }: { type: "boolean" | "rollout" | "multivariant" }) {
	return (
		<span className="shrink-0 font-mono text-[9px] text-muted-foreground/50 uppercase tracking-wider">
			{type}
		</span>
	);
}

function Toggle({ on }: { on: boolean }) {
	return (
		<div
			className={`relative h-5 w-9 shrink-0 rounded-full border border-white/[0.04] transition-colors duration-300 ${on ? "bg-green-500/20" : "bg-white/[0.08]"}`}
		>
			<span
				className="absolute top-0.5 left-0.5 size-3.5 rounded-full border-2 border-background bg-foreground"
				style={{
					transform: on ? "translateX(16px)" : "translateX(0)",
					transition: "transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1)",
				}}
			/>
		</div>
	);
}

export function FFCompactFlagsDashboardDemo() {
	return (
		<div className="relative w-full overflow-hidden">
			<div className="overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02]">
				<div className="flex items-center justify-between border-white/[0.06] border-b px-3.5 py-2.5">
					<p className="font-medium text-muted-foreground text-xs">
						Feature Flags
					</p>
					<div className="flex items-center gap-1.5 rounded bg-white/[0.04] px-2.5 py-1">
						<FlagIcon className="size-3 text-muted-foreground" />
						<span className="font-medium text-[11px] text-muted-foreground">
							Production
						</span>
					</div>
				</div>

				<div>
					{/* New Dashboard — boolean, on */}
					<div className="flex items-center justify-between border-white/[0.04] border-b px-3.5 py-3">
						<div className="flex min-w-0 flex-1 items-center gap-2.5">
							<span className="size-2 shrink-0 rounded-full bg-green-500/70 shadow-[0_0_10px_rgba(34,197,94,0.3)]" />
							<span className="truncate font-medium font-mono text-foreground text-sm">
								New Dashboard
							</span>
							<TypeLabel type="boolean" />
						</div>
						<Toggle on />
					</div>

					{/* Checkout Experiment — multivariant */}
					<div className="flex items-center justify-between border-white/[0.04] border-b px-3.5 py-3">
						<div className="flex min-w-0 flex-1 items-center gap-2.5">
							<span className="size-2 shrink-0 rounded-full bg-green-500/70 shadow-[0_0_10px_rgba(34,197,94,0.3)]" />
							<span className="truncate font-medium font-mono text-foreground text-sm">
								Checkout Experiment
							</span>
							<TypeLabel type="multivariant" />
							<div className="flex h-1.5 w-14 overflow-hidden rounded">
								{VARIANT_SEGMENTS.map((seg, index) => (
									<div
										className={`h-full ${seg.className}`}
										key={`seg-${String(index)}`}
										style={{ width: `${String(seg.width)}%` }}
									/>
								))}
							</div>
							<span className="font-mono text-[9px] text-muted-foreground/50 tabular-nums">
								3v
							</span>
						</div>
					</div>

					{/* AI Assistant — rollout */}
					<div className="flex items-center justify-between border-white/[0.04] border-b px-3.5 py-3">
						<div className="flex min-w-0 flex-1 items-center gap-2.5">
							<span className="size-2 shrink-0 rounded-full bg-green-500/70 shadow-[0_0_10px_rgba(34,197,94,0.3)]" />
							<span className="truncate font-medium font-mono text-foreground text-sm">
								AI Assistant
							</span>
							<TypeLabel type="rollout" />
							<div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted-foreground/20">
								<div
									className="h-full rounded-full bg-violet-500"
									style={{ width: "25%" }}
								/>
							</div>
						</div>
					</div>

					{/* Legacy Checkout — boolean, off */}
					<div className="flex items-center justify-between border-white/[0.04] border-b px-3.5 py-3">
						<div className="flex min-w-0 flex-1 items-center gap-2.5">
							<span className="size-2 shrink-0 rounded-full bg-muted-foreground/40 shadow-none" />
							<span className="truncate font-medium font-mono text-foreground text-sm">
								Legacy Checkout
							</span>
							<TypeLabel type="boolean" />
						</div>
						<Toggle on={false} />
					</div>
				</div>
			</div>
			<BottomFade />
		</div>
	);
}
