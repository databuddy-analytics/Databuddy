import { Badge } from "@/components/ui/badge";
import {
	classForStatus,
	labelForStatus,
	type UptimeStatus,
} from "@/lib/uptime";
import { cn } from "@/lib/utils";

export function StatusPill({ status }: { status: UptimeStatus }) {
	const styles = classForStatus(status);

	return (
		<Badge
			className={cn(
				"gap-2 border px-2.5 py-1 font-medium text-xs",
				styles.badge
			)}
			variant="outline"
		>
			<span
				aria-hidden="true"
				className={cn("size-2 rounded-full", styles.dot)}
			/>
			<span className="text-balance">{labelForStatus(status)}</span>
		</Badge>
	);
}
