import { HouseIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Branding } from "@/components/logo/branding";
import { Button } from "@/components/ds/button";

const PARTICLES = [
	{
		className: "left-[20%] top-[15%] animate-[float-a_4s_ease-in-out_infinite]",
		color: "bg-purple-500",
	},
	{
		className:
			"right-[18%] top-[25%] animate-[float-b_5s_ease-in-out_infinite]",
		color: "bg-indigo-500",
	},
	{
		className:
			"left-[15%] bottom-[30%] animate-[float-a_6s_ease-in-out_infinite_reverse]",
		color: "bg-purple-400",
	},
	{
		className:
			"right-[22%] bottom-[20%] animate-[float-b_4.5s_ease-in-out_infinite]",
		color: "bg-indigo-400",
	},
	{
		className:
			"left-[10%] top-[40%] animate-[float-a_5.5s_ease-in-out_infinite]",
		color: "bg-purple-300",
	},
	{
		className:
			"right-[12%] top-[60%] animate-[float-b_3.5s_ease-in-out_infinite_reverse]",
		color: "bg-violet-600",
	},
] as const;

export default function NotFound() {
	return (
		<div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background p-4 sm:p-6">
			<style
				// biome-ignore lint/security/noDangerouslySetInnerHtml: static keyframes
				dangerouslySetInnerHTML={{
					__html: `
						@keyframes float-a {
							0%, 100% { transform: translateY(0) translateX(0); }
							50% { transform: translateY(-12px) translateX(6px); }
						}
						@keyframes float-b {
							0%, 100% { transform: translateY(0) translateX(0); }
							50% { transform: translateY(8px) translateX(-8px); }
						}
						@keyframes bobble {
							0%, 100% { transform: translateY(0) rotate(0deg); }
							25% { transform: translateY(-4px) rotate(5deg); }
							75% { transform: translateY(-2px) rotate(-3deg); }
						}
					`,
				}}
			/>

			{PARTICLES.map((p) => (
				<div
					aria-hidden="true"
					className={`absolute size-1.5 rounded-full opacity-30 ${p.color} ${p.className}`}
					key={p.className}
				/>
			))}

			<div
				aria-hidden="true"
				className="pointer-events-none absolute select-none font-extrabold text-[120px] text-foreground opacity-[0.04] sm:text-[180px]"
			>
				404
			</div>

			<div className="relative flex w-full max-w-sm flex-col items-center text-center">
				<div className="relative mb-6">
					<div
						aria-hidden="true"
						className="absolute inset-[-20px] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.15)_0%,transparent_70%)]"
					/>
					<Branding
						className="relative"
						heightPx={72}
						priority
						variant="logomark"
					/>
					<span
						aria-hidden="true"
						className="absolute -top-2 -right-3.5 font-bold text-[22px] text-purple-500 opacity-70"
						style={{ animation: "bobble 2s ease-in-out infinite" }}
					>
						?
					</span>
				</div>

				<div className="space-y-2">
					<p className="font-semibold text-[13px] text-purple-500 uppercase tracking-[0.15em] opacity-70">
						404
					</p>
					<h1 className="text-balance font-semibold text-foreground text-lg">
						Lost in the data stream
					</h1>
					<p className="text-pretty text-muted-foreground text-sm leading-relaxed">
						Our bunny wandered off looking for this page, but it doesn&apos;t
						seem to exist.
					</p>
				</div>

				<Link className="mt-6 w-full" href="/websites">
					<Button className="w-full">
						<HouseIcon className="mr-2 size-4" weight="duotone" />
						Back to Websites
					</Button>
				</Link>
			</div>
		</div>
	);
}
