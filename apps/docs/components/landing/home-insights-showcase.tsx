import { HouseIcon, LightbulbIcon } from "@databuddy/ui/icons";
import Image from "next/image";

const HOME_INSIGHTS_SCREENSHOT = "/brand/dashboard-home-insights.png";

export function HomeInsightsShowcase() {
	return (
		<div className="relative overflow-hidden pt-20 pb-16 sm:pt-24 sm:pb-20 lg:pt-28 lg:pb-24">
			<div
				aria-hidden
				className="absolute inset-0 bg-center bg-cover opacity-45 saturate-110"
				style={{
					backgroundImage: "url('/brand/gradients/gradient-bg-1.webp')",
				}}
			/>
			<div
				aria-hidden
				className="absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--background)/0.86)_28%,hsl(var(--background)/0.68)_54%,hsl(var(--background))_100%)]"
			/>
			<div
				aria-hidden
				className="absolute inset-x-0 top-0 h-24 bg-linear-to-b from-background via-background/92 to-transparent"
			/>
			<div
				aria-hidden
				className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.28)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.18)_1px,transparent_1px)] bg-[size:64px_64px] opacity-20"
			/>
			<div
				aria-hidden
				className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-border to-transparent"
			/>
			<div
				aria-hidden
				className="absolute top-0 right-[12%] left-[12%] h-px bg-linear-to-r from-transparent via-primary/55 to-transparent"
			/>
			<div
				aria-hidden
				className="absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-border to-transparent"
			/>

			<div className="relative mx-auto w-full max-w-400 px-4 sm:px-14 lg:px-20">
				<div className="mx-auto mb-8 max-w-360 lg:mb-10">
					<div>
						<div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-3 py-1.5 font-mono text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm">
							<HouseIcon className="size-3.5 text-primary" weight="duotone" />
							Dashboard home
						</div>
						<h2 className="mt-4 max-w-3xl text-balance font-semibold text-3xl leading-tight sm:text-4xl lg:text-5xl">
							Your home page opens with the answer.
						</h2>
						<p className="mt-3 max-w-2xl text-pretty text-muted-foreground text-sm leading-relaxed sm:text-base">
							The first thing you see is the work Databuddy already did:
							priority, evidence, and what to do next.
						</p>
					</div>
				</div>

				<div className="relative mx-auto max-w-[112rem]">
					<div
						aria-hidden
						className="absolute -inset-5 rounded-xl bg-[linear-gradient(135deg,hsl(var(--primary)/0.32),hsl(var(--border)/0.12)_42%,hsl(var(--foreground)/0.1))] opacity-70 blur-xl"
					/>
					<div
						aria-hidden
						className="absolute -inset-px rounded-lg bg-[linear-gradient(135deg,hsl(var(--primary)/0.58),hsl(var(--border)/0.36)_34%,hsl(var(--foreground)/0.18))]"
					/>
					<figure
						className="relative overflow-hidden rounded-lg border border-border/50 shadow-[0_32px_110px_rgba(0,0,0,0.48)]"
						style={{
							WebkitMaskImage:
								"linear-gradient(to bottom, black 0%, black 82%, rgba(0,0,0,0.72) 90%, transparent 100%)",
							maskImage:
								"linear-gradient(to bottom, black 0%, black 82%, rgba(0,0,0,0.72) 90%, transparent 100%)",
						}}
					>
						<div className="relative aspect-[3/4] w-full overflow-hidden sm:aspect-[2986/1668]">
							<Image
								alt="Databuddy dashboard home showing actionable insights, monitors, and website snapshot cards."
								className="h-full w-full object-cover object-left-top opacity-95"
								height={1668}
								priority
								sizes="(min-width: 1536px) 1536px, (min-width: 1024px) 90vw, 100vw"
								src={HOME_INSIGHTS_SCREENSHOT}
								width={2986}
							/>
						</div>
						<div className="pointer-events-none absolute top-[19%] left-[14%] hidden max-w-70 rounded-lg border border-primary/30 bg-background/86 p-3 shadow-[0_18px_55px_rgba(0,0,0,0.34)] backdrop-blur-md md:block">
							<div className="flex items-center gap-2">
								<span className="flex size-6 items-center justify-center rounded bg-primary/12 text-primary">
									<LightbulbIcon className="size-3.5" weight="duotone" />
								</span>
								<p className="font-medium text-xs">Insight cards live here</p>
							</div>
							<p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
								The dashboard starts with the highest-impact answers, not an
								empty analytics canvas.
							</p>
						</div>
					</figure>
				</div>
			</div>
		</div>
	);
}
