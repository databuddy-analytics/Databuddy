import { Badge } from "@databuddy/ui";

interface PlanStatusBadgeProps {
	isCanceled: boolean;
	isScheduled: boolean;
}

export function PlanStatusBadge({
	isCanceled,
	isScheduled,
}: PlanStatusBadgeProps) {
	if (isCanceled) {
		return <Badge variant="destructive">Cancellation scheduled</Badge>;
	}
	if (isScheduled) {
		return <Badge variant="default">Scheduled</Badge>;
	}
	return <Badge variant="success">Active</Badge>;
}
