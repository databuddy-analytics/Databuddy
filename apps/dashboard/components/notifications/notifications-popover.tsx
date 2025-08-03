import { BellIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover';
import { NotificationEmpty } from './notification-empty';
import { NotificationList } from './notification-list';
import type { AuditNotification } from './types';

const Notifications: AuditNotification[] = [];

export function NotificationsPopover() {
	const [open, setOpen] = useState(false);

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Button
					aria-label="Notifications"
					className="relative"
					size="icon"
					type="button"
					variant="ghost"
				>
					<BellIcon
						className="h-6 w-6 not-dark:text-primary"
						size={32}
						weight="duotone"
					/>
					{Notifications.length > 0 && (
						<span className="-top-1 -right-1 absolute flex h-4 w-4 items-center justify-center rounded-full bg-background font-medium text-[10px] text-primary-foreground">
							{Notifications.length}
						</span>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 bg-card p-0">
				<div className="flex items-center justify-between border-b p-4">
					<h4 className="font-medium">Notifications</h4>
					{Notifications.length > 0 && (
						<Button className="h-auto p-0 text-xs" size="sm" variant="ghost">
							Mark all as read
						</Button>
					)}
				</div>
				{Notifications.length > 0 ? (
					<NotificationList notifications={Notifications} />
				) : (
					<NotificationEmpty />
				)}
			</PopoverContent>
		</Popover>
	);
}
