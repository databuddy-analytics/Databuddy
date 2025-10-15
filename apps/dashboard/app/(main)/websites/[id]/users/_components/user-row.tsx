'use client';

import { getCountryName } from '@databuddy/shared';
import { ArrowSquareOutIcon } from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { BrowserIcon, CountryFlag, OSIcon } from '@/components/icon';
import { Badge } from '@/components/ui/badge';
import { getDeviceIcon } from '@/lib/utils';

type ProfileData = {
	visitor_id: string;
	first_visit: string;
	last_visit: string;
	total_sessions: number;
	total_pageviews: number;
	total_duration: number;
	total_duration_formatted: string;
	device: string;
	browser: string;
	os: string;
	country: string;
	region: string;
	sessions: Array<{
		session_id: string;
		session_name: string;
		first_visit: string;
		last_visit: string;
		duration: number;
		duration_formatted: string;
		page_views: number;
		unique_pages: number;
		device: string;
		browser: string;
		os: string;
		country: string;
		region: string;
		referrer: string;
		events: Array<{
			event_id: string;
			time: string;
			event_name: string;
			path: string;
			error_message?: string;
			error_type?: string;
			properties: Record<string, unknown>;
		}>;
	}>;
};

interface UserRowProps {
	user: ProfileData;
	index: number;
	websiteId: string;
}

export function UserRow({ user, index, websiteId }: UserRowProps) {
	const router = useRouter();

	const handleClick = () => {
		router.push(`/websites/${websiteId}/users/${user.visitor_id}`);
	};

	const isReturning = user.total_sessions > 1;

	return (
		<button
			className="grid w-full cursor-pointer grid-cols-12 items-center gap-4 px-4 py-4 text-left transition-all duration-200 hover:bg-muted/30"
			onClick={handleClick}
			type="button"
		>
			<div className="col-span-1">
				<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 font-semibold text-primary text-sm">
					{index + 1}
				</div>
			</div>

			<div className="col-span-2">
				<div className="flex items-center gap-2">
					<div className="min-w-0">
						<div className="truncate font-semibold text-foreground text-sm">
							{user.visitor_id.substring(0, 12)}...
						</div>
						<div className="truncate text-muted-foreground text-xs">
							ID: {user.visitor_id.slice(-8)}
						</div>
					</div>
					<ArrowSquareOutIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
				</div>
			</div>

			<div className="col-span-2">
				<div className="flex items-center gap-2">
					<CountryFlag country={user.country} size="sm" />
					<div className="min-w-0">
						<div className="truncate font-medium text-foreground text-sm">
							{getCountryName(user.country) || 'Unknown'}
						</div>
						{user.region && user.region !== 'Unknown' && (
							<div className="truncate text-muted-foreground text-xs">
								{user.region}
							</div>
						)}
					</div>
				</div>
			</div>

			<div className="col-span-2">
				<div className="flex items-center gap-2">
					<div className="flex items-center gap-1">
						{getDeviceIcon(user.device)}
						<BrowserIcon name={user.browser} size="sm" />
						<OSIcon name={user.os} size="sm" />
					</div>
					<div className="min-w-0">
						<div className="truncate font-medium text-foreground text-sm">
							{user.browser}
						</div>
						<div className="truncate text-muted-foreground text-xs">
							{user.os}
						</div>
					</div>
				</div>
			</div>

			<div className="col-span-1 text-center">
				<div className="font-semibold text-foreground text-lg">
					{user.total_sessions}
				</div>
				<div className="text-muted-foreground text-xs">sessions</div>
			</div>

			<div className="col-span-1 text-center">
				<div className="font-semibold text-foreground text-lg">
					{user.total_pageviews}
				</div>
				<div className="text-muted-foreground text-xs">pages</div>
			</div>

			<div className="col-span-1 flex justify-center">
				<Badge
					className="px-2 py-1 font-semibold text-xs"
					variant={isReturning ? 'default' : 'secondary'}
				>
					{isReturning ? 'Return' : 'New'}
				</Badge>
			</div>

			<div className="col-span-2">
				<div className="text-right">
					<div className="font-medium text-foreground text-sm">
						{user.last_visit
							? dayjs(user.last_visit).format('MMM D, YYYY')
							: 'Unknown'}
					</div>
					<div className="text-muted-foreground text-xs">
						{user.last_visit ? dayjs(user.last_visit).format('HH:mm') : ''}
					</div>
				</div>
			</div>
		</button>
	);
}
