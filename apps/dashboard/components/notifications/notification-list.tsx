import { NotificationItem } from './notification-item';
import type { AuditNotification } from './types';

interface NotificationListProps {
	notifications: AuditNotification[];
}

export function NotificationList({ notifications }: NotificationListProps) {
	return (
		<div className="divide-y divide-border">
			{notifications.map((notification) => (
				<NotificationItem key={notification.id} notification={notification} />
			))}
		</div>
	);
}
