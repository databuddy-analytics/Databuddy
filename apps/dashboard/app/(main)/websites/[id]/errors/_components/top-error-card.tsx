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
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<BugIcon
						className="h-5 w-5 text-yellow-500"
						size={16}
						weight="duotone"
					/>
					Most Frequent Error
				</CardTitle>
			</CardHeader>
			<CardContent>
				<p className="line-clamp-2 font-medium text-sm" title={topError.name}>
					{topError.name}
				</p>
				<div className="mt-3 flex items-center justify-between text-muted-foreground text-xs">
					<span className="flex items-center gap-1 font-semibold">
						<WarningCircleIcon className="h-3 w-3" size={16} weight="duotone" />
						{(topError.count || 0).toLocaleString()} times
					</span>
					<span className="flex items-center gap-1">
						<UsersIcon className="h-3 w-3" size={16} weight="duotone" />
						{(topError.users || 0).toLocaleString()} users
					</span>
				</div>
			</CardContent>
		</Card>
	);
};
