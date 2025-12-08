"use client";

import { RocketLaunchIcon } from "@phosphor-icons/react";
import { SciFiButton } from "@/components/landing/scifi-btn";
import { SciFiCard } from "@/components/scifi-card";

const examples = ["saas", "merch store"] as const;
const prompts = {
	saas: "Build me a trip planning tool",
	"merch store": "Build me a t-shirt store",
} as const;

export const LeapComponent = () => {
	const handleGenerate = () => {
		const input = document.querySelector(
			".leap-prompt-input"
		) as HTMLInputElement;
		const prompt = input?.value
			? `${input.value} use Databuddy for analytics`
			: "";
		const url = new URL("https://leap.new/");
		url.searchParams.set("build", prompt);
		url.searchParams.set("utm_source", "databuddy");
		window.location.href = url.toString();
	};

	const handleExample = (example: (typeof examples)[number]) => {
		const input = document.querySelector(
			".leap-prompt-input"
		) as HTMLInputElement;
		if (input) {
			input.value = prompts[example];
		}
	};

	return (
		<SciFiCard
			className="my-2 mb-8 w-full rounded border border-border bg-card/50 backdrop-blur-sm transition-all duration-300 hover:bg-card/70"
			opacity="reduced"
		>
			<div className="p-4 sm:p-3">
				<div className="mb-2 flex items-center gap-2">
					<RocketLaunchIcon
						className="size-4 text-purple-500"
						weight="duotone"
					/>
					<h3 className="font-semibold text-foreground text-sm leading-none">
						Try Databuddy with Leap
					</h3>
				</div>

				<p className="mb-3 text-muted-foreground text-xs">
					Let Leap generate a complete application that uses Databuddy for
					analytics.
				</p>

				<div className="flex w-full flex-col gap-2 sm:flex-row">
					<input
						className="leap-prompt-input flex-1 rounded border border-input bg-background px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
						placeholder="What do you want to build with Databuddy analytics?"
						type="text"
					/>
					<SciFiButton
						className="w-full sm:w-auto"
						data-track="leap-generate"
						onClick={handleGenerate}
					>
						Generate
					</SciFiButton>
				</div>

				<div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
					<span className="text-muted-foreground">Examples:</span>
					{examples.map((example) => (
						<button
							className="border-muted-foreground/50 border-b border-dotted px-1 text-muted-foreground hover:border-purple-400 hover:text-purple-400 focus:border-purple-400 focus:text-purple-400 focus:outline-none"
							key={example}
							onClick={() => handleExample(example)}
							type="button"
						>
							{example}
						</button>
					))}
				</div>
			</div>
		</SciFiCard>
	);
};

export default LeapComponent;
