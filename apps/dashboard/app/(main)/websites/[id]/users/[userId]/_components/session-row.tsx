'use client';

import {
	ArrowSquareOutIcon,
	CaretDownIcon,
	CaretRightIcon,
	EyeIcon,
	SparkleIcon,
} from '@phosphor-icons/react';
import lazy from 'next/dynamic';
import React, { useCallback } from 'react';
import { FaviconImage } from '@/components/analytics/favicon-image';
import { Badge } from '@/components/ui/badge';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { generateSessionName } from './generate-session-name';
import { SessionEventTimeline } from './session-event-timeline';

import type {
	RawSessionEventTuple,
	Session,
	SessionEvent,
	SessionReferrer,
	SessionRowProps,
} from '@databuddy/shared';
import { BrowserIcon, CountryFlag, OSIcon } from '@/components/icon';
import { getDeviceIcon } from '@/lib/utils';

function transformSessionEvents(
	events: RawSessionEventTuple[]
): SessionEvent[] {
	return events
		.map((tuple) => {
			if (!Array.isArray(tuple) || tuple.length < 5) {
				return null;
			}

			const [event_id, time, event_name, path, properties] = tuple;

			let propertiesObj: Record<string, unknown> = {};
			if (properties) {
				try {
					propertiesObj = JSON.parse(properties);
				} catch {
					// Keep empty object if parsing fails
				}
			}

			return {
				event_id,
				time,
				event_name,
				path,
				properties: propertiesObj,
			};
		})
		.filter((event): event is SessionEvent => event !== null);
}

function getReferrerInfo(session: Session): SessionReferrer {
	if (session.referrer_parsed) {
		return {
			name:
				session.referrer_parsed.name ||
				session.referrer_parsed.domain ||
				'Unknown',
			domain: session.referrer_parsed.domain || null,
		};
	}

	if (session.referrer) {
		try {
			const url = new URL(session.referrer);
			return {
				name: url.hostname,
				domain: url.hostname,
			};
		} catch {
			return {
				name: 'Direct',
				domain: null,
			};
		}
	}

	return {
		name: 'Direct',
		domain: null,
	};
}

