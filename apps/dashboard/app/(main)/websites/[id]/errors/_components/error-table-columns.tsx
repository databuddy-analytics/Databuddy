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
import { categorizeError, getSeverityColor, safeFormatDate } from './utils';

export const createNameColumn = (
	header: string,
	renderIcon?: (name: string) => React.ReactNode,
	formatText?: (name: string) => string
) => ({
	id: 'name',
	accessorKey: 'name',
	header,
	cell: (info: any) => {
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
		id: 'total_errors',
		accessorKey: 'total_errors',
		header: 'Total Errors',
		cell: (info: any) => (info.getValue() as number)?.toLocaleString(),
	},
	{
		id: 'unique_error_types',
		accessorKey: 'unique_error_types',
		header: 'Error Types',
		cell: (info: any) => (info.getValue() as number)?.toLocaleString(),
	},
	{
		id: 'affected_users',
		accessorKey: 'affected_users',
		header: 'Affected Users',
		cell: (info: any) => (info.getValue() as number)?.toLocaleString(),
	},
	{
		id: 'affected_sessions',
		accessorKey: 'affected_sessions',
		header: 'Affected Sessions',
		cell: (info: any) => (info.getValue() as number)?.toLocaleString(),
	},
];

export const createErrorTypeColumn = () => ({
	id: 'name',
	accessorKey: 'name',
	header: 'Error Message',
	cell: (info: any) => {
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

		const { type, severity } = categorizeError(message);
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
		id: 'total_occurrences',
		accessorKey: 'total_occurrences',
		header: 'Occurrences',
		cell: (info: any) => (info.getValue() as number)?.toLocaleString(),
	},
	{
		id: 'affected_users',
		accessorKey: 'affected_users',
		header: 'Users',
		cell: (info: any) => (info.getValue() as number)?.toLocaleString(),
	},
	{
		id: 'affected_sessions',
		accessorKey: 'affected_sessions',
		header: 'Sessions',
		cell: (info: any) => (info.getValue() as number)?.toLocaleString(),
	},
	{
		id: 'last_occurrence',
		accessorKey: 'last_occurrence',
		header: 'Last Seen',
		cell: (info: any) => safeFormatDate(info.getValue(), 'MMM d, HH:mm'),
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
			<PhoneIcon className="h-4 w-4 text-blue-500" size={16} weight="duotone" />
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
