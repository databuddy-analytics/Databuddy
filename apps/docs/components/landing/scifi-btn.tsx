'use client';

import { Slot } from '@radix-ui/react-slot';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface SciFiButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	asChild?: boolean;
}

const SciFiButton = forwardRef<HTMLButtonElement, SciFiButtonProps>(
	({ className, asChild = false, children, ...props }, ref) => {
		const Comp = asChild ? Slot : 'button';

		return (
			<div className="group relative inline-block">
				<Comp
					className={cn(
						'relative inline-flex cursor-pointer items-center justify-center gap-2 overflow-hidden whitespace-nowrap font-medium text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
						'h-9 rounded px-4 py-2',
						'bg-foreground/5 text-foreground backdrop-blur-[50px]',
						'shadow-[0px_-82px_68px_-109px_inset_rgba(255,255,255,0.3),0px_98px_100px_-170px_inset_rgba(255,255,255,0.6),0px_4px_18px_-8px_inset_rgba(255,255,255,0.6),0px_1px_40px_-14px_inset_rgba(255,255,255,0.3)]',
						'border border-border hover:animate-[borderGlitch_0.6s_ease-in-out]',
						'text-center font-normal tracking-[-0.18px]',
						'active:scale-[0.98]',
						className
					)}
					ref={ref}
					{...(asChild
						? {}
						: {
								type:
									(props as React.ButtonHTMLAttributes<HTMLButtonElement>)
										.type ?? 'button',
							})}
					{...props}
				>
					{children}
				</Comp>

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
			</div>
		);
	}
);

SciFiButton.displayName = 'SciFiButton';

export { SciFiButton };
