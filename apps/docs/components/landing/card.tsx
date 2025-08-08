import type { IconProps } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { GridPatternBg } from './grid-pattern';

interface GridCard {
	title: string;
	description: string;
	icon: (props: IconProps) => JSX.Element;
}

interface SciFiGridCardProps extends GridCard {
	className?: string;
}

export const SciFiGridCard = ({
	title,
	description,
	icon: Icon,
	className,
}: SciFiGridCardProps) => {
	return (
		<div
			className={cn(
				'group relative w-full overflow-hidden',
				'min-h-[280px] sm:min-h-[320px] lg:min-h-[370px]',
				className
			)}
		>
			<div className="absolute inset-0">
				<GridPatternBg />
			</div>

			<div className="relative h-full border border-border bg-transparent px-4 transition-all duration-300 sm:px-6 lg:px-8">
				<div className="pointer-events-none absolute inset-0">
					<div className="absolute top-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>

					<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>

					<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>

					<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
				</div>

				<div className="relative flex h-full flex-col items-center justify-center py-6 sm:py-8">
					<div className="mb-4 rounded border border-border bg-card p-2 shadow-[inset_0_1px_3px_rgba(0,0,0,0.06)] sm:mb-6 sm:p-3">
						<Icon
							className="h-5 w-5 text-foreground/80 transition-colors duration-300 group-hover:text-foreground sm:h-6 sm:w-6"
							weight="duotone"
						/>
					</div>

					<h3 className="px-2 pb-6 text-center font-medium text-base text-foreground transition-colors duration-300 group-hover:text-foreground/90 sm:pb-8 sm:text-lg lg:pb-12">
						{title}
					</h3>

					<p className="px-2 text-center text-muted-foreground/70 text-xs leading-relaxed transition-colors duration-300 group-hover:text-muted-foreground sm:text-sm">
						{description}
					</p>
				</div>
			</div>
		</div>
	);
};
