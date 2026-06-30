"use client";

import {
	ChatTextIcon as ChatCircleIcon,
	ClockIcon,
	EnvelopeIcon,
	ShieldCheckIcon,
} from "@databuddy/ui/icons";
import { SciFiCard } from "@/components/scifi-card";

const features = [
	{ icon: ClockIcon, title: "Quick Response", description: "We respond fast" },
	{
		icon: ChatCircleIcon,
		title: "Personal Support",
		description: "Talk to real humans",
	},
	{
		icon: ShieldCheckIcon,
		title: "Privacy-First",
		description: "Your data is safe",
	},
	{
		icon: EnvelopeIcon,
		title: "Direct Contact",
		description: "We're here to help",
	},
] as const;

export default function ContactHero() {
	return (
		<div className="flex h-full flex-col justify-center text-center lg:text-left">
			<h1 className="font-semibold text-3xl leading-tight tracking-tight sm:text-4xl lg:text-5xl xl:text-6xl">
				<span className="block">
					Get in <span className="text-muted-foreground">touch</span>
				</span>
				<span className="block">
					with <span className="text-muted-foreground">Databuddy</span>
				</span>
			</h1>
			<p className="mx-auto mt-4 max-w-md text-balance font-medium text-muted-foreground text-sm leading-relaxed tracking-tight sm:text-base lg:mx-0">
				Interested in privacy-first analytics for your business? Fill out the
				form and we'll get back to you as soon as possible.
			</p>

			<div className="mt-8 grid grid-cols-2 gap-3">
				{features.map((feature) => (
					<SciFiCard
						className="flex h-18 w-full flex-col items-center justify-center rounded border border-border bg-card/50 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70 sm:h-20"
						key={feature.title}
					>
						<feature.icon
							className="mb-1 size-4 text-muted-foreground duration-300 group-hover:text-foreground sm:size-5"
							weight="duotone"
						/>
						<div className="px-2 text-center">
							<div className="font-semibold text-foreground text-xs sm:text-sm">
								{feature.title}
							</div>
							<div className="mt-0.5 hidden text-muted-foreground text-xs sm:block">
								{feature.description}
							</div>
						</div>
					</SciFiCard>
				))}
			</div>
		</div>
	);
}
