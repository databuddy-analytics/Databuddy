import {
	BugIcon,
	MonitorIcon,
	PhoneIcon,
	TableIcon,
} from '@phosphor-icons/react';
import { CountryFlag } from '@/components/analytics/icons/CountryFlag';
import { BrowserIcon, OSIcon } from '@/components/icon';
import { Badge } from '@/components/ui/badge';
import { getErrorTypeIcon } from './error-icons';
import { formatDateTime, getErrorCategory, getSeverityColor } from './utils';

type CellInfo<T = unknown> = {
	getValue: () => T;
	row?: { original?: Record<string, unknown> };
};

export const createNameColumn = (
	header: string,
	renderIcon?: (name: string) => React.ReactNode,
	formatText?: (name: string) => string
) => ({
	id: 'name',
	accessorKey: 'name',
	header,
	cell: (info: CellInfo<string>) => {
		const name = info.getValue() as string;
		const safeName = name || 'Unknown';
		const displayText = formatText ? formatText(safeName) : safeName;
		return (
			<div className="flex items-center gap-2">
				{renderIcon?.(safeName)}
				<div className="max-w-xs truncate font-medium" title={safeName}>
					{displayText}
				</div>
			</div>
		);
	},
});

export const errorColumns = [
	{
		id: 'errors',
		accessorKey: 'errors',
		header: 'Total Errors',
		cell: (info: CellInfo<number>) => {
			const errors = info.getValue();
			return (
				<div className="flex flex-col">
					<span className="font-medium">{errors?.toLocaleString()}</span>
					<span className="text-muted-foreground text-xs">
						{errors > 500
							? 'Critical'
							: errors > 100
								? 'High'
								: errors > 20
									? 'Medium'
									: 'Low'}
					</span>
				</div>
			);
		},
	},
	{
		id: 'users',
		accessorKey: 'users',
		header: 'Affected Users',
		cell: (info: CellInfo<number>) => {
			const users = info.getValue();
			const errors = info.row?.original?.errors as number;
			const errorRate = errors > 0 ? ((users / errors) * 100).toFixed(1) : '0';

			return (
				<div className="flex flex-col">
					<span className="font-medium">{users?.toLocaleString()}</span>
					<span className="text-muted-foreground text-xs">
						{errorRate}% error rate
					</span>
				</div>
			);
		},
	},
];

export const createErrorTypeColumn = () => ({
	id: 'name',
	accessorKey: 'name',
	header: 'Error Message',
	cell: (info: CellInfo<string>) => {
		const message = info.getValue() as string;
		if (!message) {
			return (
				<div className="flex flex-col gap-1">
					<div className="flex items-center gap-2">
						<BugIcon className="h-4 w-4" size={16} weight="duotone" />
						<Badge className="border-gray-200 bg-gray-100 text-gray-800">
							Unknown Error
						</Badge>
					</div>
					<p className="text-muted-foreground text-sm">
						No error message available
					</p>
				</div>
			);
		}

		const { type, severity } = getErrorCategory(message);
		return (
			<div className="flex flex-col gap-1">
				<div className="flex items-center gap-2">
					{getErrorTypeIcon(type)}
					<Badge className={getSeverityColor(severity)}>{type}</Badge>
				</div>
				<p
					className="line-clamp-2 max-w-md text-muted-foreground text-sm"
					title={message}
				>
					{message}
				</p>
			</div>
		);
	},
});

export const createErrorTypeColumns = () => [
	createErrorTypeColumn(),
	{
		id: 'count',
		accessorKey: 'count',
		header: 'Occurrences',
		cell: (info: CellInfo<number>) => {
			const count = info.getValue();
			return (
				<div className="flex flex-col">
					<span className="font-medium">{count?.toLocaleString()}</span>
					<span className="text-muted-foreground text-xs">
						{count > 1000 ? 'High frequency' : count > 100 ? 'Medium' : 'Low'}
					</span>
				</div>
			);
		},
	},
	{
		id: 'users',
		accessorKey: 'users',
		header: 'Affected Users',
		cell: (info: CellInfo<number>) => {
			const users = info.getValue();
			return (
				<div className="flex flex-col">
					<span className="font-medium">{users?.toLocaleString()}</span>
					<span className="text-muted-foreground text-xs">
						{users > 50 ? 'Widespread' : users > 10 ? 'Multiple' : 'Limited'}
					</span>
				</div>
			);
		},
	},
	{
		id: 'last_seen',
		accessorKey: 'last_seen',
		header: 'Last Occurrence',
		cell: (info: CellInfo<string>) => {
			const lastSeen = info.getValue();
			const formatted = formatDateTime(lastSeen);
			const now = new Date();
			const lastSeenDate = new Date(lastSeen);
			const diffHours = Math.floor(
				(now.getTime() - lastSeenDate.getTime()) / (1000 * 60 * 60)
			);

			let timeAgo = '';
			if (diffHours < 1) {
				timeAgo = 'Just now';
			} else if (diffHours < 24) {
				timeAgo = `${diffHours}h ago`;
			} else {
				const diffDays = Math.floor(diffHours / 24);
				timeAgo = `${diffDays}d ago`;
			}

			return (
				<div className="flex flex-col">
					<span className="font-medium">{formatted}</span>
					<span className="text-muted-foreground text-xs">{timeAgo}</span>
				</div>
			);
		},
	},
];

export const createDeviceColumn = () =>
	createNameColumn('Device Type', (name) => {
		if (!name) {
			return (
				<MonitorIcon
					className="h-4 w-4 text-gray-500"
					size={16}
					weight="duotone"
				/>
			);
		}

		const device = name.toLowerCase();
		return device.includes('mobile') || device.includes('phone') ? (
			<PhoneIcon
				className="h-4 w-4 text-foreground"
				size={16}
				weight="duotone"
			/>
		) : device.includes('tablet') ? (
			<TableIcon
				className="h-4 w-4 text-purple-500"
				size={16}
				weight="duotone"
			/>
		) : (
			<MonitorIcon
				className="h-4 w-4 text-gray-500"
				size={16}
				weight="duotone"
			/>
		);
	});

export const createBrowserColumn = () =>
	createNameColumn('Browser', (name) => <BrowserIcon name={name} size="sm" />);

export const createOSColumn = () =>
	createNameColumn('Operating System', (name) => (
		<OSIcon name={name} size="sm" />
	));

export const createCountryColumn = () =>
	createNameColumn('Country', (name) => (
		<CountryFlag country={name} size={16} />
	));

export const createPageColumn = () =>
	createNameColumn('Page', undefined, (name) => {
		try {
			return name.startsWith('http') ? new URL(name).pathname : name;
		} catch {
			return name.startsWith('/') ? name : `/${name}`;
		}
	});
