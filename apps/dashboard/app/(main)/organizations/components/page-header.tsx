'use client';

import { type Icon } from '@phosphor-icons/react';
import { type ReactNode } from 'react';

interface PageHeaderProps {
	icon: Icon;
	title: string;
	description: string;
	action?: ReactNode;
}

export function PageHeader({ icon: Icon, title, description, action }: PageHeaderProps) {
	return (
		<div className="border-b bg-gradient-to-r from-background via-background to-muted/20">
			<div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center sm:gap-0 sm:px-6 sm:py-6">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-3 sm:gap-4">
						<div className="rounded border border-primary/20 bg-primary/10 p-2 sm:p-3">
							<Icon
								className="h-5 w-5 text-primary sm:h-6 sm:w-6"
								size={20}
								weight="duotone"
							/>
						</div>
						<div>
							<h1 className="truncate font-bold text-xl text-foreground tracking-tight sm:text-2xl lg:text-3xl">
								{title}
							</h1>
							<p className="mt-1 text-muted-foreground text-xs sm:text-sm lg:text-base">
								{description}
							</p>
						</div>
					</div>
				</div>
				{action && (
					<div className="w-full sm:w-auto">
						{action}
					</div>
				)}
			</div>
		</div>
	);
}
