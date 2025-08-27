'use client';

import {
	ArrowClockwiseIcon,
	CheckIcon,
	DatabaseIcon,
	PlusIcon,
} from '@phosphor-icons/react';
import { Card, CardContent } from '@/components/ui/card';

interface ExtensionStatsProps {
	stats: {
		installed: number;
		available: number;
		updates: number;
	};
	isLoading?: boolean;
}

function StatCard({
	title,
	value,
	icon,
	variant = 'default',
}: {
	title: string;
	value: number;
	icon: React.ReactNode;
	variant?: 'default' | 'success' | 'warning' | 'info';
}) {
	const variantStyles = {
		default: 'border-border bg-card',
		success:
			'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20',
		warning:
			'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20',
		info: 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20',
	};

	const iconStyles = {
		default: 'text-muted-foreground',
		success: 'text-green-600',
		warning: 'text-amber-600',
		info: 'text-blue-600',
	};

	return (
		<Card
			className={`rounded transition-all duration-200 hover:shadow-md ${variantStyles[variant]}`}
		>
			<CardContent>
				<div className="flex items-center space-x-3">
					<div
						className={`rounded-lg border border-current/20 bg-current/10 p-3 ${iconStyles[variant]}`}
					>
						{icon}
					</div>
					<div>
						<p className="font-bold text-2xl">{value.toLocaleString()}</p>
						<p className="text-muted-foreground text-sm">{title}</p>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

export function ExtensionStats({ stats, isLoading }: ExtensionStatsProps) {
	if (isLoading) {
		return (
			<div className="grid gap-4 md:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<Card className="rounded" key={i.toString()}>
						<CardContent className="p-6">
							<div className="flex items-center space-x-3">
								<div className="h-12 w-12 animate-pulse rounded-lg bg-muted" />
								<div className="space-y-2">
									<div className="h-6 w-12 animate-pulse rounded bg-muted" />
									<div className="h-4 w-20 animate-pulse rounded bg-muted" />
								</div>
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		);
	}

	return (
		<div className="grid gap-4 md:grid-cols-4">
			<StatCard
				icon={<CheckIcon className="h-5 w-5" />}
				title="Installed Extensions"
				value={stats.installed}
				variant="success"
			/>
			<StatCard
				icon={<PlusIcon className="h-5 w-5" />}
				title="Available Extensions"
				value={stats.available}
				variant="info"
			/>
			<StatCard
				icon={<ArrowClockwiseIcon className="h-5 w-5" />}
				title="Updates Available"
				value={stats.updates}
				variant={stats.updates > 0 ? 'warning' : 'default'}
			/>
			<StatCard
				icon={<DatabaseIcon className="h-5 w-5" />}
				title="Total Extensions"
				value={stats.installed + stats.available}
				variant="default"
			/>
		</div>
	);
}
