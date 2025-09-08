import { BugIcon, UsersIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TopErrorCardProps {
	topError: {
		name: string;
		count: number;
		users: number;
	} | null;
}

export const TopErrorCard = ({ topError }: TopErrorCardProps) => {
	if (!topError) {
		return null;
	}

	return (
		<Card className="border-sidebar-border bg-sidebar/10">
			<CardHeader className="pb-3">
				<CardTitle className="flex items-center gap-3 text-base">
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
						<BugIcon className="h-4 w-4 text-primary" weight="duotone" />
					</div>
					<div className="flex flex-col gap-0.5">
						<span className="font-semibold text-sm">Most Frequent Error</span>
						<span className="font-normal text-muted-foreground text-xs">
							Top occurring error in your application
						</span>
					</div>
				</CardTitle>
			</CardHeader>
			<CardContent className="pt-0">
				<p
					className="mb-4 line-clamp-2 font-medium text-sm leading-relaxed"
					title={topError.name}
				>
					{topError.name}
				</p>
				<div className="grid grid-cols-2 gap-3">
					<div className="flex items-center gap-2 rounded-md border border-primary/10 bg-primary/5 p-2">
						<WarningCircleIcon
							className="h-3.5 w-3.5 flex-shrink-0 text-primary"
							weight="duotone"
						/>
						<div className="min-w-0">
							<div className="font-semibold text-primary text-xs">
								{(topError.count || 0).toLocaleString()}
							</div>
							<div className="text-muted-foreground text-xs">occurrences</div>
						</div>
					</div>
					<div className="flex items-center gap-2 rounded-md border border-chart-2/10 bg-chart-2/5 p-2">
						<UsersIcon
							className="h-3.5 w-3.5 flex-shrink-0 text-chart-2"
							weight="duotone"
						/>
						<div className="min-w-0">
							<div className="font-semibold text-chart-2 text-xs">
								{(topError.users || 0).toLocaleString()}
							</div>
							<div className="text-muted-foreground text-xs">
								users affected
							</div>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
};
