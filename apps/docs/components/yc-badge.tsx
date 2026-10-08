import Image from "next/image";
import { cn } from "@/lib/utils";

export function YcBadge({ className }: { className?: string }) {
	return (
		<a
			className={cn(
				"group inline-flex w-fit items-center gap-2.5 rounded border border-border/60 bg-foreground/5 p-1.5 pr-2 font-mono text-[11px] text-muted-foreground uppercase tracking-wider backdrop-blur transition-colors duration-200 ease-in-out hover:border-border hover:text-foreground sm:text-xs",
				className
			)}
			href="https://www.ycombinator.com/companies/databuddy"
			rel="noopener noreferrer"
			target="_blank"
		>
			<Image
				alt=""
				className="size-5 rounded-[3px]"
				height={20}
				src="/social/ycombinator.svg"
				width={20}
			/>
			<span>
				Backed by <span className="text-foreground">Y Combinator</span>
			</span>
			<span aria-hidden className="h-3 w-px bg-border" />
			<span>F26</span>
		</a>
	);
}
