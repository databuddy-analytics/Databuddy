'use client';

import { PlusIcon, TargetIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
	onCreateGoal: () => void;
}

export function EmptyState({ onCreateGoal }: EmptyStateProps) {
	return (
		<Card className="fade-in-50 animate-in rounded-xl border-2 border-dashed bg-gradient-to-br from-background to-muted/20 duration-700">
			<CardContent className="flex flex-col items-center justify-center px-8 py-16">
				<div className="group relative mb-8">
					<div className="rounded-full border-2 border-primary/20 bg-primary/10 p-6 transition-transform duration-300 group-hover:scale-105">
						<TargetIcon
							className="h-16 w-16 text-primary"
							size={16}
							weight="duotone"
						/>
					</div>
					<div className="-top-2 -right-2 absolute animate-pulse rounded-full border-2 border-primary/20 bg-background p-2 shadow-sm">
						<PlusIcon className="h-6 w-6 text-primary" size={16} />
					</div>
				</div>
				<div className="max-w-md space-y-4 text-center">
					<h3 className="font-semibold text-2xl text-foreground">
						No goals yet
					</h3>
					<p className="text-muted-foreground leading-relaxed">
						Track conversions like sign-ups, purchases, or button clicks
						to measure key user actions and optimize your conversion rates.
					</p>
					<div className="pt-2">
						<Button
							className={cn(
								'gap-2 rounded-lg px-8 py-4 font-medium text-base',
								'bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary',
								'group relative overflow-hidden transition-all duration-300'
							)}
							onClick={onCreateGoal}
							size="lg"
						>
							<div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-white/0 via-white/20 to-white/0 transition-transform duration-700 group-hover:translate-x-[100%]" />
							<PlusIcon
								className="relative z-10 h-5 w-5 transition-transform duration-300 group-hover:rotate-90"
								size={16}
							/>
							<span className="relative z-10">Create Your First Goal</span>
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
