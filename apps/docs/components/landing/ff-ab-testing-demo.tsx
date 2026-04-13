"use client";

import { useFfDemoReveal } from "@/components/landing/ff-demo-reveal";
import { cn } from "@/lib/utils";

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const BAR_MS = 800;

const VARIANTS = [
	{
		name: "Control",
		percent: 34,
		barClass: "bg-white/[0.08]",
		glow: "shadow-[inset_0_0_8px_rgba(255,255,255,0.1)]",
	},
	{
		name: "Variant A",
		percent: 33,
		barClass: "bg-green-500/25",
		glow: "shadow-[inset_0_0_8px_rgba(34,197,94,0.1)]",
	},
	{
		name: "Variant B",
		percent: 33,
		barClass: "bg-blue-500/25",
		glow: "shadow-[inset_0_0_8px_rgba(59,130,246,0.1)]",
	},
] as const;

export function FFAbTestingDemo() {
	const { ref, visible } = useFfDemoReveal();

	return (
		<div className="relative mt-2" ref={ref}>
			<div className="relative overflow-hidden">
				<div
					className="will-change-[opacity,transform]"
					style={{
						opacity: visible ? 1 : 0,
						transform: visible ? "translateY(0)" : "translateY(8px)",
						transition: `opacity 600ms ${EASE}, transform 600ms ${EASE}`,
					}}
				>
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-medium font-mono text-foreground text-sm">
							Checkout Experiment
						</span>
						<span className="font-mono text-[9px] text-muted-foreground/40 uppercase tracking-wider">
							multivariant
						</span>
						<span className="font-mono text-[9px] text-muted-foreground/40 uppercase tracking-wider">
							prod
						</span>
					</div>
				</div>

				<div className="mt-5 flex gap-3">
					<div className="flex w-24 shrink-0 flex-col gap-3">
						{VARIANTS.map((v) => (
							<div
								className="flex min-h-8 items-center font-mono text-muted-foreground text-xs"
								key={`n-${v.name}`}
							>
								{v.name}
							</div>
						))}
					</div>
					<div className="flex w-9 shrink-0 flex-col gap-3">
						{VARIANTS.map((v) => (
							<div
								className="flex min-h-8 items-center font-mono text-foreground text-xs tabular-nums"
								key={`p-${v.name}`}
							>
								{v.percent}%
							</div>
						))}
					</div>
					<div className="relative min-w-0 flex-1">
						<div
							aria-hidden
							className="pointer-events-none absolute inset-y-0 left-1/3 z-10 border-white/[0.03] border-l border-dashed"
						/>
						<div className="flex flex-col gap-3">
							{VARIANTS.map((v, i) => (
								<div
									className="flex min-h-8 items-center"
									key={v.name}
									style={{
										opacity: visible ? 1 : 0,
										transform: visible ? "translateY(0)" : "translateY(8px)",
										transition: `opacity 600ms ${EASE}, transform 600ms ${EASE}`,
										transitionDelay: visible ? `${String(i * 100)}ms` : "0ms",
									}}
								>
									<div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.04]">
										<div
											className={cn(
												"h-full rounded-full will-change-[width]",
												v.barClass,
												v.glow
											)}
											style={{
												width: visible ? `${String(v.percent)}%` : "0%",
												transition: `width ${BAR_MS}ms ${EASE}`,
												transitionDelay: visible
													? `${String(i * 100)}ms`
													: "0ms",
											}}
										/>
									</div>
								</div>
							))}
						</div>
					</div>
				</div>

				<p
					className="mt-5 font-mono text-muted-foreground/40 text-xs"
					style={{
						opacity: visible ? 1 : 0,
						transition: `opacity 500ms ${EASE}`,
						transitionDelay: visible ? "1.2s" : "0s",
					}}
				>
					1,247 users enrolled
				</p>
			</div>
		</div>
	);
}
