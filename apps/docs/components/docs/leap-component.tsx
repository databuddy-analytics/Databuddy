"use client";

import { ArrowRightIcon, WandSparkleIcon } from "@databuddy/ui/icons";
import { Button, Card, Input } from "@databuddy/ui";

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
		<Card className="not-prose my-4 border-border/60 bg-card">
			<Card.Content className="p-4">
				<div className="mb-2 flex items-center gap-2.5">
					<div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
						<WandSparkleIcon className="size-4" />
					</div>
					<h3 className="font-medium text-foreground text-sm">
						Try Databuddy with Leap
					</h3>
				</div>

				<p className="mb-3 text-muted-foreground text-xs leading-5">
					Let Leap generate a complete application that uses Databuddy for
					analytics.
				</p>

				<div className="flex w-full flex-col gap-2 sm:flex-row">
					<Input
						className="leap-prompt-input h-9 flex-1 text-sm"
						placeholder="What do you want to build with Databuddy analytics?"
						type="text"
					/>
					<Button data-track="leap-generate" onClick={handleGenerate} size="md">
						Generate
						<ArrowRightIcon className="size-3.5" />
					</Button>
				</div>

				<div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
					<span className="text-muted-foreground">Examples:</span>
					{examples.map((example) => (
						<Button
							className="h-6 px-2 font-normal"
							key={example}
							onClick={() => handleExample(example)}
							size="sm"
							variant="ghost"
						>
							{example}
						</Button>
					))}
				</div>
			</Card.Content>
		</Card>
	);
};
