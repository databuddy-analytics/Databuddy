"use client";

import { CheckIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useFfDemoReveal } from "@/components/landing/ff-demo-reveal";
import { cn } from "@/lib/utils";

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const ROW_STAGGER_MS = 80;

const FLAGS = [
	{ name: "new-dashboard", label: "New Dashboard" },
	{ name: "legacy-checkout", label: "Legacy Checkout" },
	{ name: "new-onboarding", label: "New Onboarding" },
	{ name: "dark-mode-v2", label: "dark-mode-v2" },
] as const;

export function FFInstantRolloutsDemo() {
	const { ref, visible } = useFfDemoReveal();
	const [toggled, setToggled] = useState(false);
	const [toast, setToast] = useState(false);

	// Auto-toggle first item after rows animate in
	useEffect(() => {
		if (!visible) return;
		const t = window.setTimeout(() => {
			setToggled(true);
			setToast(true);
		}, 900);
		return () => window.clearTimeout(t);
	}, [visible]);

	useEffect(() => {
		if (!toast) return;
		const t = window.setTimeout(() => setToast(false), 1500);
		return () => window.clearTimeout(t);
	}, [toast]);

	const enabled = [toggled, false, false, false] as const;

	return (
		<div className="relative w-full overflow-hidden" ref={ref}>
			<div>
				{FLAGS.map((flag, i) => (
					<div
						className={cn(
							"flex items-center justify-between border-white/[0.04] border-b py-3",
							"will-change-transform"
						)}
						key={flag.name}
						style={{
							opacity: visible ? 1 : 0,
							transform: visible ? "translateY(0)" : "translateY(8px)",
							transition: `opacity 600ms ${EASE}, transform 600ms ${EASE}`,
							transitionDelay: visible
								? `${String(i * ROW_STAGGER_MS)}ms`
								: "0ms",
						}}
					>
						<div className="flex min-w-0 flex-1 items-center gap-2.5">
							<span
								aria-hidden
								className={cn(
									"size-2 shrink-0 rounded-full transition-[opacity,box-shadow] duration-300",
									enabled[i]
										? "bg-green-500/70 shadow-[0_0_10px_rgba(34,197,94,0.3)]"
										: "bg-muted-foreground/40 shadow-none"
								)}
							/>
							<span className="truncate font-medium font-mono text-foreground text-sm">
								{flag.label}
							</span>
							<span className="shrink-0 font-mono text-[9px] text-muted-foreground/50 uppercase tracking-wider">
								boolean
							</span>
						</div>
						<div
							className={cn(
								"relative h-5 w-9 shrink-0 rounded-full border border-white/[0.04] transition-colors duration-300",
								enabled[i] ? "bg-green-500/20" : "bg-white/[0.08]"
							)}
						>
							<span
								className="absolute top-0.5 left-0.5 size-3.5 rounded-full border-2 border-background bg-foreground will-change-transform"
								style={{
									transform: enabled[i] ? "translateX(16px)" : "translateX(0)",
									transition:
										"transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1)",
								}}
							/>
						</div>
					</div>
				))}
			</div>

			{/* Toast overlaid on demo */}
			<div
				className={cn(
					"pointer-events-none absolute inset-x-0 bottom-4 z-20 flex items-center justify-center transition-opacity duration-300",
					toast ? "opacity-100" : "opacity-0"
				)}
				style={{ willChange: "opacity" }}
			>
				<span className="inline-flex items-center gap-1.5 rounded border border-green-500/20 bg-background/80 px-3 py-1.5 font-mono text-[11px] text-green-500/80 backdrop-blur-sm">
					<CheckIcon className="size-3.5" weight="bold" />
					Flag updated
				</span>
			</div>

			{/* Bottom fade gradient */}
			<div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-linear-to-t from-background/100 via-background/50 to-transparent sm:h-20" />
		</div>
	);
}
