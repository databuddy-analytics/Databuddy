"use client";

import type { SessionEvent } from "@databuddy/shared/types/sessions";
import {
	CursorClickIcon,
	FileTextIcon,
	LightningIcon,
	SparkleIcon,
} from "@phosphor-icons/react";
import dayjs from "dayjs";
import { Badge } from "@/components/ui/badge";
import { cleanUrl, formatPropertyValue, getDisplayPath } from "./session-utils";

interface SessionEventTimelineProps {
	events: SessionEvent[];
}

function getEventIcon(eventName: string, hasProperties: boolean) {
	if (hasProperties) return SparkleIcon;
	switch (eventName) {
		case "screen_view":
		case "page_view":
			return FileTextIcon;
		case "click":
		case "player-page-tab":
			return CursorClickIcon;
		default:
			return LightningIcon;
	}
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
	const Icon = getEventIcon(event.event_name, hasProperties);
	const displayPath = getDisplayPath(event.path || "");
	const fullPath = cleanUrl(event.path || "");
	const time = dayjs(event.time).format("h:mm:ss A");

	return (
		<div className="grid grid-cols-[28px_16px_100px_1fr_auto_70px] items-center gap-2 px-2 py-1.5 text-sm">
			{/* Index */}
			<span className="text-right font-mono text-muted-foreground text-xs tabular-nums">
				{eventIndex + 1}
			</span>

			{/* Icon */}
			<Icon
				className={`size-4 ${hasProperties ? "text-primary" : "text-muted-foreground"}`}
			/>

			{/* Event Name */}
			<span className="truncate font-medium">
				{event.event_name}
			</span>

			{/* Path */}
			<span
				className="truncate font-mono text-muted-foreground text-xs"
				title={fullPath}
			>
				{displayPath || "—"}
			</span>

			{/* Custom Badge */}
			<div className="w-[52px]">
				{hasProperties && (
					<Badge className="bg-primary/10 text-primary text-[10px]" variant="secondary">
						Custom
					</Badge>
				)}
			</div>

			{/* Time */}
			<span className="text-right text-muted-foreground text-xs tabular-nums">
				{time}
			</span>
		</div>
	);
}

function EventProperties({
	properties,
}: {
	properties: Record<string, unknown>;
}) {
	const entries = Object.entries(properties);
	if (entries.length === 0) return null;

	return (
		<div className="ml-12 flex flex-wrap gap-1.5 pb-2">
			{entries.map(([key, value]) => (
				<div
					className="flex items-center gap-1 rounded bg-muted/50 px-1.5 py-0.5 text-xs"
					key={key}
				>
					<span className="font-mono text-muted-foreground">{key}:</span>
					<span className="font-medium text-foreground">
						{formatPropertyValue(value)}
					</span>
				</div>
			))}
		</div>
	);
}

export function SessionEventTimeline({ events }: SessionEventTimelineProps) {
	if (!events?.length) {
		return (
			<div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
				No events recorded
			</div>
		);
	}

	return (
		<div className="max-h-[280px] overflow-y-auto rounded border bg-background">
			{/* Header */}
			<div className="sticky top-0 grid grid-cols-[28px_16px_100px_1fr_auto_70px] items-center gap-2 border-b bg-accent px-2 py-1.5 text-xs font-medium text-muted-foreground">
				<span className="text-right">#</span>
				<span />
				<span>Event</span>
				<span>Path</span>
				<span className="w-[52px]" />
				<span className="text-right">Time</span>
			</div>
			{/* Events */}
			<div className="divide-y divide-border/50">
				{events.map((event, eventIndex) => (
					<div key={event.event_id || eventIndex}>
						<EventItem event={event} eventIndex={eventIndex} />
						{event.properties && Object.keys(event.properties).length > 0 && (
							<EventProperties properties={event.properties} />
						)}
					</div>
				))}
			</div>
		</div>
	);
}
