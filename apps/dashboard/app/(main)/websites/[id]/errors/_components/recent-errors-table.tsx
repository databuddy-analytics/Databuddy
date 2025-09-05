'use client';

import type { ErrorEvent } from '@databuddy/shared';
import { GlobeIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { DataTable } from '@/components/analytics/data-table';
import { CountryFlag } from '@/components/analytics/icons/CountryFlag';
import { BrowserIcon, OSIcon } from '@/components/icon';
import { Badge } from '@/components/ui/badge';
import { ErrorDetailModal } from './error-detail-modal';
import { getErrorTypeIcon } from './error-icons';
import { formatDateTime, getErrorCategory, getSeverityColor } from './utils';

interface Props {
	recentErrors: ErrorEvent[];
	isLoading: boolean;
}

export const RecentErrorsTable = ({ recentErrors, isLoading }: Props) => {
	const [selectedError, setSelectedError] = useState<ErrorEvent | null>(null);
	const [isModalOpen, setIsModalOpen] = useState(false);

	const handleViewError = (error: ErrorEvent) => {
		setSelectedError(error);
		setIsModalOpen(true);
	};

	const columns = [
		{
			id: 'message',
			accessorKey: 'message',
			header: 'Error',
			cell: (info: any) => {
				const message = info.getValue() as string;
				const row = info.row.original as ErrorEvent;
				const { type, severity } = getErrorCategory(message);

				return (
					<div className="flex max-w-md flex-col gap-2">
						<div className="flex items-center gap-2">
							<div className="flex h-5 w-5 items-center justify-center rounded bg-primary/10">
								{getErrorTypeIcon(type)}
							</div>
							<Badge className={getSeverityColor(severity)}>{type}</Badge>
							{row.stack && (
								<Badge
									className="border-sidebar-border bg-sidebar/20 text-xs"
									variant="outline"
								>
									Stack Available
								</Badge>
							)}
						</div>
						<p
							className="line-clamp-2 text-muted-foreground text-sm"
							title={message}
						>
							{message}
						</p>
					</div>
				);
			},
		},
		{
			id: 'path',
			accessorKey: 'path',
			header: 'Page',
			cell: (info: any) => {
				const url = info.getValue() as string;
				try {
					const pathname = url.startsWith('http') ? new URL(url).pathname : url;
					return (
						<span className="max-w-xs truncate font-mono text-sm" title={url}>
							{pathname}
						</span>
					);
				} catch {
					return (
						<span className="max-w-xs truncate font-mono text-sm" title={url}>
							{url}
						</span>
					);
				}
			},
		},
		{
			id: 'browser_name',
			accessorKey: 'browser_name',
			header: 'Browser',
			cell: (info: any) => {
				const browser = info.getValue() as string;
				if (!browser) {
					return <span className="text-muted-foreground text-sm">—</span>;
				}
				return (
					<div className="flex items-center gap-2">
						<BrowserIcon name={browser} size="sm" />
						<span className="text-sm">{browser}</span>
					</div>
				);
			},
		},
		{
			id: 'os_name',
			accessorKey: 'os_name',
			header: 'OS',
			cell: (info: any) => {
				const os = info.getValue() as string;
				if (!os) {
					return <span className="text-muted-foreground text-sm">—</span>;
				}
				return (
					<div className="flex items-center gap-2">
						<OSIcon name={os} size="sm" />
						<span className="text-sm">{os}</span>
					</div>
				);
			},
		},
		{
			id: 'country',
			accessorKey: 'country',
			header: 'Location',
			cell: (info: any) => {
				const row = info.row.original as ErrorEvent;
				const countryCode = row.country_code;
				const countryName = row.country_name || row.country;

				if (!(countryCode || countryName)) {
					return (
						<div className="flex items-center gap-2">
							<GlobeIcon className="h-4 w-4 text-muted-foreground" />
							<span className="text-muted-foreground text-sm">Unknown</span>
						</div>
					);
				}

				return (
					<div className="flex items-center gap-2">
						<CountryFlag country={countryCode || countryName || ''} size={16} />
						<span className="text-sm">{countryName}</span>
					</div>
				);
			},
		},
		{
			id: 'timestamp',
			accessorKey: 'timestamp',
			header: 'Time',
			cell: (info: any) => {
				const time = info.getValue() as string;
				return (
					<span className="font-mono text-sm">{formatDateTime(time)}</span>
				);
			},
		},
	];

	return (
		<>
			<DataTable
				columns={columns}
				data={recentErrors.map((error) => ({
					...error,
					name: error.message,
				}))}
				emptyMessage="No recent errors found"
				initialPageSize={10}
				isLoading={isLoading}
				minHeight={400}
				onRowAction={(row) => handleViewError(row)}
				showSearch={true}
				title="Recent Errors"
			/>

			{selectedError && (
				<ErrorDetailModal
					error={selectedError}
					isOpen={isModalOpen}
					onClose={() => {
						setIsModalOpen(false);
						setSelectedError(null);
					}}
				/>
			)}
		</>
	);
};
