import { cn } from '@/lib/utils';

interface SciFiCardProps extends React.ComponentProps<'div'> {
	children: React.ReactNode;
	opacity?: 'full' | 'reduced';
	size?: 'sm' | 'md';
	className?: string;
	variant?: 'foreground' | 'primary';
	cornerOpacity?: string;
	cornerColor?: string;
}

export function SciFiCard({
	children,
	opacity = 'full',
	size = 'md',
	className,
	variant = 'foreground',
	cornerOpacity,
	cornerColor,
	...props
}: SciFiCardProps) {
	let bgClass: string;
	if (variant === 'primary') {
		bgClass = 'bg-primary/40';
	} else {
		bgClass = opacity === 'reduced' ? 'bg-foreground/20' : 'bg-foreground';
	}
	const cornerSize = size === 'sm' ? 'h-0.5 w-0.5' : 'h-2 w-2';
	const lineClasses =
		size === 'sm'
			? { horizontal: 'h-0.5 w-0.5', vertical: 'h-0.5 w-0.5' }
			: { horizontal: 'h-0.5 w-1.5', vertical: 'h-2 w-0.5' };

	const cornerClasses = cn(
		'group-hover:animate-[cornerGlitch_0.6s_ease-in-out]',
		cornerOpacity && [
			cornerOpacity,
			'transition-all duration-300 group-hover:opacity-100',
		]
	);

	return (
		<div className={cn('group relative', className)} {...props}>
			{children}
			<div className="pointer-events-none absolute inset-0">
				<div className={cn('absolute top-0 left-0', cornerSize, cornerClasses)}>
					<Corner
						bgClass={bgClass}
						cornerColor={cornerColor}
						lineClasses={lineClasses}
					/>
				</div>
				<div
					className={cn(
						'-scale-x-[1] absolute top-0 right-0',
						cornerSize,
						cornerClasses
					)}
				>
					<Corner
						bgClass={bgClass}
						cornerColor={cornerColor}
						lineClasses={lineClasses}
					/>
				</div>
				<div
					className={cn(
						'-scale-y-[1] absolute bottom-0 left-0',
						cornerSize,
						cornerClasses
					)}
				>
					<Corner
						bgClass={bgClass}
						cornerColor={cornerColor}
						lineClasses={lineClasses}
					/>
				</div>
				<div
					className={cn(
						'-scale-[1] absolute right-0 bottom-0',
						cornerSize,
						cornerClasses
					)}
				>
					<Corner
						bgClass={bgClass}
						cornerColor={cornerColor}
						lineClasses={lineClasses}
					/>
				</div>
			</div>
		</div>
	);
}

function Corner({
	lineClasses,
	bgClass,
	cornerColor,
}: {
	lineClasses: { horizontal: string; vertical: string };
	bgClass: string;
	cornerColor?: string;
}) {
	return (
		<>
			<div
				className={cn(
					'absolute top-0 left-0.5 origin-left',
					lineClasses.horizontal,
					bgClass,
					cornerColor
				)}
			/>
			<div
				className={cn(
					'absolute top-0 left-0 origin-top',
					lineClasses.vertical,
					bgClass,
					cornerColor
				)}
			/>
		</>
	);
}
