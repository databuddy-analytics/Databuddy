"use client";

import dynamic from "next/dynamic";
import { CHATGPT_PROMPT_URL } from "@/app/util/constants";
import { YCLogo } from "@/components/icons/yc-logo";
import DemoContainer from "./demo";
import { SciFiButton } from "./scifi-btn";
import { Spotlight } from "./spotlight";

const WorldMap = dynamic(() => import("./map").then((m) => m.WorldMap), {
	ssr: false,
	loading: () => null,
});

export default function Hero() {
	return (
		<section className="relative flex min-h-svh w-full flex-col items-center overflow-hidden">
			<Spotlight transform="translateX(-60%) translateY(-50%)" />

			<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
				<div className="grid grid-cols-1 items-center gap-8 pt-16 pb-10 sm:pt-20 sm:pb-12 lg:grid-cols-2 lg:gap-12 lg:pt-28 lg:pb-16 xl:gap-16">
					{/* Text Content */}
					<div className="order-2 flex flex-col items-center gap-8 text-center lg:order-1 lg:items-start lg:gap-10 lg:text-left">
						<div className="fade-in slide-in-from-bottom-4 animate-in self-center duration-700 lg:self-start">
							<div className="group inline-flex cursor-default items-center rounded-full border border-border/50 bg-background/60 px-4 py-1.5 font-medium text-muted-foreground text-xs shadow-sm backdrop-blur-md transition-colors hover:bg-background/80 hover:text-foreground">
								<span className="mr-1.5 opacity-70">Rejected by</span>
								<YCLogo className="mr-1.5 inline-block h-3.5 w-3.5 align-[-2px] grayscale transition-all group-hover:grayscale-0" />
								<span className="font-semibold tracking-tight">Combinator</span>
							</div>
						</div>

						<h1 className="fade-in slide-in-from-bottom-6 animate-in text-balance font-bold text-4xl leading-[1.1] tracking-tight delay-100 duration-700 sm:text-6xl md:text-7xl lg:text-7xl xl:text-[80px]">
							<span className="block whitespace-normal">
								Privacy <span className="text-muted-foreground">first</span>
							</span>
							<span className="block whitespace-normal">
								Analytics for{" "}
								<span className="text-muted-foreground">devs</span>
							</span>
						</h1>

						<p className="fade-in slide-in-from-bottom-6 max-w-prose animate-in text-balance font-medium text-base text-muted-foreground leading-relaxed tracking-tight delay-200 duration-700 sm:text-lg lg:text-xl">
							Track users, not identities. Get fast, accurate insights with zero
							cookies and 100% GDPR compliance.
						</p>

						<div className="fade-in slide-in-from-bottom-6 flex w-full animate-in justify-center pt-4 delay-300 duration-700 lg:justify-start">
							<SciFiButton
								asChild
								className="w-full px-8 py-6 text-lg sm:w-auto"
							>
								<a
									href="https://app.databuddy.cc/login"
									rel="noopener noreferrer"
									target="_blank"
								>
									GET STARTED
								</a>
							</SciFiButton>
						</div>
					</div>

					{/* Map Visualization */}
					<div className="fade-in zoom-in-95 order-1 flex w-full animate-in justify-center delay-200 duration-1000 lg:order-2 lg:justify-end">
						<div className="w-full max-w-lg lg:max-w-none">
							<WorldMap />
						</div>
					</div>
				</div>
			</div>

			{/* Demo Container */}
			<div className="fade-in slide-in-from-bottom-8 mx-auto w-full max-w-7xl animate-in px-4 pb-12 delay-500 duration-1000 sm:px-6 lg:px-8 lg:pb-20">
				<DemoContainer />
			</div>
			<div className="mx-auto w-full border-t bg-secondary/30 px-4 py-4 sm:px-6 lg:px-8">
				<div className="flex justify-center">
					<a
						className="text-muted-foreground text-sm underline underline-offset-4 transition-colors hover:text-foreground"
						href={CHATGPT_PROMPT_URL}
						rel="noopener noreferrer"
						target="_blank"
					>
						Don't understand what this does? Ask ChatGPT
					</a>
				</div>
			</div>
		</section>
	);
}
