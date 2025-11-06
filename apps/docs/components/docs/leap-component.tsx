"use client";

import { RocketLaunchIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

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
		<div className="group relative my-2 mb-8 w-fullrounded border border-border bg-card/50 backdrop-blur-sm transition-all duration-300 hover:bg-card/70">
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
						className="leap-prompt-input flex-1 rounded border border-input bg-background px-3 py-2 text-foreground text-sm transition-colors placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
						placeholder="What do you want to build with Databuddy analytics?"
						type="text"
					/>
					<button
						className={cn(
							"inline-flex items-center justify-center whitespace-nowrap rounded px-4 py-2 font-medium text-sm transition-all duration-200",
							"bg-foreground/5 text-foreground backdrop-blur-[50px]",
							"border border-border hover:animate-[borderGlitch_0.6s_ease-in-out]",
							"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:scale-[0.98]",
							"w-full sm:w-auto"
						)}
						data-track="leap-generate"
						onClick={handleGenerate}
						type="button"
					>
						Generate
					</button>
				</div>

				<div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
					<span className="text-muted-foreground">Examples:</span>
					{examples.map((example) => (
						<button
							className="border-muted-foreground/50 border-b border-dotted px-1 text-muted-foreground transition-colors hover:border-purple-400 hover:text-purple-400 focus:border-purple-400 focus:text-purple-400 focus:outline-none"
							key={example}
							onClick={() => handleExample(example)}
							type="button"
						>
							{example}
						</button>
					))}
				</div>
			</div>

			{/* Sci-fi corners */}
			<div className="pointer-events-none absolute inset-0">
				{[
					"top-0 left-0",
					"top-0 right-0 -scale-x-[1]",
					"bottom-0 left-0 -scale-y-[1]",
					"bottom-0 right-0 -scale-[1]",
				].map((position) => (
					<div
						className={`absolute h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out] ${position}`}
						key={position}
					>
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground/20" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground/20" />
					</div>
				))}
			</div>
		</div>
	);
};

export default LeapComponent;
