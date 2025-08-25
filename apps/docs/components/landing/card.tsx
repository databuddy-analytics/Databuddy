import type { IconProps } from '@phosphor-icons/react';
import type { ComponentType } from 'react';
import { cn } from '@/lib/utils';
import { GridPatternBg } from './grid-pattern';

interface GridCard {
	title: string;
	description: string;
	icon: ComponentType<IconProps>;
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
				'min-h-[340px] sm:min-h-[380px] lg:min-h-[420px]',
				className
			)}
		>
			<div className="absolute inset-0">
				<GridPatternBg />
			</div>

			<div className="relative h-full border border-border bg-transparent px-5 transition-all duration-300 sm:px-6 lg:px-8">
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
					<div className="mb-6 rounded border border-border bg-card p-4 shadow-[inset_0_1px_3px_rgba(0,0,0,0.06)] sm:mb-8 sm:p-5">
						<Icon
							className="h-10 w-10 text-foreground/80 transition-colors duration-300 group-hover:text-foreground sm:h-12 sm:w-12"
							weight="duotone"
						/>
					</div>

					<h3 className="px-2 pb-2 text-center font-medium text-2xl text-foreground transition-colors duration-300 group-hover:text-foreground/90 sm:pb-2 sm:text-3xl">
						{title}
					</h3>

					<p className="px-2 text-center text-base text-muted-foreground/70 leading-relaxed transition-colors duration-300 group-hover:text-muted-foreground sm:text-lg">
						{description}
					</p>
				</div>
			</div>
		</div>
	);
};
