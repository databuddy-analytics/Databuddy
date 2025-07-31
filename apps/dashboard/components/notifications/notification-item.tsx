import {
	AlertCircle,
	Bell,
	Database,
	FileText,
	Folder,
	MessageSquare,
	Minus,
	Table,
	TrendingDown,
	TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
	isAnalyticsNotification,
	isAuditNotification,
	isBillingNotification,
	type Notification,
} from './types';

// Helper function to get icon for resource type
function getResourceIcon(resourceType: string) {
	const type = resourceType.toLowerCase();

	if (type.includes('document') || type.includes('file')) {
		return <FileText className="h-4 w-4 text-primary" />;
	}
	if (type.includes('database') || type.includes('db')) {
		return <Database className="h-4 w-4 text-primary" />;
	}
	if (type.includes('table')) {
		return <Table className="h-4 w-4 text-primary" />;
	}
	if (type.includes('folder') || type.includes('directory')) {
		return <Folder className="h-4 w-4 text-primary" />;
	}
}

// Helper function to format percentage
function formatPercentage(value: number | undefined) {
	if (typeof value !== 'number') {
		return '';
	}
	return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

interface NotificationItemProps {
	notification: Notification;
}

export function NotificationItem({ notification }: NotificationItemProps) {
	const isAudit = isAuditNotification(notification);
	const isAnalytics = isAnalyticsNotification(notification);
	const isBilling = isBillingNotification(notification);

	// Get website and environment based on notification type
	const website = isAudit ? notification.details.website : notification.website;
	const environment = isAudit
		? notification.details.environment
		: notification.environment;

	return (
		<div
			className={cn(
				'cursor-pointer p-4 transition-colors hover:bg-accent/50',
				!notification.read && 'bg-accent/30'
			)}
		>
			<div className="flex items-start gap-3">
				<div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
					{isAudit ? (
						getResourceIcon(notification.details.resourceType)
					) : isAnalytics ? (
						notification.trend === 'up' ? (
							<TrendingUp className="h-4 w-4 text-green-500" />
						) : notification.trend === 'down' ? (
							<TrendingDown className="h-4 w-4 text-red-500" />
						) : (
							<Minus className="h-4 w-4 text-primary" />
						)
					) : isBilling ? (
						notification.usageValue &&
						notification.usageLimit &&
						notification.usageValue / notification.usageLimit > 0.9 ? (
							<AlertCircle className="h-4 w-4 text-red-500" />
						) : (
							<MessageSquare className="h-4 w-4 text-primary" />
						)
					) : (
						<Bell className="h-4 w-4 text-primary" />
					)}
				</div>
				<div className="flex-1 space-y-1">
					<div className="flex items-center gap-2">
						<p className="font-medium text-sm leading-none">
							{notification.title}
						</p>
						{website && (
							<span className="rounded-full bg-secondary px-1.5 py-0.5 text-xs">
								{website}
							</span>
						)}
						{environment && (
							<span
								className={cn(
									'rounded-full px-1.5 py-0.5 text-xs',
									environment === 'production' && 'bg-red-500/10 text-red-500',
									environment === 'staging' &&
										'bg-yellow-500/10 text-yellow-500',
									environment === 'development' &&
										'bg-green-500/10 text-green-500'
								)}
							>
								{environment}
							</span>
						)}
					</div>

					{/* Audit notification details */}
					{isAudit && (
						<div className="space-y-1 text-muted-foreground text-xs">
							{notification.description && <p>{notification.description}</p>}
							{notification.details.changes &&
								notification.details.changes.length > 0 && (
									<div className="mt-1 space-y-0.5">
										{notification.details.changes.map((change, _i) => (
											<p
												className="flex items-center gap-1"
												key={notification.id}
											>
												<span className="font-medium">{change.field}:</span>
												{change.oldValue && (
													<>
														<span className="line-through">
															{change.oldValue}
														</span>
														<span>→</span>
													</>
												)}
												<span>{change.newValue}</span>
											</p>
										))}
									</div>
								)}
						</div>
					)}

					{/* Analytics notification details */}
					{isAnalytics && (
						<div className="text-muted-foreground text-xs">
							<div className="flex items-center gap-2">
								<span className="font-medium">{notification.metric}:</span>
								<span>{notification.value}</span>
								{notification.percentageChange && (
									<span
										className={cn(
											'font-medium',
											notification.trend === 'up' && 'text-green-500',
											notification.trend === 'down' && 'text-red-500'
										)}
									>
										{formatPercentage(notification.percentageChange)}
									</span>
								)}
							</div>
						</div>
					)}

					{/* Billing notification details */}
					{isBilling && (
						<div className="text-muted-foreground text-xs">
							{notification.usageMetric &&
								notification.usageValue !== undefined &&
								notification.usageLimit && (
									<div className="space-y-1">
										<div className="flex items-center justify-between">
											<span>{notification.usageMetric}</span>
											<span>
												{notification.usageValue} / {notification.usageLimit}
											</span>
										</div>
										<div className="h-1.5 w-full rounded-full bg-primary/10">
											<div
												className={cn(
													'h-full rounded-full',
													notification.usageValue / notification.usageLimit >
														0.9
														? 'bg-red-500'
														: 'bg-primary'
												)}
												style={{
													width: `${Math.min(100, (notification.usageValue / notification.usageLimit) * 100)}%`,
												}}
											/>
										</div>
									</div>
								)}
							{notification.amount && (
								<p className="mt-1">
									Amount: ${notification.amount.toFixed(2)}
									{notification.planName && ` - ${notification.planName}`}
								</p>
							)}
						</div>
					)}

					<p className="text-muted-foreground text-xs">{notification.time}</p>
				</div>
			</div>
		</div>
	);
}
