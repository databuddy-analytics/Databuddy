import { BellIcon } from "@phosphor-icons/react";

export function NotificationEmpty() {
	return (
		<div className="p-8 text-center text-muted-foreground">
			<BellIcon
				className="mx-auto mb-2 size-8 text-muted-foreground/50"
				weight="duotone"
			/>
			<p className="text-muted text-xs">No notifications yet</p>
		</div>
	);
}
