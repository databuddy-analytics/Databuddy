"use client";

import { useFfDemoReveal } from "@/components/landing/ff-demo-reveal";

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

const RULES = [
	{ property: "plan", operator: "is", value: "pro" },
	{ property: "region", operator: "is one of", value: "US, EU" },
	{ property: "signup_date", operator: "after", value: "2025-01-01" },
] as const;

export function FFUserTargetingDemo() {
	const { ref, visible } = useFfDemoReveal();

	return (
		<div className="relative mt-2" ref={ref}>
			<div className="relative overflow-hidden">
				<p className="font-medium font-mono text-foreground text-sm">
					Targeting Rules
				</p>

				<div className="relative mt-4">
					<div
						aria-hidden
						className="pointer-events-none absolute top-1/2 left-1/2 z-0 size-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.02)_0%,transparent_70%)]"
					/>

					<div className="relative z-10 space-y-0">
						{RULES.map((rule, i) => (
							<div key={rule.property}>
								<div
									className="flex flex-wrap items-center gap-2 py-2 will-change-[opacity,transform]"
									style={{
										opacity: visible ? 1 : 0,
										transform: visible ? "translateY(0)" : "translateY(8px)",
										transition: `opacity 600ms ${EASE}, transform 600ms ${EASE}`,
										transitionDelay: visible ? `${String(i * 120)}ms` : "0ms",
									}}
								>
									<span className="rounded border border-white/[0.06] px-1.5 py-0.5 font-mono text-muted-foreground text-sm">
										{rule.property}
									</span>
									<span className="font-mono text-muted-foreground/40 text-sm">
										{rule.operator}
									</span>
									<span className="rounded border border-white/[0.06] px-1.5 py-0.5 font-mono text-muted-foreground text-sm">
										{rule.value}
									</span>
								</div>
								{i < RULES.length - 1 ? (
									<p
										className="py-1 text-center font-mono text-muted-foreground/20 text-xs uppercase tracking-widest"
										style={{
											opacity: visible ? 1 : 0,
											transition: `opacity 500ms ${EASE}`,
											transitionDelay: visible
												? `${String(i * 120 + 80)}ms`
												: "0ms",
										}}
									>
										AND
									</p>
								) : null}
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
