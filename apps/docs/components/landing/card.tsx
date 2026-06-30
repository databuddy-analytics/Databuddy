import type { ComponentType, SVGProps } from "react";
import { SciFiCard } from "@/components/scifi-card";
import { cn } from "@/lib/utils";
import { GridPatternBg } from "./grid-pattern";

interface GridCard {
	description: string;
	icon: ComponentType<SVGProps<SVGSVGElement>>;
	title: string;
}

type SciFiGridCardProps = GridCard & {
	className?: string;
};

export const SciFiGridCard = ({
	title,
	description,
	icon: Icon,
	className,
}: SciFiGridCardProps) => (
	<div
		className={cn(
			"group relative min-h-[240px] w-full overflow-hidden transition-transform duration-300 hover:-translate-y-0.5 sm:min-h-[260px]",
			className
		)}
	>
		<div className="absolute inset-0 opacity-20">
			<GridPatternBg />
		</div>

		<div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

		<SciFiCard
			className="h-full border border-border/60 bg-card/45 px-5 backdrop-blur-sm transition-colors duration-300 group-hover:border-foreground/15 group-hover:bg-card/65 sm:px-6"
			cornerOpacity="opacity-35"
		>
			<div className="relative flex h-full flex-col items-start justify-between py-5 sm:py-6">
				<div className="mb-8 flex size-11 items-center justify-center rounded-sm border border-border/60 bg-background/60 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors duration-300 group-hover:border-foreground/15 group-hover:text-foreground sm:size-12">
					<Icon className="size-5 sm:size-6" />
				</div>

				<div>
					<h3 className="mb-2 font-semibold text-foreground text-xl leading-tight tracking-tight sm:text-2xl">
						{title}
					</h3>

					<p className="max-w-sm text-muted-foreground text-sm leading-relaxed sm:text-base">
						{description}
					</p>
				</div>
			</div>
		</SciFiCard>
	</div>
);
