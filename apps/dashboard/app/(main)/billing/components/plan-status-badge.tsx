import { Badge } from "@/components/ui/badge";

type PlanStatusBadgeProps = {
	isCanceled: boolean;
	isScheduled: boolean;
};

export function PlanStatusBadge({
	isCanceled,
	isScheduled,
}: PlanStatusBadgeProps) {
	if (isCanceled) {
		return (
			<Badge className="bg-destructive/10 text-destructive" variant="secondary">
				Cancelling
			</Badge>
		);
	}
	if (isScheduled) {
		return <Badge variant="secondary">Scheduled</Badge>;
	}
	return (
		<Badge className="bg-primary/10 text-primary" variant="secondary">
			Active
		</Badge>
	);
}
