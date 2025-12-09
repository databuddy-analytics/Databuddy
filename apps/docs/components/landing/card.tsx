import type { IconProps } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import { SciFiCard } from "@/components/scifi-card";
import { cn } from "@/lib/utils";
import { GridPatternBg } from "./grid-pattern";

type GridCard = {
	title: string;
	description: string;
	icon: ComponentType<IconProps>;
};

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
			"group relative min-h-[340px] w-full overflow-hidden rounded-none transition-all duration-500 hover:shadow-2xl hover:shadow-primary/5 sm:min-h-[380px] lg:min-h-[420px]",
			className
		)}
	>
		<div className="absolute inset-0 opacity-40 transition-opacity duration-500 group-hover:opacity-100">
			<GridPatternBg />
		</div>

		<div className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-primary/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

		<SciFiCard className="h-full border border-border/50 bg-background/50 px-5 backdrop-blur-sm transition-all duration-500 group-hover:border-primary/20 group-hover:bg-background/80 sm:px-6 lg:px-8">
			<div className="relative flex h-full flex-col items-center justify-center py-6 sm:py-8">
				<div className="mb-6 rounded-2xl border border-border/50 bg-card p-4 shadow-[inset_0_1px_3px_rgba(0,0,0,0.06)] transition-all duration-500 group-hover:scale-110 group-hover:border-primary/20 group-hover:shadow-lg group-hover:shadow-primary/10 sm:mb-8 sm:p-5">
					<Icon
						className="h-10 w-10 text-muted-foreground duration-500 group-hover:text-primary sm:h-12 sm:w-12"
						weight="duotone"
					/>
				</div>

				<h3 className="px-2 pb-3 text-center font-semibold text-2xl text-foreground duration-300 sm:pb-4 sm:text-3xl">
					{title}
				</h3>

				<p className="max-w-[280px] px-2 text-center text-base text-muted-foreground leading-relaxed duration-300 group-hover:text-foreground/80 sm:max-w-none sm:text-lg">
					{description}
				</p>
			</div>
		</SciFiCard>
	</div>
);