function SessionRowInternal({
	session,
	index,
	isExpanded,
	onToggle,
}: SessionRowProps) {
	const events =
		Array.isArray(session.events) &&
		session.events.length > 0 &&
		Array.isArray(session.events[0])
			? transformSessionEvents(session.events as RawSessionEventTuple[])
			: (session.events as SessionEvent[]);

	const customEventCount =
		events?.filter(
			(event) =>
				!['screen_view', 'page_exit', 'web_vitals', 'link_out'].includes(
					event.event_name
				)
		).length || 0;
	const referrerInfo = getReferrerInfo(session);

	const handleToggle = useCallback(() => {
		onToggle(session.session_id);
	}, [onToggle, session.session_id]);

	const sessionDisplayName = generateSessionName(session.session_id);

	return (
		<Collapsible onOpenChange={handleToggle} open={isExpanded}>
			<CollapsibleTrigger asChild>
				<div className="group flex cursor-pointer items-center justify-between border-transparent border-l-4 p-5 hover:border-primary/20 hover:bg-muted/30">
					<div className="flex min-w-0 flex-1 items-center gap-4">
						<div className="flex flex-shrink-0 items-center gap-3">
							<div>
								{isExpanded ? (
									<CaretDownIcon className="h-4 w-4 text-muted-foreground" />
								) : (
									<CaretRightIcon className="h-4 w-4 text-muted-foreground" />
								)}
							</div>
							<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 font-semibold text-primary text-sm">
								{index + 1}
							</div>
						</div>
						<div className="flex flex-shrink-0 items-center gap-2">
							<CountryFlag country={session.country_code} size="md" />
							{getDeviceIcon(session.device_type)}
							<BrowserIcon name={session.browser_name} size="md" />
							<OSIcon name={session.os_name} size="md" />
						</div>

						<div className="min-w-0 flex-1">
							<div className="truncate font-semibold text-base text-foreground">
								{sessionDisplayName}
							</div>
							<div className="flex items-center gap-2 text-muted-foreground text-sm">
								<span>{session.browser_name || 'Unknown'}</span>
								<span className="text-muted-foreground/60">•</span>
								<span>
									{session.country_name || session.country || 'Unknown'}
								</span>
								{session.is_returning_visitor && (
									<>
										<span className="text-muted-foreground/60">•</span>
										<span className="font-medium text-blue-600">Returning</span>
									</>
								)}
							</div>
						</div>

						<div className="hidden min-w-[120px] flex-shrink-0 items-center gap-2 lg:flex">
							<div className="flex items-center gap-2">
								{referrerInfo.domain ? (
									<FaviconImage
										className="flex-shrink-0"
										domain={referrerInfo.domain}
										size={16}
									/>
								) : (
									<ArrowSquareOutIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
								)}
								<span className="truncate text-muted-foreground text-sm">
									{referrerInfo.name}
								</span>
							</div>
						</div>
					</div>

					<div className="ml-4 flex flex-shrink-0 items-center gap-4 text-sm">
						<div className="hidden min-w-[60px] flex-col items-center gap-1 sm:flex">
							<div className="flex items-center gap-1 text-muted-foreground text-xs">
								<EyeIcon className="h-3 w-3" />
								<span>Pages</span>
							</div>
							<span className="font-semibold text-foreground text-sm">
								{session.page_views}
							</span>
						</div>

						<div className="flex min-w-[60px] flex-col items-center gap-1">
							<div className="text-muted-foreground text-xs">Events</div>
							<div className="flex items-center gap-2">
								<Badge
									className="px-2 py-1 font-semibold text-xs"
									variant="outline"
								>
									{events.length}
								</Badge>
							</div>
						</div>
					</div>
				</div>
			</CollapsibleTrigger>

			<CollapsibleContent>
				<div className="border-t bg-muted/20 px-4 pb-4">
					<div className="grid grid-cols-1 gap-4 border-b py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
						<div className="text-center">
							<span className="mb-2 block text-muted-foreground text-xs uppercase tracking-wide">
								Page Views
							</span>
							<div className="font-bold text-foreground text-lg">
								{session.page_views}
							</div>
						</div>
						<div className="text-center">
							<span className="mb-2 block text-muted-foreground text-xs uppercase tracking-wide">
								Visitor Type
							</span>
							<div className="font-medium text-foreground">
								{session.is_returning_visitor ? (
									<span className="font-semibold text-blue-600">Returning</span>
								) : (
									<span className="font-semibold text-green-600">New</span>
								)}
							</div>
						</div>
						<div className="text-center">
							<span className="mb-2 block text-muted-foreground text-xs uppercase tracking-wide">
								Session #
							</span>
							<div className="font-bold text-foreground text-lg">
								#{session.visitor_session_count || 1}
							</div>
						</div>
						<div className="text-center">
							<span className="mb-2 block text-muted-foreground text-xs uppercase tracking-wide">
								Referrer
							</span>
							<div className="flex items-center justify-center gap-2">
								{referrerInfo.domain ? (
									<FaviconImage
										className="flex-shrink-0"
										domain={referrerInfo.domain}
										size={16}
									/>
								) : (
									<ArrowSquareOutIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
								)}
								<span className="truncate font-medium text-foreground text-sm">
									{referrerInfo.name}
								</span>
							</div>
						</div>
					</div>

					<div className="pt-6">
						<div className="mb-6 flex items-center justify-between">
							<h4 className="font-semibold text-foreground text-lg">
								Event Timeline
							</h4>
							<div className="flex items-center gap-3">
								<div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2">
									<span className="font-bold text-slate-800 text-sm">
										{events.length}
									</span>
									<span className="text-slate-600 text-xs">total events</span>
								</div>
								{customEventCount > 0 && (
									<div className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-100 to-purple-100 px-3 py-2">
										<SparkleIcon className="h-4 w-4 text-violet-600" />
										<span className="font-bold text-sm text-violet-800">
											{customEventCount}
										</span>
										<span className="text-violet-600 text-xs">custom</span>
									</div>
								)}
							</div>
						</div>

						<SessionEventTimeline events={events} />
					</div>
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

export const SessionRow = React.memo(SessionRowInternal);
