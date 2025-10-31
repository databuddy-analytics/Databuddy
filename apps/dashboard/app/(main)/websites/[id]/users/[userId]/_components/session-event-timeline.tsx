'use client';

import type { SessionEvent } from '@databuddy/shared';
import { FileTextIcon, SparkleIcon } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import {
	cleanUrl,
	formatPropertyValue,
	getDisplayPath,
	getEventIconAndColor,
} from './session-utils';

interface SessionEventTimelineProps {
	events: SessionEvent[];
}

function EventProperties({
	properties,
}: {
	properties: Record<string, unknown>;
}) {
	return (
		<div className="mt-3 rounded-lg border-2 border-accent/20 bg-accent/10 p-3">
			<div className="mb-2 flex items-center gap-2">
				<SparkleIcon className="h-4 w-4 text-accent-foreground" />
				<span className="font-semibold text-accent-foreground text-sm">
					Event Properties
				</span>
			</div>
			<div className="space-y-2">
				{Object.entries(properties).map(([key, value]) => (
					<div
						className="flex items-center gap-3 rounded border border-accent/20 bg-card/60 p-2"
						key={key}
					>
						<span className="min-w-0 truncate font-mono font-semibold text-accent-foreground text-xs">
							{key}
						</span>
						<span className="rounded bg-accent/20 px-2 py-1 font-medium text-accent-foreground text-xs">
							{formatPropertyValue(value)}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

function EventItem({
	event,
	eventIndex,
}: {
	event: SessionEvent;
	eventIndex: number;
}) {
	const hasProperties = Boolean(
		event.properties && Object.keys(event.properties).length > 0
	);
	const { icon, color, bgColor, borderColor, badgeColor } =
		getEventIconAndColor(event.event_name, hasProperties);
	const displayPath = getDisplayPath(event.path || '');
	const fullPath = cleanUrl(event.path || '');

	const eventTitle = event.event_name;
	const titleColor = hasProperties
		? 'text-accent-foreground'
		: 'text-foreground';

	return (
		<div
			className={`group flex items-start gap-3 rounded-lg border-2 p-4 ${bgColor} ${borderColor} ${hasProperties ? 'shadow-sm' : ''}`}
			key={event.event_id || eventIndex}
		>
			<div
				className={`flex h-8 w-8 items-center justify-center rounded-full border-2 bg-card font-bold text-xs ${color} flex-shrink-0 shadow-sm`}
			>
				{eventIndex + 1}
			</div>
			<div className="flex min-w-0 flex-1 items-start gap-3">
				<div className={`${color} mt-1 flex-shrink-0`}>{icon}</div>
				<div className="min-w-0 flex-1">
					<div className="mb-2 flex items-start justify-between gap-2">
						<div className="flex min-w-0 flex-wrap items-center gap-2">
							<span className={`font-semibold text-sm ${titleColor}`}>
								{eventTitle}
							</span>
							{displayPath && (
								<Badge
									className="font-mono text-xs"
									title={fullPath}
									variant="secondary"
								>
									{displayPath}
								</Badge>
							)}
							{hasProperties && (
								<Badge className={`font-medium text-xs ${badgeColor}`}>
									Custom Event
								</Badge>
							)}
						</div>
						<div className="flex-shrink-0 whitespace-nowrap font-medium text-muted-foreground text-xs">
							{new Date(event.time).toLocaleTimeString()}
						</div>
					</div>

					{hasProperties && event.properties && (
						<EventProperties properties={event.properties} />
					)}
				</div>
			</div>
		</div>
	);
}

export function SessionEventTimeline({ events }: SessionEventTimelineProps) {
	if (!events?.length) {
		return (
			<div className="py-8 text-center text-muted-foreground">
				<FileTextIcon className="mx-auto mb-2 h-8 w-8 opacity-50" />
				<p className="text-sm">No events recorded for this session</p>
			</div>
		);
	}

	return (
		<div className="max-h-96 space-y-3 overflow-y-auto">
			{events.map((event, eventIndex) => (
				<EventItem
					event={event}
					eventIndex={eventIndex}
					key={event.event_id || eventIndex}
				/>
			))}
		</div>
	);
}
