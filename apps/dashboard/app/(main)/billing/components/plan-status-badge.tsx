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
		return <Badge variant="warning">Cancellation scheduled</Badge>;
	}
	if (isScheduled) {
		return <Badge variant="muted">Scheduled</Badge>;
	}
	return <Badge variant="success">Active</Badge>;
}
