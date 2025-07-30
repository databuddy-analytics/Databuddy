import { BellIcon } from '@phosphor-icons/react';

export function NotificationEmpty() {
	return (
		<div className="p-8 text-center text-muted-foreground">
			<BellIcon
				className="mx-auto mb-2 h-10 w-10 not-dark:text-primary opacity-50"
				size={32}
				weight="duotone"
			/>
			<p>No notifications yet</p>
		</div>
	);
}
